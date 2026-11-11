use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::sync::mpsc::{self, SyncSender};
use std::sync::LazyLock;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::sync::{http_client, instance_dir};

const DISCORD_APP_ID: &str = "1302689041827651624";
const PB_AUTH_BASE_URL: &str = "https://my.petablocks.com";

/// Discord rejects embed field values over 1024 chars; stay under it.
fn trunc(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// Validates an optional user-supplied Discord webhook URL.
/// No default webhook secret is ever compiled into the binary; all primary reports go through
/// `my.petablocks.com/api/public/launcher/report`, and optional user webhooks are restricted strictly
/// to `https://discord.com/api/webhooks/` or `https://discordapp.com/api/webhooks/`.
fn resolve_webhook(user_url: &str) -> Result<String, String> {
    let u = user_url.trim();
    if u.is_empty() {
        return Err("No Discord webhook URL is configured.".to_string());
    }
    let valid_prefix = u.starts_with("https://discord.com/api/webhooks/")
        || u.starts_with("https://discordapp.com/api/webhooks/");
    if !valid_prefix {
        return Err(
            "Invalid webhook URL: only https://discord.com/api/webhooks/... URLs are permitted."
                .to_string(),
        );
    }
    Ok(u.to_string())
}

/// Scrubs Windows user profile paths (`C:\Users\<username>` and forward-slash equivalents)
/// from crash logs and error descriptions before displaying or transmitting them.
pub fn scrub_pii(input: &str) -> String {
    let mut out = input.to_string();
    for env_key in ["USERPROFILE", "APPDATA", "LOCALAPPDATA"] {
        if let Ok(val) = std::env::var(env_key) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                out = out.replace(trimmed, &format!("<{env_key}>"));
                let slash = trimmed.replace('\\', "/");
                out = out.replace(&slash, &format!("<{env_key}>"));
            }
        }
    }
    // Generic C:\Users\<name>\ and C:/Users/<name>/ scrubber
    out = scrub_users_segment(&out, ":\\Users\\", '\\');
    out = scrub_users_segment(&out, ":/Users/", '/');
    out
}

fn scrub_users_segment(s: &str, needle: &str, sep: char) -> String {
    let mut result = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(idx) = rest.to_ascii_lowercase().find(&needle.to_ascii_lowercase()) {
        // Include everything up to the drive letter before `:\Users\`
        let prefix_end = idx.saturating_sub(1);
        result.push_str(&rest[..prefix_end]);
        let after_users = &rest[idx + needle.len()..];
        if let Some(next_sep) = after_users.find(sep) {
            result.push_str("<USERPROFILE>");
            rest = &after_users[next_sep..];
        } else {
            result.push_str("<USERPROFILE>");
            rest = "";
            break;
        }
    }
    result.push_str(rest);
    result
}

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
    let clean_uuid: String = uuid
        .chars()
        .filter(|c| c.is_ascii_hexdigit() || *c == '-')
        .collect();
    if clean_uuid.is_empty() {
        return Err("Invalid player UUID.".into());
    }
    let url = format!("{PB_AUTH_BASE_URL}/api/public/launcher/status/{clean_uuid}");
    let mut req = http_client().get(&url);
    if let Some((profile, mc_token)) = crate::auth::get_active_mc_session() {
        let req_hex: String = clean_uuid
            .chars()
            .filter(|c| c.is_ascii_hexdigit())
            .collect();
        let prof_hex: String = profile
            .uuid
            .chars()
            .filter(|c| c.is_ascii_hexdigit())
            .collect();
        if req_hex.eq_ignore_ascii_case(&prof_hex) && !mc_token.is_empty() {
            req = req.bearer_auth(mc_token);
        }
    }
    let res = req
        .send()
        .await
        .map_err(|e| format!("Could not reach my.petablocks.com: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Identity server returned HTTP {}", res.status()));
    }
    res.json::<DiscordLinkStatus>()
        .await
        .map_err(|e| e.to_string())
}

pub async fn request_discord_link_code(
    uuid: &str,
    username: &str,
) -> Result<LauncherLinkCodeResponse, String> {
    let url = format!("{PB_AUTH_BASE_URL}/api/public/launcher/link-code");
    let mut req = http_client()
        .post(&url)
        .json(&json!({ "uuid": uuid, "username": username }));

    // Attach the active in-memory Minecraft access token so my.petablocks.com can
    // cryptographically verify ownership of the Minecraft profile before issuing a link code
    // or signed Discord OAuth URL (closes pb-launcher#1 / pb-auth#11 / pb-auth#12).
    if let Some((profile, mc_token)) = crate::auth::get_active_mc_session() {
        let clean_req: String = uuid.chars().filter(|c| c.is_ascii_hexdigit()).collect();
        let clean_prof: String = profile
            .uuid
            .chars()
            .filter(|c| c.is_ascii_hexdigit())
            .collect();
        if clean_req.eq_ignore_ascii_case(&clean_prof) && !mc_token.is_empty() {
            req = req.bearer_auth(mc_token);
        } else {
            return Err(
                "Please sign in with your Microsoft account before linking Discord.".into(),
            );
        }
    } else {
        return Err("Please sign in with your Microsoft account before linking Discord.".into());
    }

    let res = req
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

                items.push(ScreenshotItem {
                    filename: fname,
                    path: path.to_string_lossy().to_string(),
                    size: meta.len(),
                    modified_epoch,
                });
            }
        }
    }

    items.sort_by_key(|i| std::cmp::Reverse(i.modified_epoch));
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
        let Ok(meta) = entry.metadata() else { continue };
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
    let raw_content = fs::read_to_string(&path).ok()?;
    let content = scrub_pii(&raw_content);
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackSubmitResult {
    pub ok: bool,
    pub issue_number: Option<u64>,
    pub issue_url: Option<String>,
    pub repository: Option<String>,
    pub delivered_to: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewayReportResponse {
    ok: Option<bool>,
    issue_number: Option<u64>,
    issue_url: Option<String>,
    repository: Option<String>,
    error: Option<String>,
}

pub async fn submit_crash_webhook(
    webhook_url: &str,
    player_name: &str,
    player_uuid: &str,
    instance_id: &str,
    summary: &str,
    log_snippet: &str,
) -> Result<FeedbackSubmitResult, String> {
    let inst_owned = instance_id.to_string();
    let (settings, java, state) = tokio::task::spawn_blocking(move || {
        (
            crate::settings::load_settings(),
            crate::java::detect_java(),
            crate::sync::load_state(&inst_owned),
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    let scrubbed_summary = scrub_pii(summary);
    let scrubbed_log = scrub_pii(log_snippet);
    let truncated = trunc(&scrubbed_log, 4000);

    let gateway_payload = json!({
        "target": instance_id,
        "category": "crash",
        "title": format!("Minecraft Crash: {}", trunc(&scrubbed_summary, 90)),
        "description": format!("**Crash Summary:** {}\n\n### Crash Report Excerpt\n```text\n{}\n```", trunc(&scrubbed_summary, 500), truncated),
        "playerName": player_name,
        "playerUuid": player_uuid,
        "launcherVersion": env!("CARGO_PKG_VERSION"),
        "diagnostics": {
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
            "memoryMb": settings.memory_mb,
            "javaVersion": java.version.clone().unwrap_or_else(|| "Not installed".into()),
            "javaSource": java.source.clone(),
            "modpackVersion": state.installed_version.clone().unwrap_or_else(|| "Not synced".into()),
            "disabledMods": state.disabled_mods.len()
        }
    });

    let client = http_client();
    let gateway_url = format!("{PB_AUTH_BASE_URL}/api/public/launcher/report");
    let mut gateway_req = client.post(&gateway_url).json(&gateway_payload);
    if let Some((_, mc_token)) = crate::auth::get_active_mc_session() {
        if !mc_token.is_empty() {
            gateway_req = gateway_req.bearer_auth(mc_token);
        }
    }
    if let Ok(res) = gateway_req.send().await {
        let status = res.status();
        if let Ok(body) = res.json::<GatewayReportResponse>().await {
            if status.is_success() && body.ok.unwrap_or(false) {
                return Ok(FeedbackSubmitResult {
                    ok: true,
                    issue_number: body.issue_number,
                    issue_url: body.issue_url,
                    repository: body.repository,
                    delivered_to: "github".to_string(),
                });
            }
            if status.as_u16() == 429 || status.as_u16() == 400 {
                return Err(body
                    .error
                    .unwrap_or_else(|| format!("Report rejected ({status})")));
            }
        }
    }

    // Fallback to optional user-configured Discord webhook if valid
    let target_url = resolve_webhook(webhook_url)?;
    let discord_truncated = trunc(&scrubbed_log, 950);
    let payload = json!({
        "username": "PETABLOCKS Launcher Crash Reporter",
        "embeds": [{
            "title": format!("Crash Report — {instance_id}"),
            "color": 0x0FCDF8,
            "fields": [
                { "name": "Player", "value": trunc(player_name, 100), "inline": true },
                { "name": "Summary", "value": trunc(&scrubbed_summary, 1000), "inline": false },
                { "name": "Log Excerpt", "value": format!("```\n{discord_truncated}\n```"), "inline": false }
            ]
        }]
    });

    let res = client
        .post(target_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Report server returned HTTP {}", res.status()));
    }
    Ok(FeedbackSubmitResult {
        ok: true,
        issue_number: None,
        issue_url: None,
        repository: None,
        delivered_to: "discord".to_string(),
    })
}

#[allow(clippy::too_many_arguments)]
pub async fn submit_beta_feedback(
    webhook_url: &str,
    target: &str,
    category: &str,
    title: &str,
    description: &str,
    player_name: &str,
    player_uuid: &str,
    contact: &str,
    launcher_version: &str,
    include_diagnostics: bool,
    instance_id: &str,
) -> Result<FeedbackSubmitResult, String> {
    let inst_owned = instance_id.to_string();
    let (settings, java, state) = tokio::task::spawn_blocking(move || {
        (
            crate::settings::load_settings(),
            crate::java::detect_java(),
            crate::sync::load_state(&inst_owned),
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    let scrubbed_desc = scrub_pii(description.trim());

    let diagnostics_json = if include_diagnostics {
        json!({
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
            "memoryMb": settings.memory_mb,
            "javaVersion": java.version.clone().unwrap_or_else(|| "Not installed".into()),
            "javaSource": java.source.clone(),
            "modpackVersion": state.installed_version.clone().unwrap_or_else(|| "Not synced".into()),
            "disabledMods": state.disabled_mods.len()
        })
    } else {
        serde_json::Value::Null
    };

    let gateway_payload = json!({
        "target": if target.trim().is_empty() { "launcher" } else { target.trim() },
        "category": category,
        "title": title.trim(),
        "description": scrubbed_desc,
        "playerName": player_name,
        "playerUuid": player_uuid,
        "contact": contact.trim(),
        "launcherVersion": launcher_version,
        "diagnostics": diagnostics_json,
    });

    let client = http_client();
    let gateway_url = format!("{PB_AUTH_BASE_URL}/api/public/launcher/report");
    let mut gateway_err: Option<String> = None;

    let mut gateway_req = client.post(&gateway_url).json(&gateway_payload);
    if let Some((_, mc_token)) = crate::auth::get_active_mc_session() {
        if !mc_token.is_empty() {
            gateway_req = gateway_req.bearer_auth(mc_token);
        }
    }

    if let Ok(res) = gateway_req.send().await {
        let status = res.status();
        if let Ok(body) = res.json::<GatewayReportResponse>().await {
            if status.is_success() && body.ok.unwrap_or(false) {
                return Ok(FeedbackSubmitResult {
                    ok: true,
                    issue_number: body.issue_number,
                    issue_url: body.issue_url,
                    repository: body.repository,
                    delivered_to: "github".to_string(),
                });
            }
            if status.as_u16() == 429 || status.as_u16() == 400 {
                return Err(body
                    .error
                    .unwrap_or_else(|| format!("Report rejected ({status})")));
            }
            gateway_err = body.error;
        }
    }

    // Fallback to optional user-configured Discord webhook if valid
    let target_url = match resolve_webhook(webhook_url) {
        Ok(u) => u,
        Err(_) => {
            return Err(gateway_err.unwrap_or_else(|| {
                "Could not reach the PETABLOCKS Report Gateway (my.petablocks.com). Please try again shortly.".to_string()
            }));
        }
    };

    let color = match category {
        "bug" => 0xEF4444,
        "crash" => 0xF97316,
        _ => 0x0FCDF8,
    };

    let mut fields = vec![
        json!({ "name": "Target", "value": target, "inline": true }),
        json!({ "name": "Category", "value": category.to_uppercase(), "inline": true }),
        json!({ "name": "Player", "value": if player_name.is_empty() { "Not signed in".to_string() } else { trunc(player_name, 100) }, "inline": true }),
        json!({ "name": "Launcher", "value": format!("v{launcher_version} ({}/{})", std::env::consts::OS, std::env::consts::ARCH), "inline": true }),
    ];

    if !contact.trim().is_empty() {
        fields.push(json!({ "name": "Discord / Contact", "value": trunc(contact.trim(), 200), "inline": true }));
    }

    fields.push(json!({
        "name": "Details",
        "value": trunc(&scrubbed_desc, 1000),
        "inline": false
    }));

    if include_diagnostics {
        let diag = format!(
            "RAM: {} MB | Java: {} ({}) | Modpack: {} | Disabled Mods: {}",
            settings.memory_mb,
            java.version.unwrap_or_else(|| "Not installed".into()),
            java.source,
            state
                .installed_version
                .unwrap_or_else(|| "Not synced".into()),
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
            "title": format!("[BETA] {}", trunc(title.trim(), 200)),
            "color": color,
            "fields": fields
        }]
    });

    let res = client
        .post(target_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Discord webhook returned HTTP {}", res.status()));
    }
    Ok(FeedbackSubmitResult {
        ok: true,
        issue_number: None,
        issue_url: None,
        repository: None,
        delivered_to: "discord".to_string(),
    })
}

struct DiscordRpcMsg {
    details: String,
    state_text: String,
    pid: u32,
    custom_start: Option<u64>,
}

/// Persistent background worker thread that keeps a single Discord IPC named pipe open (`\\.\pipe\discord-ipc-0`)
/// and never blocks Tokio or UI threads even if the local Discord client is wedged.
static DISCORD_RPC_SENDER: LazyLock<SyncSender<DiscordRpcMsg>> = LazyLock::new(|| {
    let (tx, rx) = mpsc::sync_channel::<DiscordRpcMsg>(8);
    std::thread::Builder::new()
        .name("pb-discord-rpc".into())
        .spawn(move || {
            let mut active_pipe: Option<std::fs::File> = None;
            while let Ok(msg) = rx.recv() {
                if active_pipe.is_none() {
                    active_pipe = connect_discord_pipe();
                }
                if let Some(pipe) = active_pipe.as_mut() {
                    if send_activity_frame(pipe, &msg).is_err() {
                        active_pipe = None;
                        if let Some(mut fresh) = connect_discord_pipe() {
                            if send_activity_frame(&mut fresh, &msg).is_ok() {
                                active_pipe = Some(fresh);
                            }
                        }
                    }
                }
            }
        })
        .ok();
    tx
});

fn connect_discord_pipe() -> Option<std::fs::File> {
    for i in 0..10 {
        let pipe_name = format!(r"\\.\pipe\discord-ipc-{i}");
        if let Ok(mut pipe) = OpenOptions::new().read(true).write(true).open(&pipe_name) {
            let handshake = json!({ "v": 1, "client_id": DISCORD_APP_ID }).to_string();
            if write_ipc_frame(&mut pipe, 0, handshake.as_bytes()).is_ok() {
                return Some(pipe);
            }
        }
    }
    None
}

fn send_activity_frame(pipe: &mut std::fs::File, msg: &DiscordRpcMsg) -> std::io::Result<()> {
    let start_time = msg.custom_start.unwrap_or_else(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    });

    let cmd = json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": msg.pid,
            "activity": {
                "details": msg.details,
                "state": msg.state_text,
                "assets": {
                    "large_image": "petablocks_logo",
                    "large_text": "PETABLOCKS Season 2",
                    "small_image": "minecraft",
                    "small_text": "Minecraft 1.21.1 (NeoForge)"
                },
                "timestamps": { "start": start_time }
            }
        },
        "nonce": format!("pb-{}", start_time)
    })
    .to_string();
    write_ipc_frame(pipe, 1, cmd.as_bytes())
}

pub fn update_discord_rpc(details: &str, state_text: &str) {
    update_discord_rpc_with_pid(details, state_text, std::process::id(), None);
}

pub fn update_discord_rpc_with_pid(
    details: &str,
    state_text: &str,
    pid: u32,
    custom_start: Option<u64>,
) {
    let _ = DISCORD_RPC_SENDER.try_send(DiscordRpcMsg {
        details: details.to_string(),
        state_text: state_text.to_string(),
        pid,
        custom_start,
    });
}

fn write_ipc_frame(pipe: &mut std::fs::File, opcode: u32, payload: &[u8]) -> std::io::Result<()> {
    let mut header = [0u8; 8];
    header[..4].copy_from_slice(&opcode.to_le_bytes());
    header[4..8].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    pipe.write_all(&header)?;
    pipe.write_all(payload)?;
    pipe.flush()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn webhook_validation() {
        assert!(resolve_webhook("https://discord.com/api/webhooks/123/abc").is_ok());
        assert!(resolve_webhook("https://discordapp.com/api/webhooks/123/abc").is_ok());
        assert!(resolve_webhook("https://evil.example.com/api/webhooks/123/abc").is_err());
        assert!(resolve_webhook("http://discord.com/api/webhooks/123/abc").is_err());
        assert!(resolve_webhook("").is_err());
    }

    #[test]
    fn pii_scrubber_removes_windows_user_paths() {
        let sample = r"Loaded from C:\Users\alice\AppData\Roaming\PETABLOCKS Launcher\instances\s2 and D:/Users/bob/Desktop/test.jar";
        let scrubbed = scrub_pii(sample);
        assert!(!scrubbed.contains("alice"), "scrubbed: {scrubbed}");
        assert!(!scrubbed.contains("bob"), "scrubbed: {scrubbed}");
        assert!(scrubbed.contains("<USERPROFILE>"));
    }
}
