//! Shared HTTP client, download host allowlist and hash-verified streaming downloads.

use super::*;

pub const USER_AGENT: &str = concat!("PETABLOCKS-Launcher/", env!("CARGO_PKG_VERSION"));

/// Shared HTTP client with a 15-second connect timeout and no global body timeout.
/// Per-chunk read timeouts (30s) are enforced during streaming downloads so slow connections
/// never fail on large files.
pub(crate) static HTTP_CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_else(|_| Client::new())
});

pub fn http_client() -> &'static Client {
    &HTTP_CLIENT
}

/// Expected hash algorithms supported by `download_to`.
#[derive(Debug, Clone, Copy)]
pub enum ExpectedHash<'a> {
    None,
    Sha1(&'a str),
    Sha256(&'a str),
    Sha512(&'a str),
}

impl<'a> ExpectedHash<'a> {
    pub fn from_mod(m: &'a LauncherMod) -> Self {
        if let Some(s512) = m.sha512.as_deref().filter(|s| s.len() == 128) {
            ExpectedHash::Sha512(s512)
        } else if let Some(s256) = m.sha256.as_deref().filter(|s| s.len() == 64) {
            ExpectedHash::Sha256(s256)
        } else if !m.sha1.trim().is_empty() {
            ExpectedHash::Sha1(m.sha1.trim())
        } else {
            ExpectedHash::None
        }
    }
}

/// Strictly allowlist download hosts for mods, modpack archives, Mojang assets, NeoForge, and Adoptium.
pub fn is_allowed_download_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let host_and_path = rest;
    let (host, path) = match host_and_path.find('/') {
        Some(idx) => (&host_and_path[..idx], &host_and_path[idx..]),
        None => (host_and_path, "/"),
    };
    let host_lower = host.to_ascii_lowercase();
    match host_lower.as_str() {
        "cdn.modrinth.com"
        | "files.petablocks.com"
        | "piston-meta.mojang.com"
        | "piston-data.mojang.com"
        | "libraries.minecraft.net"
        | "resources.download.minecraft.net"
        | "maven.neoforged.net"
        | "api.adoptium.net"
        | "objects.githubusercontent.com"
        | "release-assets.githubusercontent.com" => true,
        "github.com" | "raw.githubusercontent.com" => {
            let p_lower = path.to_ascii_lowercase();
            p_lower.starts_with("/petablocks/") || p_lower.starts_with("/adoptium/")
        }
        _ => false,
    }
}

/// Stream `url` directly to disk (`<dest>.part.<pid>`), enforcing:
/// - HTTPS host allowlist (`is_allowed_download_url`)
/// - 30-second per-chunk read timeout (so large files succeed on slow links)
/// - Incremental SHA-1 / SHA-256 / SHA-512 verification while streaming
/// - Atomic rename into `dest`
pub async fn download_to(
    client: &Client,
    url: &str,
    dest: &Path,
    expected: ExpectedHash<'_>,
) -> Result<(), String> {
    if !is_allowed_download_url(url) {
        return Err(format!("Blocked download from untrusted URL: {url}"));
    }
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    let pid = std::process::id();
    let mut tmp_os = dest.as_os_str().to_owned();
    tmp_os.push(format!(".part.{pid}"));
    let tmp = PathBuf::from(tmp_os);

    let mut last = String::new();
    for attempt in 0..3u64 {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_millis(800 * attempt)).await;
        }
        let mut resp = match client.get(url).send().await.and_then(|r| r.error_for_status()) {
            Ok(r) => r,
            Err(e) => {
                last = format!("GET {url}: {e}");
                continue;
            }
        };

        let mut file = match tokio::fs::File::create(&tmp).await {
            Ok(f) => f,
            Err(e) => {
                last = format!("Create {}: {e}", tmp.display());
                continue;
            }
        };

        let mut sha1_h = Sha1::new();
        let mut sha256_h = Sha256::new();
        let mut sha512_h = Sha512::new();
        let mut stream_err: Option<String> = None;

        loop {
            match tokio::time::timeout(Duration::from_secs(30), resp.chunk()).await {
                Ok(Ok(Some(chunk))) => {
                    match expected {
                        ExpectedHash::Sha1(_) => sha1_h.update(&chunk),
                        ExpectedHash::Sha256(_) => sha256_h.update(&chunk),
                        ExpectedHash::Sha512(_) => sha512_h.update(&chunk),
                        ExpectedHash::None => {}
                    }
                    if let Err(e) = file.write_all(&chunk).await {
                        stream_err = Some(format!("Write {}: {e}", tmp.display()));
                        break;
                    }
                }
                Ok(Ok(None)) => break,
                Ok(Err(e)) => {
                    stream_err = Some(format!("Read {url}: {e}"));
                    break;
                }
                Err(_) => {
                    stream_err = Some(format!("Read timed out (30s idle) for {url}"));
                    break;
                }
            }
        }

        if let Some(err) = stream_err {
            drop(file);
            let _ = tokio::fs::remove_file(&tmp).await;
            last = err;
            continue;
        }

        let _ = file.flush().await;
        let _ = file.sync_all().await;
        drop(file);

        let hash_ok = match expected {
            ExpectedHash::None => true,
            ExpectedHash::Sha1(exp) => {
                let got = hex::encode(sha1_h.finalize());
                if !got.eq_ignore_ascii_case(exp) {
                    last = format!("SHA-1 mismatch for {url} (expected {exp}, got {got})");
                    false
                } else {
                    true
                }
            }
            ExpectedHash::Sha256(exp) => {
                let got = hex::encode(sha256_h.finalize());
                if !got.eq_ignore_ascii_case(exp) {
                    last = format!("SHA-256 mismatch for {url} (expected {exp}, got {got})");
                    false
                } else {
                    true
                }
            }
            ExpectedHash::Sha512(exp) => {
                let got = hex::encode(sha512_h.finalize());
                if !got.eq_ignore_ascii_case(exp) {
                    last = format!("SHA-512 mismatch for {url} (expected {exp}, got {got})");
                    false
                } else {
                    true
                }
            }
        };

        if !hash_ok {
            let _ = tokio::fs::remove_file(&tmp).await;
            continue;
        }

        tokio::fs::rename(&tmp, dest)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let _ = tokio::fs::remove_file(&tmp).await;
    Err(last)
}

pub fn verify_file_hash(path: &Path, expected: ExpectedHash<'_>) -> bool {
    let Ok(mut f) = File::open(path) else {
        return false;
    };
    let mut buf = [0u8; 65536];
    match expected {
        ExpectedHash::None => true,
        ExpectedHash::Sha1(exp) => {
            let mut h = Sha1::new();
            loop {
                let Ok(n) = f.read(&mut buf) else { return false };
                if n == 0 {
                    break;
                }
                h.update(&buf[..n]);
            }
            hex::encode(h.finalize()).eq_ignore_ascii_case(exp)
        }
        ExpectedHash::Sha256(exp) => {
            let mut h = Sha256::new();
            loop {
                let Ok(n) = f.read(&mut buf) else { return false };
                if n == 0 {
                    break;
                }
                h.update(&buf[..n]);
            }
            hex::encode(h.finalize()).eq_ignore_ascii_case(exp)
        }
        ExpectedHash::Sha512(exp) => {
            let mut h = Sha512::new();
            loop {
                let Ok(n) = f.read(&mut buf) else { return false };
                if n == 0 {
                    break;
                }
                h.update(&buf[..n]);
            }
            hex::encode(h.finalize()).eq_ignore_ascii_case(exp)
        }
    }
}
