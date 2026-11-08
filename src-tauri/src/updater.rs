use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::process::Command;
use tauri::{AppHandle, Emitter};

use crate::sync::{download_to, http_client, launcher_root, ExpectedHash};

const GITHUB_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/Petablocks/pb-launcher/releases/latest";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub download_url: Option<String>,
    pub release_url: String,
    pub notes: String,
}

fn parse_semver(v: &str) -> (u32, u32, u32) {
    let clean = v.trim().trim_start_matches('v');
    let mut parts = clean.split('.').map(|s| s.parse::<u32>().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

struct VerifiedInstallerAsset {
    latest_version: String,
    download_url: String,
    sha256: Option<String>,
    release_url: String,
    notes: String,
}

async fn fetch_latest_installer_asset(current_version: &str) -> Result<Option<VerifiedInstallerAsset>, String> {
    let client = http_client();
    let res = client
        .get(GITHUB_LATEST_RELEASE_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Ok(None);
    }

    let val: Value = res.json().await.map_err(|e| e.to_string())?;
    let tag = val["tag_name"].as_str().unwrap_or(current_version);
    let latest_version = tag.trim_start_matches('v').to_string();
    let release_url = val["html_url"]
        .as_str()
        .unwrap_or("https://github.com/Petablocks/pb-launcher/releases")
        .to_string();
    let notes = val["body"].as_str().unwrap_or("").to_string();

    let mut download_url: Option<String> = None;
    let mut sha256: Option<String> = None;
    let mut companion_sha_url: Option<String> = None;

    if let Some(assets) = val["assets"].as_array() {
        // Prefer the exact Windows x64 NSIS setup asset (`_x64-setup.exe` or `-setup.exe`)
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or("");
            if name.ends_with(".sha256") {
                if let Some(u) = asset["browser_download_url"].as_str() {
                    companion_sha_url = Some(u.to_string());
                }
            }
            if name.ends_with("_x64-setup.exe") || name.ends_with("-setup.exe") {
                if let Some(url) = asset["browser_download_url"].as_str() {
                    download_url = Some(url.to_string());
                    if let Some(digest) = asset["digest"].as_str() {
                        if let Some(hex_str) = digest.strip_prefix("sha256:") {
                            if hex_str.len() == 64 && hex_str.chars().all(|c| c.is_ascii_hexdigit()) {
                                sha256 = Some(hex_str.to_string());
                            }
                        }
                    }
                    break;
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
            release_url,
            notes,
        }));
    };

    Ok(Some(VerifiedInstallerAsset {
        latest_version,
        download_url,
        sha256,
        release_url,
        notes,
    }))
}

pub async fn check_for_update(current_version: &str) -> Result<LauncherUpdateInfo, String> {
    let Some(asset) = fetch_latest_installer_asset(current_version).await? else {
        return Ok(LauncherUpdateInfo {
            current_version: current_version.to_string(),
            latest_version: current_version.to_string(),
            update_available: false,
            download_url: None,
            release_url: "https://github.com/Petablocks/pb-launcher/releases".into(),
            notes: String::new(),
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

    // Re-query GitHub Releases API to obtain the canonical asset URL and mandatory SHA-256 digest
    let asset = fetch_latest_installer_asset(compiled_version)
        .await?
        .ok_or("Could not verify latest release metadata from GitHub.")?;
    if asset.download_url != download_url {
        return Err("Download URL does not match the latest verified GitHub release asset.".into());
    }
    let expected_sha256 = asset.sha256.ok_or(
        "Update blocked: GitHub release asset is missing a verified SHA-256 digest.",
    )?;

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

    #[test]
    fn semver_orders_numerically() {
        assert!(parse_semver("v1.10.0") > parse_semver("1.9.9"));
        assert_eq!(parse_semver("1.8"), (1, 8, 0));
        assert_eq!(parse_semver("garbage"), (0, 0, 0));
    }
}
