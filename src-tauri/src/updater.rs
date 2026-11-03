use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::fs::{self, File};
use std::io::Write;
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::sync::launcher_root;

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

pub async fn check_for_update(current_version: &str) -> Result<LauncherUpdateInfo, String> {
    let client = Client::builder()
        .user_agent("PETABLOCKS-Launcher-Updater")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(GITHUB_LATEST_RELEASE_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Ok(LauncherUpdateInfo {
            current_version: current_version.to_string(),
            latest_version: current_version.to_string(),
            update_available: false,
            download_url: None,
            release_url: "https://github.com/Petablocks/pb-launcher/releases".into(),
            notes: String::new(),
        });
    }

    let val: Value = res.json().await.map_err(|e| e.to_string())?;
    let tag = val["tag_name"].as_str().unwrap_or(current_version);
    let latest_version = tag.trim_start_matches('v').to_string();
    let release_url = val["html_url"]
        .as_str()
        .unwrap_or("https://github.com/Petablocks/pb-launcher/releases")
        .to_string();
    let notes = val["body"].as_str().unwrap_or("").to_string();

    // Find the Windows NSIS setup .exe asset
    let mut download_url: Option<String> = None;
    if let Some(assets) = val["assets"].as_array() {
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or("");
            if name.ends_with("-setup.exe") || name.ends_with(".exe") {
                if let Some(url) = asset["browser_download_url"].as_str() {
                    download_url = Some(url.to_string());
                    break;
                }
            }
        }
    }

    let update_available =
        parse_semver(&latest_version) > parse_semver(current_version) && download_url.is_some();

    Ok(LauncherUpdateInfo {
        current_version: current_version.to_string(),
        latest_version,
        update_available,
        download_url,
        release_url,
        notes,
    })
}

pub async fn install_update(app: AppHandle, download_url: String, version: String) -> Result<(), String> {
    let _ = app.emit("updater-status", format!("Downloading PETABLOCKS Launcher v{version}..."));

    let client = Client::builder()
        .user_agent("PETABLOCKS-Launcher-Updater")
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed downloading update: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Download returned HTTP {}", res.status()));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Failed reading installer bytes: {e}"))?;

    let updates_dir = launcher_root().join("updates");
    let _ = fs::remove_dir_all(&updates_dir);
    fs::create_dir_all(&updates_dir).map_err(|e| e.to_string())?;
    let installer_path = updates_dir.join(format!("PETABLOCKS-Launcher-{version}-setup.exe"));

    let mut f = File::create(&installer_path).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;
    drop(f);

    let _ = app.emit("updater-status", "Launching installer & restarting...");

    // Launch NSIS installer (/P = passive progress bar, then relaunch)
    Command::new(&installer_path)
        .spawn()
        .map_err(|e| format!("Failed to start installer: {e}"))?;

    std::process::exit(0);
}
