use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;

const CONCURRENT_DOWNLOADS: usize = 6;
const USER_AGENT: &str = "PETABLOCKS-Launcher/0.3.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherMod {
    pub slug: String,
    pub path: String,
    pub url: String,
    pub sha1: String,
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
    pub mods: Vec<LauncherMod>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstanceState {
    pub installed_version: Option<String>,
    pub disabled_mods: Vec<String>,
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

fn http() -> Client {
    Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(60))
        .build()
        .expect("http client")
}

pub fn launcher_root() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("PETABLOCKS Launcher")
}

pub fn instance_dir(instance_id: &str) -> PathBuf {
    launcher_root().join("instances").join(instance_id)
}

fn state_path(instance_id: &str) -> PathBuf {
    instance_dir(instance_id).join("launcher-state.json")
}

fn cached_manifest_path(instance_id: &str) -> PathBuf {
    instance_dir(instance_id).join("launcher-manifest.json")
}

pub fn load_state(instance_id: &str) -> InstanceState {
    let p = state_path(instance_id);
    fs::read_to_string(p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_state(instance_id: &str, state: &InstanceState) -> Result<(), String> {
    let dir = instance_dir(instance_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(state_path(instance_id), json).map_err(|e| e.to_string())
}

pub async fn fetch_manifest(instance_id: &str, manifest_url: &str) -> Result<LauncherManifest, String> {
    let client = http();
    match client.get(manifest_url).send().await {
        Ok(res) if res.status().is_success() => {
            let text = res.text().await.map_err(|e| e.to_string())?;
            let manifest: LauncherManifest = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            let dir = instance_dir(instance_id);
            let _ = fs::create_dir_all(&dir);
            let _ = fs::write(cached_manifest_path(instance_id), &text);
            Ok(manifest)
        }
        _ => {
            // Fallback to cached local manifest or local sibling repo for offline/dev testing
            let cached = cached_manifest_path(instance_id);
            if let Ok(text) = fs::read_to_string(&cached) {
                if let Ok(m) = serde_json::from_str(&text) {
                    return Ok(m);
                }
            }
            // Local workspace fallback if developing alongside petablocks-modpack-s2
            let dev_fallback = PathBuf::from(r"c:\Users\michael\Documents\GitHub\petablocks-modpack-s2\dist\launcher-manifest.json");
            if let Ok(text) = fs::read_to_string(&dev_fallback) {
                if let Ok(m) = serde_json::from_str::<LauncherManifest>(&text) {
                    let dir = instance_dir(instance_id);
                    let _ = fs::create_dir_all(&dir);
                    let _ = fs::write(&cached, &text);
                    return Ok(m);
                }
            }
            Err("Unable to fetch modpack manifest from GitHub Releases (and no local cache found).".into())
        }
    }
}

fn sha1_file(path: &Path) -> Option<String> {
    let mut f = File::open(path).ok()?;
    let mut hasher = Sha1::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hex::encode(hasher.finalize()))
}

pub fn set_mod_enabled(instance_id: &str, slug: &str, enabled: bool) -> Result<InstanceState, String> {
    let mut state = load_state(instance_id);
    state.disabled_mods.retain(|s| s != slug);
    if !enabled {
        state.disabled_mods.push(slug.to_string());
    }
    save_state(instance_id, &state)?;

    // Also rename on disk immediately if present
    if let Ok(text) = fs::read_to_string(cached_manifest_path(instance_id)) {
        if let Ok(manifest) = serde_json::from_str::<LauncherManifest>(&text) {
            if let Some(m) = manifest.mods.iter().find(|m| m.slug == slug && m.optional) {
                let base = instance_dir(instance_id);
                let active_path = base.join(&m.path);
                let disabled_path = base.join(format!("{}.disabled", m.path));
                if enabled && disabled_path.exists() && !active_path.exists() {
                    let _ = fs::rename(&disabled_path, &active_path);
                } else if !enabled && active_path.exists() {
                    let _ = fs::rename(&active_path, &disabled_path);
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

pub async fn sync_instance(
    app: AppHandle,
    instance_id: String,
    manifest_url: String,
) -> Result<InstanceState, String> {
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
    let mut state = load_state(&instance_id);
    let base_dir = instance_dir(&instance_id);
    fs::create_dir_all(base_dir.join("mods").join("custom")).map_err(|e| e.to_string())?;

    let disabled_set: HashSet<String> = state.disabled_mods.iter().cloned().collect();

    // 1. Determine which mods need downloading or toggling
    let mut to_download: Vec<LauncherMod> = Vec::new();
    for m in &manifest.mods {
        let is_disabled = m.optional && disabled_set.contains(&m.slug);
        let active_path = base_dir.join(&m.path);
        let disabled_path = base_dir.join(format!("{}.disabled", m.path));

        if is_disabled {
            if active_path.exists() {
                let _ = fs::rename(&active_path, &disabled_path);
            }
            continue;
        } else if disabled_path.exists() && !active_path.exists() {
            let _ = fs::rename(&disabled_path, &active_path);
        }

        let valid = sha1_file(&active_path)
            .map(|h| h.eq_ignore_ascii_case(&m.sha1))
            .unwrap_or(false);
        if !valid {
            to_download.push(m.clone());
        }
    }

    // 2. Download missing or outdated mods in parallel
    let total_dl = to_download.len();
    if total_dl > 0 {
        let sem = Arc::new(Semaphore::new(CONCURRENT_DOWNLOADS));
        let client = http();
        let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut handles = Vec::with_capacity(total_dl);

        for m in to_download {
            let sem = sem.clone();
            let client = client.clone();
            let base = base_dir.clone();
            let app = app.clone();
            let inst = instance_id.clone();
            let completed = completed.clone();

            handles.push(tokio::spawn(async move {
                let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
                let dest = base.join(&m.path);
                if let Some(parent) = dest.parent() {
                    tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
                }

                let bytes = client
                    .get(&m.url)
                    .send()
                    .await
                    .map_err(|e| format!("{}: {e}", m.slug))?
                    .bytes()
                    .await
                    .map_err(|e| format!("{}: {e}", m.slug))?;

                let mut hasher = Sha1::new();
                hasher.update(&bytes);
                let got = hex::encode(hasher.finalize());
                if !got.eq_ignore_ascii_case(&m.sha1) {
                    return Err(format!("SHA-1 mismatch for {} (expected {}, got {})", m.slug, m.sha1, got));
                }

                tokio::fs::write(&dest, &bytes).await.map_err(|e| e.to_string())?;
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
            }));
        }

        for h in handles {
            h.await.map_err(|e| e.to_string())??;
        }
    }

    // 3. Apply overrides from .mrpack if version changed
    if state.installed_version.as_deref() != Some(&manifest.version) {
        emit("overrides", 0, 1, "Applying modpack configs & overrides...");
        let _ = apply_mrpack_overrides(&base_dir, &manifest).await;
    }

    // 4. Copy any custom player mods from mods/custom/*.jar into mods/ (non-destructive)
    sync_custom_mods(&base_dir, &manifest)?;

    state.installed_version = Some(manifest.version.clone());
    save_state(&instance_id, &state)?;
    emit("done", 1, 1, &format!("Up to date (v{})", manifest.version));
    Ok(state)
}

async fn apply_mrpack_overrides(base_dir: &Path, manifest: &LauncherManifest) -> Result<(), String> {
    let client = http();
    let mrpack_bytes = match client.get(&manifest.mrpack_url).send().await {
        Ok(res) if res.status().is_success() => res.bytes().await.ok().map(|b| b.to_vec()),
        _ => {
            let local_mrpack = PathBuf::from(format!(
                r"c:\Users\michael\Documents\GitHub\petablocks-modpack-s2\dist\PETABLOCKS-Season-2-{}.mrpack",
                manifest.version
            ));
            fs::read(local_mrpack).ok()
        }
    };

    let Some(bytes) = mrpack_bytes else {
        return Ok(());
    };

    let reader = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        let Some(rel) = name.strip_prefix("overrides/") else { continue };
        if rel.is_empty() || entry.is_dir() {
            continue;
        }
        let dest = base_dir.join(rel);
        // Preserve existing user options.txt & servers.dat if already created
        if (rel == "options.txt" || rel == "servers.dat") && dest.exists() {
            continue;
        }
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(mut out) = File::create(&dest) {
            let _ = io::copy(&mut entry, &mut out);
        }
    }
    Ok(())
}

fn sync_custom_mods(base_dir: &Path, manifest: &LauncherManifest) -> Result<(), String> {
    let custom_dir = base_dir.join("mods").join("custom");
    let mods_dir = base_dir.join("mods");
    let managed: HashSet<String> = manifest
        .mods
        .iter()
        .filter_map(|m| Path::new(&m.path).file_name().map(|f| f.to_string_lossy().to_string()))
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
