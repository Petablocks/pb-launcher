use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha1::{Digest as _, Sha1};
use sha2::{Sha256, Sha512};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

const CONCURRENT_DOWNLOADS: usize = 6;
pub const USER_AGENT: &str = concat!("PETABLOCKS-Launcher/", env!("CARGO_PKG_VERSION"));

/// Shared HTTP client with a 15-second connect timeout and no global body timeout.
/// Per-chunk read timeouts (30s) are enforced during streaming downloads so slow connections
/// never fail on large files.
static HTTP_CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_else(|_| Client::new())
});

/// Mutex serializing all read-modify-write operations on `launcher-state.json` and `settings.json`.
pub static STATE_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

/// Active instances currently syncing or running a game process.
static ACTIVE_INSTANCES: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

/// Active sync operations count (for CloseRequested warning).
static ACTIVE_SYNCS: LazyLock<Mutex<usize>> = LazyLock::new(|| Mutex::new(0));

pub fn http_client() -> &'static Client {
    &HTTP_CLIENT
}

/// RAII guard that registers an instance ID as active (syncing or running) and removes it on drop.
pub struct InstanceActionGuard {
    instance_id: String,
    is_sync: bool,
}

impl InstanceActionGuard {
    pub fn try_acquire(instance_id: &str, is_sync: bool) -> Result<Self, String> {
        let mut active = ACTIVE_INSTANCES
            .lock()
            .map_err(|_| "Internal lock poisoned".to_string())?;
        if !active.insert(instance_id.to_string()) {
            return Err(format!(
                "Instance '{instance_id}' is already syncing or running."
            ));
        }
        if is_sync {
            if let Ok(mut s) = ACTIVE_SYNCS.lock() {
                *s = s.saturating_add(1);
            }
        }
        Ok(Self {
            instance_id: instance_id.to_string(),
            is_sync,
        })
    }
}

impl Drop for InstanceActionGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = ACTIVE_INSTANCES.lock() {
            active.remove(&self.instance_id);
        }
        if self.is_sync {
            if let Ok(mut s) = ACTIVE_SYNCS.lock() {
                *s = s.saturating_sub(1);
            }
        }
    }
}

pub fn is_any_sync_active() -> bool {
    ACTIVE_SYNCS.lock().map(|g| *g > 0).unwrap_or(false)
}

/// Append a timestamped diagnostic message to `%LOCALAPPDATA%\PETABLOCKS Launcher\launcher.log`.
pub fn log_event(level: &str, msg: &str) {
    let root = launcher_root();
    let _ = fs::create_dir_all(&root);
    let log_path = root.join("launcher.log");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(f, "[{now}] [{level}] {msg}");
    }
}

/// Atomically write `data` to `dest` via a temporary sibling file + `sync_all()` + `fs::rename`.
pub fn atomic_write(dest: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let mut tmp_os = dest.as_os_str().to_owned();
    tmp_os.push(format!(".tmp.{pid}.{nanos}"));
    let tmp_path = PathBuf::from(tmp_os);

    {
        let mut f = File::create(&tmp_path).map_err(|e| e.to_string())?;
        f.write_all(data).map_err(|e| e.to_string())?;
        let _ = f.sync_all();
    }

    fs::rename(&tmp_path, dest).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        e.to_string()
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherMod {
    pub slug: String,
    pub path: String,
    pub url: String,
    pub sha1: String,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub sha512: Option<String>,
    pub size: u64,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub optional: bool,
    #[serde(default = "default_true")]
    pub default: bool,
    #[serde(default)]
    pub notes: String,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherManifest {
    pub format_version: u32,
    pub version: String,
    pub name: String,
    pub minecraft: String,
    pub loader: String,
    pub neoforge: String,
    pub mrpack_url: String,
    #[serde(default)]
    pub mrpack_sha256: Option<String>,
    #[serde(default)]
    pub mrpack_size: Option<u64>,
    pub mods: Vec<LauncherMod>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstanceState {
    pub installed_version: Option<String>,
    pub disabled_mods: Vec<String>,
    #[serde(default)]
    pub total_playtime_seconds: u64,
    #[serde(default)]
    pub sessions_played: u32,
    #[serde(default)]
    pub last_played_epoch: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub instance_id: String,
    pub stage: String,
    pub current: usize,
    pub total: usize,
    pub detail: String,
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

/// Validate a manifest mod `path` so it is strictly `mods/<safe-filename>.jar` and cannot escape
/// the instance directory on Windows or Unix.
pub fn validate_mod_rel_path(rel: &str) -> Result<PathBuf, String> {
    let trimmed = rel.trim();
    let Some(fname) = trimmed.strip_prefix("mods/") else {
        return Err(format!("Rejected mod path outside mods/: {rel}"));
    };
    if !is_safe_component(fname) || !fname.to_ascii_lowercase().ends_with(".jar") {
        return Err(format!("Rejected unsafe mod filename: {rel}"));
    }
    Ok(PathBuf::from("mods").join(fname))
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

/// Primary launcher data directory under `%LOCALAPPDATA%\PETABLOCKS Launcher`.
pub fn launcher_root() -> PathBuf {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("PETABLOCKS Launcher")
}

/// One-time migration from `%APPDATA%\PETABLOCKS Launcher` (Roaming) to `%LOCALAPPDATA%\PETABLOCKS Launcher`.
/// Also merges any missing files/directories if both folders exist (for example if the launcher was
/// updated while running and Roaming could not be renamed atomically).
pub fn migrate_roaming_to_local() {
    let Some(local_base) = dirs::data_local_dir() else {
        return;
    };
    let Some(roaming_base) = dirs::data_dir() else {
        return;
    };
    if local_base == roaming_base {
        return;
    }
    let local_dir = local_base.join("PETABLOCKS Launcher");
    let roaming_dir = roaming_base.join("PETABLOCKS Launcher");
    if !roaming_dir.exists() {
        return;
    }
    if let Some(parent) = local_dir.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if !local_dir.exists() && fs::rename(&roaming_dir, &local_dir).is_ok() {
        log_event(
            "INFO",
            "Migrated launcher data root from Roaming AppData to LocalAppData.",
        );
        return;
    }

    // Fallback: merge any missing files/folders from Roaming into LocalAppData
    let mut moved_any = false;
    merge_dir_into(&roaming_dir, &local_dir, &mut moved_any);
    if moved_any {
        log_event(
            "INFO",
            "Merged remaining launcher data from Roaming AppData into LocalAppData.",
        );
    }
}

fn merge_dir_into(src: &Path, dst: &Path, moved_any: &mut bool) {
    let Ok(entries) = fs::read_dir(src) else {
        return;
    };
    let _ = fs::create_dir_all(dst);
    for entry in entries.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            if !dst_path.exists() && fs::rename(&src_path, &dst_path).is_ok() {
                *moved_any = true;
                continue;
            }
            merge_dir_into(&src_path, &dst_path, moved_any);
            let _ = fs::remove_dir(&src_path);
        } else if !dst_path.exists() {
            if fs::rename(&src_path, &dst_path).is_ok() {
                *moved_any = true;
            } else if fs::copy(&src_path, &dst_path).is_ok() {
                let _ = fs::remove_file(&src_path);
                *moved_any = true;
            }
        }
    }
    let _ = fs::remove_dir(src);
}

/// Reject anything that could escape the instances folder (ids/filenames come from the webview).
pub fn is_safe_component(s: &str) -> bool {
    !s.is_empty() && s != "." && s != ".." && !s.contains(['/', '\\', ':', '\0'])
}

/// Strict validator for version identifiers (`minecraft_version`, `neoforge_version`, `instance_id`).
pub fn validate_version_token(name: &str, val: &str) -> Result<(), String> {
    let v = val.trim();
    if v.is_empty() || v.len() > 64 {
        return Err(format!("Invalid {name}: empty or too long."));
    }
    if v.contains("..")
        || !v
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
    {
        return Err(format!("Invalid characters in {name}: {val}"));
    }
    Ok(())
}

pub fn instance_dir(instance_id: &str) -> PathBuf {
    let id = if is_safe_component(instance_id) {
        instance_id
    } else {
        "invalid-instance"
    };
    launcher_root().join("instances").join(id)
}

fn state_path(instance_id: &str) -> PathBuf {
    instance_dir(instance_id).join("launcher-state.json")
}

fn cached_manifest_path(instance_id: &str) -> PathBuf {
    instance_dir(instance_id).join("launcher-manifest.json")
}

pub fn load_state(instance_id: &str) -> InstanceState {
    let _guard = STATE_LOCK.lock().ok();
    load_state_unlocked(instance_id)
}

fn load_state_unlocked(instance_id: &str) -> InstanceState {
    let p = state_path(instance_id);
    let Ok(raw) = fs::read_to_string(&p) else {
        return InstanceState::default();
    };
    match serde_json::from_str::<InstanceState>(&raw) {
        Ok(st) => st,
        Err(e) => {
            log_event(
                "WARN",
                &format!("Corrupt launcher-state.json for {instance_id}: {e}; backing up."),
            );
            let backup = p.with_extension("json.corrupt");
            let _ = fs::copy(&p, backup);
            InstanceState::default()
        }
    }
}

fn save_state_unlocked(instance_id: &str, state: &InstanceState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    atomic_write(&state_path(instance_id), json.as_bytes())
}

async fn fetch_staging_manifest_url(client: &reqwest::Client) -> Option<String> {
    let res = client
        .get("https://api.github.com/repos/Petablocks/petablocks-modpack-s2/releases?per_page=5")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let releases: Vec<serde_json::Value> = res.json().await.ok()?;
    let newest = releases
        .into_iter()
        .find(|r| !r["draft"].as_bool().unwrap_or(false))?;
    let assets = newest["assets"].as_array()?;
    for asset in assets {
        if asset["name"].as_str() == Some("launcher-manifest.json") {
            if let Some(url) = asset["browser_download_url"].as_str() {
                return Some(url.to_string());
            }
        }
    }
    None
}

pub async fn fetch_manifest(
    instance_id: &str,
    manifest_url: &str,
) -> Result<LauncherManifest, String> {
    validate_version_token("instance_id", instance_id)?;
    let client = http_client();
    let staging = tokio::task::spawn_blocking(crate::settings::is_staging_channel)
        .await
        .unwrap_or(false);

    // Only fetch the instance's own configured manifest URL (never fall back across different modpacks!)
    let mut candidate_urls = Vec::new();
    if staging && instance_id == "petablocks-s2" {
        if let Some(staging_url) = fetch_staging_manifest_url(client).await {
            if is_allowed_download_url(&staging_url) {
                candidate_urls.push(staging_url);
            }
        }
    }
    let trimmed = manifest_url.trim();
    if !trimmed.is_empty() && is_allowed_download_url(trimmed) {
        candidate_urls.push(trimmed.to_string());
    }
    if instance_id == "petablocks-s2" {
        let s2_fallback = "https://github.com/Petablocks/petablocks-modpack-s2/releases/latest/download/launcher-manifest.json".to_string();
        if !candidate_urls.contains(&s2_fallback) {
            candidate_urls.push(s2_fallback);
        }
        let s2_dist = "https://github.com/Petablocks/pb-modpacks/releases/latest/download/launcher-manifest.json".to_string();
        if !candidate_urls.contains(&s2_dist) {
            candidate_urls.push(s2_dist);
        }
    } else if instance_id == "petablocks-create2" {
        let c2_fallback = "https://github.com/Petablocks/pb-modpacks/releases/latest/download/launcher-manifest-create2.json".to_string();
        if !candidate_urls.contains(&c2_fallback) {
            candidate_urls.push(c2_fallback);
        }
    }

    for url in &candidate_urls {
        if let Ok(res) = client.get(url).send().await {
            if res.status().is_success() {
                if let Ok(text) = res.text().await {
                    if let Ok(manifest) = serde_json::from_str::<LauncherManifest>(&text) {
                        // Validate all mod paths in the manifest before accepting or caching it
                        for m in &manifest.mods {
                            validate_mod_rel_path(&m.path)?;
                            if !m.url.trim().is_empty() && !is_allowed_download_url(m.url.trim()) {
                                return Err(format!(
                                    "Manifest mod '{}' contains disallowed download URL: {}",
                                    m.slug, m.url
                                ));
                            }
                        }
                        let _ = atomic_write(&cached_manifest_path(instance_id), text.as_bytes());
                        return Ok(manifest);
                    }
                }
            }
        }
    }

    // Fallback to cached local manifest for this specific instance only
    let cached = cached_manifest_path(instance_id);
    if let Ok(text) = fs::read_to_string(&cached) {
        if let Ok(manifest) = serde_json::from_str::<LauncherManifest>(&text) {
            for m in &manifest.mods {
                validate_mod_rel_path(&m.path)?;
            }
            return Ok(manifest);
        }
    }
    Err(format!(
        "Unable to fetch modpack manifest for '{instance_id}' (and no local cache found)."
    ))
}

pub async fn fetch_changelog(instance_id: &str, changelog_url: &str) -> Result<String, String> {
    validate_version_token("instance_id", instance_id)?;
    let client = http_client();
    let mut candidate_urls = Vec::new();
    if !changelog_url.trim().is_empty() && is_allowed_download_url(changelog_url.trim()) {
        candidate_urls.push(changelog_url.trim().to_string());
    }
    if instance_id == "petablocks-s2" {
        candidate_urls.push(
            "https://raw.githubusercontent.com/Petablocks/petablocks-modpack-s2/main/CHANGELOG.md"
                .to_string(),
        );
    }

    for url in &candidate_urls {
        if let Ok(res) = client.get(url).send().await {
            if res.status().is_success() {
                if let Ok(text) = res.text().await {
                    if !text.trim().is_empty() && !text.contains("404: Not Found") {
                        let cache_file = instance_dir(instance_id).join("CHANGELOG.md");
                        let _ = atomic_write(&cache_file, text.as_bytes());
                        return Ok(text);
                    }
                }
            }
        }
    }

    let cache_file = instance_dir(instance_id).join("CHANGELOG.md");
    if let Ok(text) = fs::read_to_string(cache_file) {
        if !text.trim().is_empty() {
            return Ok(text);
        }
    }

    Err("No changelog available for this modpack.".into())
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

pub fn set_mod_enabled(
    instance_id: &str,
    slug: &str,
    enabled: bool,
) -> Result<InstanceState, String> {
    let state = {
        let _guard = STATE_LOCK
            .lock()
            .map_err(|_| "State lock poisoned".to_string())?;
        let mut st = load_state_unlocked(instance_id);
        st.disabled_mods.retain(|s| s != slug);
        if !enabled {
            st.disabled_mods.push(slug.to_string());
        }
        save_state_unlocked(instance_id, &st)?;
        st
    };

    // Also rename on disk immediately if present
    if let Ok(text) = fs::read_to_string(cached_manifest_path(instance_id)) {
        if let Ok(manifest) = serde_json::from_str::<LauncherManifest>(&text) {
            if let Some(m) = manifest.mods.iter().find(|m| m.slug == slug && m.optional) {
                if let Ok(rel_mod_path) = validate_mod_rel_path(&m.path) {
                    let base = instance_dir(instance_id);
                    let active_path = base.join(&rel_mod_path);
                    let disabled_path =
                        base.join(format!("{}.disabled", rel_mod_path.to_string_lossy()));
                    if enabled && disabled_path.exists() && !active_path.exists() {
                        let _ = fs::rename(&disabled_path, &active_path);
                    } else if !enabled && active_path.exists() {
                        let _ = fs::rename(&active_path, &disabled_path);
                    }
                }
            }
        }
    }

    Ok(state)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomModFile {
    pub filename: String,
    pub size: u64,
}

pub fn list_custom_mods(instance_id: &str) -> Result<Vec<CustomModFile>, String> {
    let custom_dir = instance_dir(instance_id).join("mods").join("custom");
    fs::create_dir_all(&custom_dir).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(&custom_dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    out.push(CustomModFile {
                        filename: entry.file_name().to_string_lossy().to_string(),
                        size: meta.len(),
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(out)
}

pub fn open_custom_mods_dir(instance_id: &str) -> Result<String, String> {
    let custom_dir = instance_dir(instance_id).join("mods").join("custom");
    fs::create_dir_all(&custom_dir).map_err(|e| e.to_string())?;
    Ok(custom_dir.to_string_lossy().to_string())
}

pub fn record_session_start(instance_id: &str) -> InstanceState {
    let _guard = STATE_LOCK.lock().ok();
    let mut state = load_state_unlocked(instance_id);
    state.sessions_played = state.sessions_played.saturating_add(1);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    state.last_played_epoch = Some(now);
    let _ = save_state_unlocked(instance_id, &state);
    state
}

pub fn add_playtime_delta(instance_id: &str, delta_seconds: u64) -> InstanceState {
    let _guard = STATE_LOCK.lock().ok();
    let mut state = load_state_unlocked(instance_id);
    if delta_seconds > 0 {
        state.total_playtime_seconds = state.total_playtime_seconds.saturating_add(delta_seconds);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        state.last_played_epoch = Some(now);
        let _ = save_state_unlocked(instance_id, &state);
    }
    state
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackEntry {
    pub filename: String,
    pub clean_name: String,
    pub size: u64,
    pub enabled: bool,
    pub active: bool,
    pub kind: String, // "shader" or "resourcepack"
}

fn read_active_shader(base_dir: &Path) -> Option<String> {
    let iris_cfg = base_dir.join("config").join("iris.properties");
    let content = fs::read_to_string(iris_cfg).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(val) = trimmed.strip_prefix("shaderPack=") {
            let v = val.trim();
            if !v.is_empty() && v != "(off)" && v != "off" {
                return Some(v.to_string());
            }
            return None;
        }
    }
    None
}

pub fn set_active_shader(instance_id: &str, shader_filename: Option<&str>) -> Result<(), String> {
    if let Some(name) = shader_filename {
        if !is_safe_component(name) {
            return Err("Invalid shader filename.".into());
        }
    }
    let base_dir = instance_dir(instance_id);
    let cfg_dir = base_dir.join("config");
    fs::create_dir_all(&cfg_dir).map_err(|e| e.to_string())?;
    let iris_cfg = cfg_dir.join("iris.properties");
    let target_val = shader_filename.unwrap_or("(off)");
    let enable_val = if shader_filename.is_some() {
        "true"
    } else {
        "false"
    };

    let existing = fs::read_to_string(&iris_cfg).unwrap_or_default();
    let mut out_lines = Vec::new();
    let mut found_pack = false;
    let mut found_enable = false;

    for line in existing.lines() {
        if line.trim_start().starts_with("shaderPack=") {
            out_lines.push(format!("shaderPack={target_val}"));
            found_pack = true;
        } else if line.trim_start().starts_with("enableShaders=") {
            out_lines.push(format!("enableShaders={enable_val}"));
            found_enable = true;
        } else {
            out_lines.push(line.to_string());
        }
    }
    if !found_pack {
        out_lines.push(format!("shaderPack={target_val}"));
    }
    if !found_enable {
        out_lines.push(format!("enableShaders={enable_val}"));
    }
    atomic_write(&iris_cfg, out_lines.join("\n").as_bytes())
}

pub fn list_packs(instance_id: &str) -> Result<Vec<PackEntry>, String> {
    let base_dir = instance_dir(instance_id);
    let shader_dir = base_dir.join("shaderpacks");
    let rp_dir = base_dir.join("resourcepacks");
    let _ = fs::create_dir_all(&shader_dir);
    let _ = fs::create_dir_all(&rp_dir);

    let active_shader = read_active_shader(&base_dir);
    let mut out = Vec::new();

    for (dir, kind) in [(&shader_dir, "shader"), (&rp_dir, "resourcepack")] {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let Ok(meta) = entry.metadata() else { continue };
                if !meta.is_file() {
                    continue;
                }
                let raw_name = entry.file_name().to_string_lossy().to_string();
                if raw_name.ends_with(".txt") || raw_name.contains(".part.") || raw_name.contains(".tmp.") {
                    continue;
                }
                let enabled = !raw_name.ends_with(".disabled");
                let base_filename = raw_name
                    .strip_suffix(".disabled")
                    .unwrap_or(&raw_name)
                    .to_string();
                let clean_name = base_filename
                    .strip_suffix(".zip")
                    .unwrap_or(&base_filename)
                    .replace('_', " ");
                let active = if kind == "shader" {
                    enabled && active_shader.as_deref() == Some(base_filename.as_str())
                } else {
                    enabled
                };
                out.push(PackEntry {
                    filename: base_filename,
                    clean_name,
                    size: meta.len(),
                    enabled,
                    active,
                    kind: kind.to_string(),
                });
            }
        }
    }

    out.sort_by(|a, b| {
        a.kind
            .cmp(&b.kind)
            .then_with(|| a.clean_name.cmp(&b.clean_name))
    });
    Ok(out)
}

pub fn set_pack_enabled(
    instance_id: &str,
    kind: &str,
    filename: &str,
    enabled: bool,
) -> Result<Vec<PackEntry>, String> {
    if !is_safe_component(filename) {
        return Err("Invalid pack filename.".into());
    }
    let base_dir = instance_dir(instance_id);
    let folder = if kind == "shader" {
        "shaderpacks"
    } else {
        "resourcepacks"
    };
    let dir = base_dir.join(folder);
    let active_path = dir.join(filename);
    let disabled_path = dir.join(format!("{filename}.disabled"));

    if enabled && disabled_path.exists() && !active_path.exists() {
        fs::rename(&disabled_path, &active_path).map_err(|e| e.to_string())?;
    } else if !enabled && active_path.exists() {
        fs::rename(&active_path, &disabled_path).map_err(|e| e.to_string())?;
        if kind == "shader" && read_active_shader(&base_dir).as_deref() == Some(filename) {
            let _ = set_active_shader(instance_id, None);
        }
    }
    list_packs(instance_id)
}

pub fn open_packs_dir(instance_id: &str, kind: &str) -> Result<String, String> {
    let folder = if kind == "shader" {
        "shaderpacks"
    } else {
        "resourcepacks"
    };
    let dir = instance_dir(instance_id).join(folder);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

pub async fn sync_instance(
    app: AppHandle,
    instance_id: String,
    manifest_url: String,
) -> Result<InstanceState, String> {
    validate_version_token("instance_id", &instance_id)?;
    let _instance_guard = InstanceActionGuard::try_acquire(&instance_id, true)?;

    let emit = |stage: &str, current: usize, total: usize, detail: &str| {
        let _ = app.emit(
            "sync-progress",
            SyncProgress {
                instance_id: instance_id.clone(),
                stage: stage.to_string(),
                current,
                total,
                detail: detail.to_string(),
            },
        );
    };

    emit("manifest", 0, 1, "Fetching modpack manifest...");
    let manifest = fetch_manifest(&instance_id, &manifest_url).await?;
    let state_snapshot = load_state(&instance_id);
    let base_dir = instance_dir(&instance_id);
    fs::create_dir_all(base_dir.join("mods").join("custom")).map_err(|e| e.to_string())?;

    let disabled_set: HashSet<String> = state_snapshot.disabled_mods.iter().cloned().collect();

    // 1. Offload mod hash verification and optional mod toggling to a blocking thread pool
    emit("mods", 0, manifest.mods.len(), "Verifying installed mods...");
    let mods_clone = manifest.mods.clone();
    let base_for_check = base_dir.clone();
    let to_download: Vec<LauncherMod> = tokio::task::spawn_blocking(move || {
        let mut queue = Vec::new();
        for m in &mods_clone {
            let rel_path = validate_mod_rel_path(&m.path)?;
            let is_disabled = m.optional && disabled_set.contains(&m.slug);
            let active_path = base_for_check.join(&rel_path);
            let disabled_path =
                base_for_check.join(format!("{}.disabled", rel_path.to_string_lossy()));

            if is_disabled {
                if active_path.exists() {
                    let _ = fs::rename(&active_path, &disabled_path);
                }
                continue;
            } else if disabled_path.exists() && !active_path.exists() {
                let _ = fs::rename(&disabled_path, &active_path);
            }

            let valid = verify_file_hash(&active_path, ExpectedHash::from_mod(m));
            if !valid && !m.url.trim().is_empty() {
                queue.push(m.clone());
            }
        }
        Ok::<Vec<LauncherMod>, String>(queue)
    })
    .await
    .map_err(|e| e.to_string())??;

    // 2. Download missing or outdated mods in parallel using JoinSet (aborts siblings on error)
    let total_dl = to_download.len();
    if total_dl > 0 {
        let sem = Arc::new(Semaphore::new(CONCURRENT_DOWNLOADS));
        let client = http_client().clone();
        let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut join_set = JoinSet::new();

        for m in to_download {
            let sem = sem.clone();
            let client = client.clone();
            let base = base_dir.clone();
            let app = app.clone();
            let inst = instance_id.clone();
            let completed = completed.clone();

            join_set.spawn(async move {
                let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
                let rel_path = validate_mod_rel_path(&m.path)?;
                let dest = base.join(&rel_path);
                let expected = ExpectedHash::from_mod(&m);
                download_to(&client, m.url.trim(), &dest, expected)
                    .await
                    .map_err(|e| format!("{}: {e}", m.slug))?;
                let done = completed.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                let _ = app.emit(
                    "sync-progress",
                    SyncProgress {
                        instance_id: inst,
                        stage: "mods".into(),
                        current: done,
                        total: total_dl,
                        detail: format!("Downloaded {} ({done}/{total_dl})", m.slug),
                    },
                );
                Ok::<(), String>(())
            });
        }

        while let Some(res) = join_set.join_next().await {
            match res {
                Ok(Ok(())) => {}
                Ok(Err(err)) => {
                    join_set.abort_all();
                    return Err(err);
                }
                Err(join_err) => {
                    join_set.abort_all();
                    return Err(join_err.to_string());
                }
            }
        }
    }

    // 3. Apply overrides from .mrpack if version changed or if shaderpacks/options are missing
    let mut overrides_ok = true;
    let shaderpacks_dir = base_dir.join("shaderpacks");
    let has_shaderpacks = fs::read_dir(&shaderpacks_dir)
        .map(|mut d| d.any(|e| e.is_ok()))
        .unwrap_or(false);
    let needs_overrides = state_snapshot.installed_version.as_deref() != Some(&manifest.version)
        || !has_shaderpacks
        || !base_dir.join("options.txt").exists();
    if needs_overrides {
        emit("overrides", 0, 1, "Applying modpack configs & overrides...");
        if let Err(e) = apply_mrpack_overrides(&instance_id, &base_dir, &manifest).await {
            overrides_ok = false;
            log_event("WARN", &format!("Overrides failed for {instance_id}: {e}"));
            emit(
                "overrides",
                0,
                1,
                &format!("Overrides not applied (will retry): {e}"),
            );
        }
    }

    // 4. Copy custom player mods and clean up stale mods on blocking worker
    let base_for_cleanup = base_dir.clone();
    let manifest_for_cleanup = manifest.clone();
    tokio::task::spawn_blocking(move || {
        sync_custom_mods(&base_for_cleanup, &manifest_for_cleanup)?;
        cleanup_stale_mods(&base_for_cleanup, &manifest_for_cleanup)
    })
    .await
    .map_err(|e| e.to_string())??;

    let final_state = {
        let _guard = STATE_LOCK
            .lock()
            .map_err(|_| "State lock poisoned".to_string())?;
        let mut st = load_state_unlocked(&instance_id);
        if overrides_ok {
            st.installed_version = Some(manifest.version.clone());
            save_state_unlocked(&instance_id, &st)?;
        }
        st
    };

    emit("done", 1, 1, &format!("Up to date (v{})", manifest.version));
    Ok(final_state)
}

async fn apply_mrpack_overrides(
    instance_id: &str,
    base_dir: &Path,
    manifest: &LauncherManifest,
) -> Result<(), String> {
    validate_version_token("manifest.version", &manifest.version)?;
    let client = http_client();

    let mut candidate_urls = Vec::new();
    let trimmed = manifest.mrpack_url.trim();
    if !trimmed.is_empty() && is_allowed_download_url(trimmed) {
        candidate_urls.push(trimmed.to_string());
    }
    if instance_id == "petablocks-s2" {
        let s2_gh = format!(
            "https://github.com/Petablocks/pb-launcher/releases/latest/download/PETABLOCKS-Season-2-{}.mrpack",
            manifest.version
        );
        let s2_modpack_gh = format!(
            "https://github.com/Petablocks/petablocks-modpack-s2/releases/latest/download/PETABLOCKS-Season-2-{}.mrpack",
            manifest.version
        );
        let s2_dist_gh = format!(
            "https://github.com/Petablocks/pb-modpacks/releases/latest/download/PETABLOCKS-Season-2-{}.mrpack",
            manifest.version
        );
        if !candidate_urls.contains(&s2_gh) {
            candidate_urls.push(s2_gh);
        }
        if !candidate_urls.contains(&s2_modpack_gh) {
            candidate_urls.push(s2_modpack_gh);
        }
        if !candidate_urls.contains(&s2_dist_gh) {
            candidate_urls.push(s2_dist_gh);
        }
    } else if instance_id == "petablocks-create2" {
        let c2_gh = format!(
            "https://github.com/Petablocks/pb-launcher/releases/latest/download/PETABLOCKS-Create-2-{}.mrpack",
            manifest.version
        );
        let c2_dist_gh = format!(
            "https://github.com/Petablocks/pb-modpacks/releases/latest/download/PETABLOCKS-Create-2-{}.mrpack",
            manifest.version
        );
        if !candidate_urls.contains(&c2_gh) {
            candidate_urls.push(c2_gh);
        }
        if !candidate_urls.contains(&c2_dist_gh) {
            candidate_urls.push(c2_dist_gh);
        }
    }

    if candidate_urls.is_empty() {
        return Err("No valid .mrpack download URL configured in manifest.".into());
    }

    let cache_dir = launcher_root().join("cache");
    let mrpack_dest = cache_dir.join(format!("{instance_id}-{}.mrpack", manifest.version));
    let expected = match manifest
        .mrpack_sha256
        .as_deref()
        .filter(|s| s.len() == 64)
    {
        Some(sha) => ExpectedHash::Sha256(sha),
        None => ExpectedHash::None,
    };

    let mut downloaded = false;
    if mrpack_dest.exists() && matches!(expected, ExpectedHash::Sha256(_)) && verify_file_hash(&mrpack_dest, expected) {
        downloaded = true;
    } else {
        for url in &candidate_urls {
            if download_to(client, url, &mrpack_dest, expected).await.is_ok() {
                downloaded = true;
                break;
            }
        }
    }

    if !downloaded {
        return Err("Could not download or verify the modpack overrides (.mrpack).".into());
    }

    let base_owned = base_dir.to_path_buf();
    let mrpack_owned = mrpack_dest.clone();
    tokio::task::spawn_blocking(move || {
        let file = File::open(&mrpack_owned).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            // enclosed_name() rejects `..` / absolute paths (zip-slip)
            let Some(path) = entry.enclosed_name() else {
                continue;
            };
            let Ok(rel_path) = path.strip_prefix("overrides") else {
                continue;
            };
            if rel_path.as_os_str().is_empty() || entry.is_dir() {
                continue;
            }
            let rel = rel_path.to_string_lossy().replace('\\', "/");
            let dest = base_owned.join(rel_path);
            // Preserve existing user options.txt & servers.dat if already created
            if (rel == "options.txt" || rel == "servers.dat") && dest.exists() {
                continue;
            }
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = File::create(&dest).map_err(|e| format!("{rel}: {e}"))?;
            io::copy(&mut entry, &mut out).map_err(|e| format!("{rel}: {e}"))?;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn sync_custom_mods(base_dir: &Path, manifest: &LauncherManifest) -> Result<(), String> {
    let custom_dir = base_dir.join("mods").join("custom");
    let mods_dir = base_dir.join("mods");
    let managed: HashSet<String> = manifest
        .mods
        .iter()
        .filter_map(|m| {
            Path::new(&m.path)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
        })
        .collect();

    if let Ok(entries) = fs::read_dir(&custom_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            if fname.ends_with(".jar") && !managed.contains(&fname) {
                let _ = fs::copy(entry.path(), mods_dir.join(&fname));
            }
        }
    }
    Ok(())
}

fn cleanup_stale_mods(base_dir: &Path, manifest: &LauncherManifest) -> Result<(), String> {
    let mods_dir = base_dir.join("mods");
    let custom_dir = mods_dir.join("custom");

    let mut allowed: HashSet<String> = HashSet::new();
    for m in &manifest.mods {
        if let Some(f) = Path::new(&m.path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
        {
            let dis = format!("{f}.disabled");
            allowed.insert(f);
            allowed.insert(dis);
        }
    }

    if let Ok(entries) = fs::read_dir(&custom_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            let dis = format!("{fname}.disabled");
            allowed.insert(fname);
            allowed.insert(dis);
        }
    }

    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let fname = entry.file_name().to_string_lossy().to_string();
                if (fname.ends_with(".jar") || fname.ends_with(".jar.disabled"))
                    && !allowed.contains(&fname)
                {
                    let backup = mods_dir.join("_removed");
                    if fs::create_dir_all(&backup).is_ok()
                        && fs::rename(&path, backup.join(&fname)).is_err()
                    {
                        let _ = fs::remove_file(&path);
                    }
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_escapes() {
        for bad in ["", ".", "..", "a/b", "a\\b", "C:", "a\0b"] {
            assert!(!is_safe_component(bad), "{bad:?}");
        }
        assert!(is_safe_component("petablocks-s2"));
        assert!(instance_dir("../../x").ends_with("invalid-instance"));
    }

    #[test]
    fn validates_mod_paths() {
        assert!(validate_mod_rel_path("mods/create-1.21.1.jar").is_ok());
        assert!(validate_mod_rel_path("mods/..\\evil.exe").is_err());
        assert!(validate_mod_rel_path("mods/sub/nested.jar").is_err());
        assert!(validate_mod_rel_path("config/options.txt").is_err());
        assert!(validate_mod_rel_path("C:\\Windows\\System32\\cmd.exe").is_err());
        assert!(validate_mod_rel_path("mods/not-a-jar.exe").is_err());
    }

    #[test]
    fn validates_download_urls() {
        assert!(is_allowed_download_url(
            "https://cdn.modrinth.com/data/abc/versions/1/mod.jar"
        ));
        assert!(is_allowed_download_url(
            "https://github.com/Petablocks/pb-launcher/releases/latest/download/launcher-manifest.json"
        ));
        assert!(is_allowed_download_url(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.259/neoforge-21.1.259-installer.jar"
        ));
        assert!(!is_allowed_download_url(
            "http://cdn.modrinth.com/data/abc/mod.jar"
        ));
        assert!(!is_allowed_download_url("https://evil.example.com/mod.jar"));
        assert!(!is_allowed_download_url(
            "https://github.com/other-org/malicious/releases/download/v1/mod.jar"
        ));
    }

    #[test]
    fn validates_version_tokens() {
        assert!(validate_version_token("mc", "1.21.1").is_ok());
        assert!(validate_version_token("nf", "21.1.259").is_ok());
        assert!(validate_version_token("mc", "../1.21.1").is_err());
        assert!(validate_version_token("mc", "1.21.1\\..\\evil").is_err());
    }

    #[test]
    fn merges_roaming_into_existing_local() {
        let base = std::env::temp_dir().join(format!("pb_merge_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let src = base.join("roaming");
        let dst = base.join("local");
        fs::create_dir_all(src.join("instances").join("petablocks-s2").join("shaderpacks")).unwrap();
        fs::write(
            src.join("instances")
                .join("petablocks-s2")
                .join("shaderpacks")
                .join("ComplementaryReimagined.zip"),
            b"shader",
        )
        .unwrap();
        fs::create_dir_all(dst.join("instances").join("petablocks-s2")).unwrap();
        fs::write(dst.join("launcher.log"), b"log").unwrap();

        let mut moved = false;
        merge_dir_into(&src, &dst, &mut moved);
        assert!(moved);
        assert!(dst
            .join("instances")
            .join("petablocks-s2")
            .join("shaderpacks")
            .join("ComplementaryReimagined.zip")
            .is_file());
        assert!(dst.join("launcher.log").is_file());
        let _ = fs::remove_dir_all(&base);
    }
}
