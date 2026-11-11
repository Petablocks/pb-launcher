use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::process::Command;
use tauri::{AppHandle, Emitter};

use crate::sync::{download_to, http_client, launcher_root, ExpectedHash};

const GITHUB_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/Petablocks/pb-launcher/releases/latest";
const GITHUB_RELEASES_LIST_API: &str =
    "https://api.github.com/repos/Petablocks/pb-launcher/releases?per_page=10";

/// Base64 Ed25519 public key for release signatures, baked in at build time from the
/// `PB_UPDATE_PUBLIC_KEY` environment variable. When present, an update is only installed if the
/// release carries a valid `<installer>.sig`; the SHA-256 published next to the installer is no
/// longer sufficient on its own, so a tampered release cannot push an update.
const UPDATE_PUBLIC_KEY: Option<&str> = option_env!("PB_UPDATE_PUBLIC_KEY");

/// Verifies a base64 Ed25519 signature over the installer's lowercase hex SHA-256 digest.
fn verify_update_signature(
    public_key_b64: &str,
    sha256_hex: &str,
    signature_b64: &str,
) -> Result<(), String> {
    use base64::Engine as _;
    use ed25519_dalek::{Signature, VerifyingKey};

    let b64 = base64::engine::general_purpose::STANDARD;
    let key_bytes: [u8; 32] = b64
        .decode(public_key_b64.trim())
        .ok()
        .and_then(|b| b.try_into().ok())
        .ok_or("Update signing key is malformed.")?;
    let key = VerifyingKey::from_bytes(&key_bytes)
        .map_err(|_| "Update signing key is invalid.".to_string())?;
    let sig_bytes: [u8; 64] = b64
        .decode(signature_b64.trim())
        .ok()
        .and_then(|b| b.try_into().ok())
        .ok_or("Update signature is malformed.")?;
    let message = sha256_hex.trim().to_ascii_lowercase();
    key.verify_strict(message.as_bytes(), &Signature::from_bytes(&sig_bytes))
        .map_err(|_| "Update signature does not match this release.".to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub download_url: Option<String>,
    pub release_url: String,
    pub notes: String,
    pub channel: String,
    pub prerelease: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SemVer {
    major: u32,
    minor: u32,
    patch: u32,
    prerelease: Option<String>,
}

impl PartialOrd for SemVer {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for SemVer {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match (self.major, self.minor, self.patch).cmp(&(other.major, other.minor, other.patch)) {
            std::cmp::Ordering::Equal => match (&self.prerelease, &other.prerelease) {
                (None, None) => std::cmp::Ordering::Equal,
                // Per SemVer 2.0.0: a normal release `1.12.0` > a pre-release `1.12.0-rc.1`
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (Some(_), None) => std::cmp::Ordering::Less,
                (Some(a), Some(b)) => compare_prerelease(a, b),
            },
            ord => ord,
        }
    }
}

fn compare_prerelease(a: &str, b: &str) -> std::cmp::Ordering {
    for (pa, pb) in a.split('.').zip(b.split('.')) {
        let ord = match (pa.parse::<u32>(), pb.parse::<u32>()) {
            (Ok(na), Ok(nb)) => na.cmp(&nb),
            _ => pa.cmp(pb),
        };
        if ord != std::cmp::Ordering::Equal {
            return ord;
        }
    }
    a.split('.').count().cmp(&b.split('.').count())
}

fn parse_semver(v: &str) -> SemVer {
    let clean = v.trim().trim_start_matches('v');
    let without_build = clean.split('+').next().unwrap_or(clean);
    let (core, pre) = match without_build.split_once('-') {
        Some((c, p)) => (
            c,
            if p.trim().is_empty() {
                None
            } else {
                Some(p.trim().to_ascii_lowercase())
            },
        ),
        None => (without_build, None),
    };
    let mut parts = core.split('.').map(|s| s.parse::<u32>().unwrap_or(0));
    SemVer {
        major: parts.next().unwrap_or(0),
        minor: parts.next().unwrap_or(0),
        patch: parts.next().unwrap_or(0),
        prerelease: pre,
    }
}

struct VerifiedInstallerAsset {
    latest_version: String,
    download_url: String,
    sha256: Option<String>,
    /// URL of the detached `<installer>.sig` asset, when the release has one.
    signature_url: Option<String>,
    release_url: String,
    notes: String,
    prerelease: bool,
}

async fn fetch_latest_installer_asset(
    current_version: &str,
    staging: bool,
) -> Result<Option<VerifiedInstallerAsset>, String> {
    let client = http_client();
    let val: Value = if staging {
        let res = client
            .get(GITHUB_RELEASES_LIST_API)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Ok(None);
        }
        let list: Vec<Value> = res.json().await.map_err(|e| e.to_string())?;
        // Pick the highest SemVer non-draft release across both Stable and Pre-release tags
        let Some(best) = list
            .into_iter()
            .filter(|r| !r["draft"].as_bool().unwrap_or(false))
            .max_by(|a, b| {
                let va = parse_semver(a["tag_name"].as_str().unwrap_or("0.0.0"));
                let vb = parse_semver(b["tag_name"].as_str().unwrap_or("0.0.0"));
                va.cmp(&vb)
            })
        else {
            return Ok(None);
        };
        best
    } else {
        let res = client
            .get(GITHUB_LATEST_RELEASE_API)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Ok(None);
        }
        res.json().await.map_err(|e| e.to_string())?
    };

    let tag = val["tag_name"].as_str().unwrap_or(current_version);
    let latest_version = tag.trim_start_matches('v').to_string();
    let prerelease = val["prerelease"].as_bool().unwrap_or(false);
    let release_url = val["html_url"]
        .as_str()
        .unwrap_or("https://github.com/Petablocks/pb-launcher/releases")
        .to_string();
    let notes = val["body"].as_str().unwrap_or("").to_string();

    let mut download_url: Option<String> = None;
    let mut sha256: Option<String> = None;
    let mut companion_sha_url: Option<String> = None;
    let mut signature_url: Option<String> = None;

    if let Some(assets) = val["assets"].as_array() {
        // Prefer the exact Windows x64 NSIS setup asset (`_x64-setup.exe` or `-setup.exe`)
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or("");
            if name.ends_with("-setup.exe.sig") {
                if let Some(u) = asset["browser_download_url"].as_str() {
                    signature_url = Some(u.to_string());
                }
            }
            if name.ends_with(".sha256") {
                if let Some(u) = asset["browser_download_url"].as_str() {
                    companion_sha_url = Some(u.to_string());
                }
            }
            if download_url.is_none()
                && (name.ends_with("_x64-setup.exe") || name.ends_with("-setup.exe"))
            {
                if let Some(url) = asset["browser_download_url"].as_str() {
                    download_url = Some(url.to_string());
                    if let Some(digest) = asset["digest"].as_str() {
                        if let Some(hex_str) = digest.strip_prefix("sha256:") {
                            if hex_str.len() == 64 && hex_str.chars().all(|c| c.is_ascii_hexdigit()) {
                                sha256 = Some(hex_str.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // If GitHub `asset.digest` wasn't populated, check companion `.sha256` asset or release body
    if sha256.is_none() {
        if let Some(sha_url) = companion_sha_url {
            if let Ok(r) = client.get(&sha_url).send().await {
                if let Ok(txt) = r.text().await {
                    let candidate: String = txt.trim().chars().take(64).collect();
                    if candidate.len() == 64 && candidate.chars().all(|c| c.is_ascii_hexdigit()) {
                        sha256 = Some(candidate);
                    }
                }
            }
        }
    }

    let Some(download_url) = download_url else {
        return Ok(Some(VerifiedInstallerAsset {
            latest_version,
            download_url: String::new(),
            sha256: None,
            signature_url: None,
            release_url,
            notes,
            prerelease,
        }));
    };

    Ok(Some(VerifiedInstallerAsset {
        latest_version,
        download_url,
        sha256,
        signature_url,
        release_url,
        notes,
        prerelease,
    }))
}

pub async fn check_for_update(current_version: &str) -> Result<LauncherUpdateInfo, String> {
    let staging = tokio::task::spawn_blocking(crate::settings::is_staging_channel)
        .await
        .unwrap_or(false);
    let channel = if staging {
        "staging".to_string()
    } else {
        "stable".to_string()
    };

    let Some(asset) = fetch_latest_installer_asset(current_version, staging).await? else {
        return Ok(LauncherUpdateInfo {
            current_version: current_version.to_string(),
            latest_version: current_version.to_string(),
            update_available: false,
            download_url: None,
            release_url: "https://github.com/Petablocks/pb-launcher/releases".into(),
            notes: String::new(),
            channel,
            prerelease: false,
        });
    };

    let has_url = !asset.download_url.is_empty();
    let update_available =
        parse_semver(&asset.latest_version) > parse_semver(current_version) && has_url;

    Ok(LauncherUpdateInfo {
        current_version: current_version.to_string(),
        latest_version: asset.latest_version,
        update_available,
        download_url: if has_url {
            Some(asset.download_url)
        } else {
            None
        },
        release_url: asset.release_url,
        notes: asset.notes,
        channel,
        prerelease: asset.prerelease,
    })
}

pub async fn install_update(
    app: AppHandle,
    download_url: String,
    version: String,
) -> Result<(), String> {
    if !download_url.starts_with("https://github.com/Petablocks/pb-launcher/releases/download/") {
        return Err("Refusing to install an update from an untrusted URL.".into());
    }
    if version.is_empty()
        || !version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
    {
        return Err("Invalid update version.".into());
    }

    // Prevent downgrade attacks: target version must be strictly newer than compiled binary version
    let compiled_version = env!("CARGO_PKG_VERSION");
    if parse_semver(&version) <= parse_semver(compiled_version) {
        return Err(format!(
            "Refusing to install v{version} (not newer than installed v{compiled_version})."
        ));
    }

    let staging = tokio::task::spawn_blocking(crate::settings::is_staging_channel)
        .await
        .unwrap_or(false);

    // Re-query GitHub Releases API to obtain the canonical asset URL and mandatory SHA-256 digest
    let asset = fetch_latest_installer_asset(compiled_version, staging)
        .await?
        .ok_or("Could not verify latest release metadata from GitHub.")?;
    if asset.download_url != download_url {
        return Err("Download URL does not match the latest verified GitHub release asset.".into());
    }
    let expected_sha256 = asset.sha256.ok_or(
        "Update blocked: GitHub release asset is missing a verified SHA-256 digest.",
    )?;

    if let Some(public_key) = UPDATE_PUBLIC_KEY.filter(|k| !k.trim().is_empty()) {
        let sig_url = asset
            .signature_url
            .filter(|u| u.starts_with("https://github.com/Petablocks/pb-launcher/releases/download/"))
            .ok_or("Update blocked: this release has not been signed yet. Try again shortly.")?;
        let signature = http_client()
            .get(&sig_url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| format!("Could not download the update signature: {e}"))?
            .text()
            .await
            .map_err(|e| format!("Could not read the update signature: {e}"))?;
        verify_update_signature(public_key, &expected_sha256, &signature)
            .map_err(|e| format!("Update blocked: {e}"))?;
    }

    let _ = app.emit(
        "updater-status",
        format!("Downloading & verifying PETABLOCKS Launcher v{version}..."),
    );

    let updates_dir = launcher_root().join("updates");
    let _ = fs::remove_dir_all(&updates_dir);
    fs::create_dir_all(&updates_dir).map_err(|e| e.to_string())?;
    let installer_path = updates_dir.join(format!("PETABLOCKS-Launcher-{version}-setup.exe"));

    download_to(
        http_client(),
        &download_url,
        &installer_path,
        ExpectedHash::Sha256(&expected_sha256),
    )
    .await
    .map_err(|e| format!("Update download or SHA-256 verification failed: {e}"))?;

    let _ = app.emit("updater-status", "Launching verified installer & restarting...");

    Command::new(&installer_path)
        .args(["/P", "/R"])
        .spawn()
        .map_err(|e| format!("Failed to start installer: {e}"))?;

    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test vector produced with OpenSSL (`openssl pkeyutl -sign -rawin`), the same tool the
    // release workflow uses, from a throwaway key.
    const TEST_PUBLIC_KEY: &str = "rKjpF8cqnFPCT4vTE1r19QRKCbwamkXhSP5Bu8D3fXs=";
    const TEST_DIGEST: &str = "0dc2153d4f4b117817956252c097ebf90f1b15b0ffed60fd92998ba68a4f11eb";
    const TEST_SIGNATURE: &str =
        "c/RBzPFI+hDbAVz4hBh6jYTUlpM0SI2YQMjlxTNtsrKF0lOWzMfo53dLUioDSg3rxVK/xqk11aNnzr/Pl9I4Dw==";

    #[test]
    fn update_signature_verification() {
        assert!(verify_update_signature(TEST_PUBLIC_KEY, TEST_DIGEST, TEST_SIGNATURE).is_ok());
        // Case and surrounding whitespace in the inputs do not matter.
        assert!(verify_update_signature(
            TEST_PUBLIC_KEY,
            &TEST_DIGEST.to_ascii_uppercase(),
            &format!("{TEST_SIGNATURE}\n")
        )
        .is_ok());

        let other_digest = TEST_DIGEST.replacen('0', "1", 1);
        assert!(verify_update_signature(TEST_PUBLIC_KEY, &other_digest, TEST_SIGNATURE).is_err());
        assert!(verify_update_signature(TEST_PUBLIC_KEY, TEST_DIGEST, "").is_err());
        assert!(verify_update_signature(TEST_PUBLIC_KEY, TEST_DIGEST, "not base64!").is_err());
        assert!(verify_update_signature("AAAA", TEST_DIGEST, TEST_SIGNATURE).is_err());
        let wrong_key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
        assert!(verify_update_signature(wrong_key, TEST_DIGEST, TEST_SIGNATURE).is_err());
    }

    #[test]
    fn semver_orders_numerically_and_prereleases() {
        assert!(parse_semver("v1.10.0") > parse_semver("1.9.9"));
        assert!(parse_semver("1.12.0-rc.1") > parse_semver("1.11.1"));
        assert!(parse_semver("1.12.0-rc.2") > parse_semver("1.12.0-rc.1"));
        assert!(parse_semver("1.12.0") > parse_semver("1.12.0-rc.2"));
        assert_eq!(
            parse_semver("1.8"),
            SemVer {
                major: 1,
                minor: 8,
                patch: 0,
                prerelease: None
            }
        );
        assert_eq!(
            parse_semver("garbage"),
            SemVer {
                major: 0,
                minor: 0,
                patch: 0,
                prerelease: None
            }
        );
    }
}
