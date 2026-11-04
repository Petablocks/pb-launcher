use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::sync::instance_dir;

const DISCORD_APP_ID: &str = "1302689041827651624";
const PB_AUTH_BASE_URL: &str = "https://my.petablocks.com";
const DEFAULT_BETA_WEBHOOK: &str =
    "https://discord.com/api/webhooks/1549560198153109604/9GcH_jClH30OosD3a_mJqDftiR9CQz1JiiZIUWiYpqucNCyZ6xKAuOODzri1cBKS353P";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordLinkStatus {
    pub linked: bool,
    pub discord_id: Option<String>,
    pub discord_username: Option<String>,
    pub rank: String,
    pub in_guild: bool,
    pub beta_eligible: bool,
    pub pending_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLinkCodeResponse {
    pub ok: bool,
    pub code: String,
    pub oauth_url: String,
    pub expires_in_minutes: u32,
}

pub async fn check_discord_link(uuid: &str) -> Result<DiscordLinkStatus, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{PB_AUTH_BASE_URL}/api/public/launcher/status/{uuid}");
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Could not reach my.petablocks.com: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Identity server returned HTTP {}", res.status()));
    }
    res.json::<DiscordLinkStatus>().await.map_err(|e| e.to_string())
}

pub async fn request_discord_link_code(
    uuid: &str,
    username: &str,
) -> Result<LauncherLinkCodeResponse, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{PB_AUTH_BASE_URL}/api/public/launcher/link-code");
    let res = client
        .post(&url)
        .json(&json!({ "uuid": uuid, "username": username }))
        .send()
        .await
        .map_err(|e| format!("Could not reach my.petablocks.com: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Identity server returned HTTP {}", res.status()));
    }
    res.json::<LauncherLinkCodeResponse>()
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotItem {
    pub filename: String,
    pub path: String,
    pub size: u64,
    pub modified_epoch: u64,
    pub data_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReportInfo {
    pub filename: String,
    pub path: String,
    pub summary: String,
    pub content: String,
}

pub fn list_screenshots(instance_id: &str) -> Result<Vec<ScreenshotItem>, String> {
    let dir = instance_dir(instance_id).join("screenshots");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let fname = entry.file_name().to_string_lossy().to_string();
            if !fname.to_lowercase().ends_with(".png") {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                if !meta.is_file() {
                    continue;
                }
                let modified_epoch = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                if let Ok(bytes) = fs::read(&path) {
                    let b64 = BASE64.encode(&bytes);
                    items.push(ScreenshotItem {
                        filename: fname,
                        path: path.to_string_lossy().to_string(),
                        size: meta.len(),
                        modified_epoch,
                        data_url: format!("data:image/png;base64,{b64}"),
                    });
                }
            }
        }
    }

    items.sort_by(|a, b| b.modified_epoch.cmp(&a.modified_epoch));
    Ok(items)
}

pub fn screenshots_dir(instance_id: &str) -> Result<String, String> {
    let dir = instance_dir(instance_id).join("screenshots");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

pub fn latest_crash_report(instance_id: &str) -> Option<CrashReportInfo> {
    let dir = instance_dir(instance_id).join("crash-reports");
    let entries = fs::read_dir(&dir).ok()?;
    let mut latest: Option<(u64, std::path::PathBuf, String)> = None;

    for entry in entries.flatten() {
        let meta = entry.metadata().ok()?;
        if !meta.is_file() {
            continue;
        }
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let fname = entry.file_name().to_string_lossy().to_string();
        if latest.as_ref().map(|(t, _, _)| mtime > *t).unwrap_or(true) {
            latest = Some((mtime, entry.path(), fname));
        }
    }

    let (_, path, filename) = latest?;
    let content = fs::read_to_string(&path).ok()?;
    let summary = content
        .lines()
        .find(|l| l.starts_with("Description:") || l.contains("Exception") || l.contains("Error"))
        .unwrap_or("Minecraft crash report")
        .trim()
        .to_string();

    Some(CrashReportInfo {
        filename,
        path: path.to_string_lossy().to_string(),
        summary,
        content,
    })
}

pub async fn submit_crash_webhook(
    webhook_url: &str,
    player_name: &str,
    instance_id: &str,
    summary: &str,
    log_snippet: &str,
) -> Result<(), String> {
    let target_url = if webhook_url.trim().is_empty() {
        DEFAULT_BETA_WEBHOOK
    } else {
        webhook_url.trim()
    };
    let truncated: String = log_snippet.chars().take(1600).collect();
    let payload = json!({
        "username": "PETABLOCKS Launcher Crash Reporter",
        "embeds": [{
            "title": format!("Crash Report — {instance_id}"),
            "color": 0x0FCDF8,
            "fields": [
                { "name": "Player", "value": player_name, "inline": true },
                { "name": "Summary", "value": summary, "inline": false },
                { "name": "Log Excerpt", "value": format!("```\n{truncated}\n```"), "inline": false }
            ]
        }]
    });

    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(target_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Discord webhook returned HTTP {}", res.status()));
    }
    Ok(())
}

pub async fn submit_beta_feedback(
    webhook_url: &str,
    category: &str,
    title: &str,
    description: &str,
    player_name: &str,
    contact: &str,
    launcher_version: &str,
    include_diagnostics: bool,
    instance_id: &str,
) -> Result<(), String> {
    let target_url = if webhook_url.trim().is_empty() {
        DEFAULT_BETA_WEBHOOK
    } else {
        webhook_url.trim()
    };

    let color = match category {
        "bug" => 0xEF4444,
        "crash" => 0xF97316,
        _ => 0x0FCDF8,
    };

    let mut fields = vec![
        json!({ "name": "Category", "value": category.to_uppercase(), "inline": true }),
        json!({ "name": "Player", "value": if player_name.is_empty() { "Not signed in" } else { player_name }, "inline": true }),
        json!({ "name": "Launcher", "value": format!("v{launcher_version} ({}/{})", std::env::consts::OS, std::env::consts::ARCH), "inline": true }),
    ];

    if !contact.trim().is_empty() {
        fields.push(json!({ "name": "Discord / Contact", "value": contact.trim(), "inline": true }));
    }

    fields.push(json!({
        "name": "Details",
        "value": description.chars().take(1800).collect::<String>(),
        "inline": false
    }));

    if include_diagnostics {
        let settings = crate::settings::load_settings();
        let java = crate::java::detect_java();
        let state = crate::sync::load_state(instance_id);
        let diag = format!(
            "RAM: {} MB | Java: {} ({}) | Modpack: {} | Disabled Mods: {}",
            settings.memory_mb,
            java.version.unwrap_or_else(|| "Not installed".into()),
            java.source,
            state.installed_version.unwrap_or_else(|| "Not synced".into()),
            state.disabled_mods.len()
        );
        fields.push(json!({
            "name": "System Diagnostics",
            "value": format!("```\n{diag}\n```"),
            "inline": false
        }));
    }

    let payload = json!({
        "username": "PETABLOCKS Beta Feedback",
        "embeds": [{
            "title": format!("[BETA] {}", title.trim()),
            "color": color,
            "fields": fields
        }]
    });

    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(target_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Discord webhook returned HTTP {}", res.status()));
    }
    Ok(())
}

/// Lightweight Windows Discord IPC Rich Presence updater (`\\.\pipe\discord-ipc-0`).
/// Best-effort: silently no-ops if Discord is not running locally.
pub fn update_discord_rpc(details: &str, state_text: &str) {
    for i in 0..4 {
        let pipe_name = format!(r"\\.\pipe\discord-ipc-{i}");
        if let Ok(mut pipe) = OpenOptions::new().read(true).write(true).open(&pipe_name) {
            let handshake = json!({ "v": 1, "client_id": DISCORD_APP_ID }).to_string();
            if write_ipc_frame(&mut pipe, 0, handshake.as_bytes()).is_err() {
                continue;
            }
            let _ = read_ipc_frame(&mut pipe);

            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let cmd = json!({
                "cmd": "SET_ACTIVITY",
                "args": {
                    "pid": std::process::id(),
                    "activity": {
                        "details": details,
                        "state": state_text,
                        "timestamps": { "start": now }
                    }
                },
                "nonce": format!("pb-{now}")
            })
            .to_string();
            let _ = write_ipc_frame(&mut pipe, 1, cmd.as_bytes());
            break;
        }
    }
}

fn write_ipc_frame(pipe: &mut std::fs::File, opcode: u32, payload: &[u8]) -> std::io::Result<()> {
    let mut header = [0u8; 8];
    header[..4].copy_from_slice(&opcode.to_le_bytes());
    header[4..8].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    pipe.write_all(&header)?;
    pipe.write_all(payload)?;
    pipe.flush()
}

fn read_ipc_frame(pipe: &mut std::fs::File) -> std::io::Result<Vec<u8>> {
    let mut header = [0u8; 8];
    pipe.read_exact(&mut header)?;
    let len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    let mut buf = vec![0u8; len.min(65536)];
    pipe.read_exact(&mut buf)?;
    Ok(buf)
}
