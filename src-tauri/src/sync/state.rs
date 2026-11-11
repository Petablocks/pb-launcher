//! Per-instance persisted state (installed version, optional mods, playtime) and activity guards.

use super::*;

/// Mutex serializing all read-modify-write operations on `launcher-state.json` and `settings.json`.
pub static STATE_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

/// Active instances currently syncing or running a game process.
pub(crate) static ACTIVE_INSTANCES: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

/// Active sync operations count (for CloseRequested warning).
pub(crate) static ACTIVE_SYNCS: LazyLock<Mutex<usize>> = LazyLock::new(|| Mutex::new(0));

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

pub(crate) fn state_path(instance_id: &str) -> PathBuf {
    instance_dir(instance_id).join("launcher-state.json")
}

pub fn load_state(instance_id: &str) -> InstanceState {
    let _guard = STATE_LOCK.lock().ok();
    load_state_unlocked(instance_id)
}

pub(crate) fn load_state_unlocked(instance_id: &str) -> InstanceState {
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

pub(crate) fn save_state_unlocked(instance_id: &str, state: &InstanceState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    atomic_write(&state_path(instance_id), json.as_bytes())
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
