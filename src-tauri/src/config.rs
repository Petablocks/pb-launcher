//! Remote launcher configuration: the instance list, the footer ticker and announcements.
//!
//! The config is fetched from this repository's default branch so servers, versions, changelog
//! links and news can change without shipping a launcher release. Every field that reaches the
//! filesystem, the network or the launch command is validated here, and anything invalid is
//! dropped. Order of preference: remote, then the last good cached copy, then the copy compiled
//! into the binary.

use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::{LazyLock, RwLock};
use std::time::Duration;

use crate::ping::{is_allowed_server_host, parse_host_port};
use crate::sync::{
    atomic_write, http_client, is_allowed_download_url, launcher_root, log_event,
    validate_version_token,
};

const REMOTE_CONFIG_URL: &str =
    "https://raw.githubusercontent.com/Petablocks/pb-launcher/master/launcher-config.json";
const BUNDLED_CONFIG: &str = include_str!("../../launcher-config.json");
const SUPPORTED_FORMAT_VERSION: u32 = 1;
const MAX_CONFIG_BYTES: usize = 256 * 1024;
const MAX_INSTANCES: usize = 24;
const MAX_ANNOUNCEMENTS: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceConfig {
    pub id: String,
    pub name: String,
    pub server_address: String,
    pub minecraft_version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub neoforge_version: Option<String>,
    #[serde(default)]
    pub loader: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub loader_icon: Option<String>,
    #[serde(default)]
    pub manifest_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changelog_url: Option<String>,
    pub status: String,
    pub logo_image: String,
    pub bg_image: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub badge: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub play_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_policy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Announcement {
    pub id: String,
    #[serde(default)]
    pub tag: String,
    #[serde(default)]
    pub tone: String,
    #[serde(default)]
    pub date: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub bullets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherConfig {
    pub format_version: u32,
    pub instances: Vec<InstanceConfig>,
    #[serde(default)]
    pub ticker: String,
    #[serde(default)]
    pub announcements: Vec<Announcement>,
}

/// The config currently in effect. Starts as the bundled copy so access policy checks always
/// have an answer, even before the first fetch.
static ACTIVE: LazyLock<RwLock<LauncherConfig>> = LazyLock::new(|| {
    RwLock::new(parse_config(BUNDLED_CONFIG).expect("bundled launcher-config.json must be valid"))
});

fn cache_path() -> std::path::PathBuf {
    launcher_root().join("launcher-config.json")
}

fn clip(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(max).collect()
}

/// Images are either bundled card art or served from hosts the webview CSP already allows.
fn is_allowed_image(src: &str) -> bool {
    if let Some(rest) = src.strip_prefix("/cards/") {
        return !rest.is_empty()
            && !rest.contains("..")
            && rest
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    }
    if src.contains(['"', '\'', '(', ')', ' ', '\\']) {
        return false;
    }
    if src
        .to_ascii_lowercase()
        .starts_with("https://raw.githubusercontent.com/petablocks/")
    {
        return true;
    }
    src.strip_prefix("https://")
        .and_then(|rest| rest.split('/').next())
        .is_some_and(|host| {
            let host = host.to_ascii_lowercase();
            host.ends_with(".petablocks.com")
                && host
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        })
}

fn validate_instance(mut inst: InstanceConfig) -> Result<InstanceConfig, String> {
    validate_version_token("instance id", &inst.id)?;
    let (host, _) = parse_host_port(&inst.server_address);
    if !is_allowed_server_host(&host) {
        return Err(format!(
            "server address not allowed: {}",
            inst.server_address
        ));
    }
    if inst.status != "playable" && inst.status != "coming_soon" {
        return Err(format!("unknown status: {}", inst.status));
    }
    inst.manifest_url = inst.manifest_url.trim().to_string();
    if !inst.manifest_url.is_empty() && !is_allowed_download_url(&inst.manifest_url) {
        return Err("manifest URL not allowed".into());
    }
    if inst.status == "playable" {
        if inst.manifest_url.is_empty() {
            return Err("playable instance has no manifest URL".into());
        }
        validate_version_token("minecraft version", &inst.minecraft_version)?;
    }
    if let Some(nf) = inst.neoforge_version.as_deref() {
        validate_version_token("neoforge version", nf)?;
    }
    if let Some(url) = inst.changelog_url.as_deref() {
        if !is_allowed_download_url(url.trim()) {
            return Err("changelog URL not allowed".into());
        }
    }
    if !is_allowed_image(&inst.logo_image) || !is_allowed_image(&inst.bg_image) {
        return Err("image source not allowed".into());
    }
    if inst
        .loader_icon
        .as_deref()
        .is_some_and(|i| !is_allowed_image(i))
    {
        inst.loader_icon = None;
    }
    if let Some(policy) = inst.access_policy.as_deref() {
        if !matches!(
            policy,
            "public" | "discord_linked" | "beta_role" | "patreon_role"
        ) {
            return Err(format!("unknown access policy: {policy}"));
        }
    }
    inst.name = clip(&inst.name, 64);
    if inst.name.trim().is_empty() {
        return Err("empty name".into());
    }
    inst.minecraft_version = clip(&inst.minecraft_version, 32);
    inst.loader = clip(&inst.loader, 32);
    inst.description = clip(&inst.description, 240);
    inst.badge = inst.badge.map(|b| clip(&b, 32));
    inst.play_label = inst.play_label.map(|b| clip(&b, 32));
    Ok(inst)
}

/// Parses and validates a config document. Invalid instances are dropped (and logged) rather
/// than failing the whole document; a document with no usable playable instance is rejected.
pub fn parse_config(text: &str) -> Result<LauncherConfig, String> {
    if text.len() > MAX_CONFIG_BYTES {
        return Err("launcher config is too large".into());
    }
    let raw: LauncherConfig = serde_json::from_str(text).map_err(|e| e.to_string())?;
    if raw.format_version != SUPPORTED_FORMAT_VERSION {
        return Err(format!(
            "unsupported launcher config format {}",
            raw.format_version
        ));
    }

    let mut instances: Vec<InstanceConfig> = Vec::new();
    for inst in raw.instances.into_iter().take(MAX_INSTANCES) {
        let id = inst.id.clone();
        match validate_instance(inst) {
            Ok(valid) if instances.iter().any(|i| i.id == valid.id) => {
                log_event(
                    "WARN",
                    &format!("Launcher config: duplicate instance '{id}' ignored."),
                );
            }
            Ok(valid) => instances.push(valid),
            Err(e) => log_event(
                "WARN",
                &format!("Launcher config: instance '{}' ignored: {e}", clip(&id, 64)),
            ),
        }
    }
    if !instances.iter().any(|i| i.status == "playable") {
        return Err("launcher config has no valid playable instance".into());
    }

    let announcements = raw
        .announcements
        .into_iter()
        .take(MAX_ANNOUNCEMENTS)
        .filter(|a| !a.title.trim().is_empty())
        .map(|a| Announcement {
            id: clip(&a.id, 64),
            tag: clip(&a.tag, 40),
            tone: clip(&a.tone, 16),
            date: clip(&a.date, 40),
            title: clip(&a.title, 120),
            summary: clip(&a.summary, 600),
            bullets: a.bullets.iter().take(10).map(|b| clip(b, 300)).collect(),
        })
        .collect();

    Ok(LauncherConfig {
        format_version: raw.format_version,
        instances,
        ticker: clip(&raw.ticker, 200),
        announcements,
    })
}

fn set_active(config: &LauncherConfig) {
    if let Ok(mut guard) = ACTIVE.write() {
        *guard = config.clone();
    }
}

/// Whether launching this instance requires a linked Discord account with guild membership.
/// Unknown instances and instances without an explicit `public` policy stay gated.
pub fn instance_requires_discord(instance_id: &str) -> bool {
    let Ok(guard) = ACTIVE.read() else {
        return true;
    };
    !guard
        .instances
        .iter()
        .find(|i| i.id == instance_id)
        .is_some_and(|i| i.access_policy.as_deref() == Some("public"))
}

async fn fetch_remote() -> Option<(LauncherConfig, String)> {
    let res = http_client()
        .get(REMOTE_CONFIG_URL)
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let text = res.text().await.ok()?;
    match parse_config(&text) {
        Ok(cfg) => Some((cfg, text)),
        Err(e) => {
            log_event("WARN", &format!("Remote launcher config rejected: {e}"));
            None
        }
    }
}

/// Returns the best available config and makes it the active one.
pub async fn load_config() -> LauncherConfig {
    if let Some((cfg, text)) = fetch_remote().await {
        let _ = atomic_write(&cache_path(), text.as_bytes());
        set_active(&cfg);
        return cfg;
    }
    if let Some(cfg) = fs::read_to_string(cache_path())
        .ok()
        .and_then(|text| parse_config(&text).ok())
    {
        set_active(&cfg);
        return cfg;
    }
    ACTIVE
        .read()
        .map(|g| g.clone())
        .unwrap_or_else(|_| parse_config(BUNDLED_CONFIG).expect("bundled config is valid"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_config_is_valid_and_complete() {
        let cfg = parse_config(BUNDLED_CONFIG).unwrap();
        let raw: serde_json::Value = serde_json::from_str(BUNDLED_CONFIG).unwrap();
        // Nothing in the shipped config may be dropped by validation.
        assert_eq!(
            cfg.instances.len(),
            raw["instances"].as_array().unwrap().len()
        );
        assert!(cfg.instances.iter().any(|i| i.id == "petablocks-s2"));
    }

    #[test]
    fn access_policy_defaults_to_gated() {
        assert!(instance_requires_discord("petablocks-s2"));
        assert!(!instance_requires_discord("petablocks-create2"));
        assert!(instance_requires_discord("unknown-instance"));
    }

    fn doc(instance_patch: serde_json::Value) -> String {
        let mut inst = serde_json::json!({
            "id": "x", "name": "X", "serverAddress": "x.petablocks.com",
            "minecraftVersion": "1.21.1", "status": "playable",
            "manifestUrl": "https://github.com/Petablocks/pb-modpacks/releases/latest/download/m.json",
            "logoImage": "/cards/logo.png", "bgImage": "/cards/bg.jpg"
        });
        for (k, v) in instance_patch.as_object().unwrap() {
            inst[k] = v.clone();
        }
        serde_json::json!({ "formatVersion": 1, "instances": [inst] }).to_string()
    }

    #[test]
    fn rejects_untrusted_fields() {
        assert!(parse_config(&doc(serde_json::json!({}))).is_ok());
        for bad in [
            serde_json::json!({ "serverAddress": "evil.example.com" }),
            serde_json::json!({ "manifestUrl": "https://evil.example.com/m.json" }),
            serde_json::json!({ "manifestUrl": "" }),
            serde_json::json!({ "id": "../escape" }),
            serde_json::json!({ "neoforgeVersion": "1.0 --evil" }),
            serde_json::json!({ "bgImage": "https://evil.example.com/a.png" }),
            serde_json::json!({ "bgImage": "/cards/../../x" }),
            serde_json::json!({ "bgImage": "https://a.petablocks.com/x.png);background:url(x" }),
            serde_json::json!({ "changelogUrl": "http://github.com/Petablocks/x" }),
            serde_json::json!({ "accessPolicy": "everyone" }),
            serde_json::json!({ "status": "secret" }),
        ] {
            assert!(parse_config(&doc(bad.clone())).is_err(), "{bad}");
        }
        assert!(parse_config(r#"{"formatVersion":2,"instances":[]}"#).is_err());
    }

    #[test]
    fn allows_trusted_remote_images() {
        assert!(is_allowed_image("/cards/bg-season2.jpg"));
        assert!(is_allowed_image("https://cdn.petablocks.com/art/bg.jpg"));
        assert!(is_allowed_image(
            "https://raw.githubusercontent.com/Petablocks/pb-launcher/master/public/cards/x.png"
        ));
        assert!(!is_allowed_image("https://petablocks.com.evil.io/x.png"));
        assert!(!is_allowed_image("data:image/png;base64,AAAA"));
    }
}
