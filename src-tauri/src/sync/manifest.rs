//! Modpack manifest and changelog types, validation and fetching.

use super::*;

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

pub(crate) fn default_true() -> bool {
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

pub(crate) fn cached_manifest_path(instance_id: &str) -> PathBuf {
    instance_dir(instance_id).join("launcher-manifest.json")
}

pub(crate) async fn fetch_staging_manifest_url(client: &reqwest::Client) -> Option<String> {
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
        let s2_dist = "https://github.com/Petablocks/pb-modpacks/releases/latest/download/launcher-manifest.json".to_string();
        if !candidate_urls.contains(&s2_dist) {
            candidate_urls.push(s2_dist);
        }
        let s2_launcher = "https://github.com/Petablocks/pb-launcher/releases/latest/download/launcher-manifest.json".to_string();
        if !candidate_urls.contains(&s2_launcher) {
            candidate_urls.push(s2_launcher);
        }
    } else if instance_id == "petablocks-create2" {
        let c2_dist = "https://github.com/Petablocks/pb-modpacks/releases/latest/download/launcher-manifest-create2.json".to_string();
        if !candidate_urls.contains(&c2_dist) {
            candidate_urls.push(c2_dist);
        }
        let c2_launcher = "https://github.com/Petablocks/pb-launcher/releases/latest/download/launcher-manifest-create2.json".to_string();
        if !candidate_urls.contains(&c2_launcher) {
            candidate_urls.push(c2_launcher);
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
            "https://github.com/Petablocks/pb-modpacks/releases/latest/download/CHANGELOG.md"
                .to_string(),
        );
        candidate_urls.push(
            "https://github.com/Petablocks/pb-launcher/releases/latest/download/CHANGELOG.md"
                .to_string(),
        );
    } else if instance_id == "petablocks-create2" {
        candidate_urls.push(
            "https://github.com/Petablocks/pb-modpacks/releases/download/create2-v1.4.1/CHANGELOG.md"
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

/// The manifest cached by the most recent successful fetch for this instance, if any.
pub fn load_cached_manifest(instance_id: &str) -> Option<LauncherManifest> {
    let text = fs::read_to_string(cached_manifest_path(instance_id)).ok()?;
    serde_json::from_str(&text).ok()
}
