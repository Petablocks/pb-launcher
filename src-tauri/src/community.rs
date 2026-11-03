use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use reqwest::Client;
use serde::Serialize;
use serde_json::json;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::sync::instance_dir;

const DISCORD_APP_ID: &str = "1302689041827651624";

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
    if webhook_url.trim().is_empty() {
        return Err("No Discord Webhook URL provided.".into());
    }
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
        .post(webhook_url)
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
