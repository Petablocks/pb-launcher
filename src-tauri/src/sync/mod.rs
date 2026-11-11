//! Modpack synchronisation: mod downloads, `.mrpack` overrides and stale-file cleanup.
//! Supporting concerns live in the submodules and are re-exported from here.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha1::{Digest as _, Sha1};
use sha2::{Sha256, Sha512};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::{Notify, Semaphore};
use tokio::task::JoinSet;

mod download;
mod manifest;
mod packs;
mod paths;
mod state;

pub use download::*;
pub use manifest::*;
pub use packs::*;
pub use paths::*;
pub use state::*;

const CONCURRENT_DOWNLOADS: usize = 6;
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub instance_id: String,
    pub stage: String,
    pub current: usize,
    pub total: usize,
    pub detail: String,
}

/// Error returned when the player cancels a sync; the UI matches on it to stay quiet.
pub const SYNC_CANCELLED: &str = "Sync cancelled.";

/// Cancellation handles for in-flight syncs, keyed by instance ID.
static SYNC_CANCELS: LazyLock<Mutex<HashMap<String, Arc<Notify>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn cancel_sync(instance_id: &str) -> Result<(), String> {
    let handle = SYNC_CANCELS
        .lock()
        .map_err(|_| "Internal lock poisoned".to_string())?
        .get(instance_id)
        .cloned();
    match handle {
        Some(cancel) => {
            cancel.notify_one();
            Ok(())
        }
        None => Err("No sync is in progress for that instance.".into()),
    }
}

/// Syncs an instance to its manifest. Cancellable via [`cancel_sync`]: dropping the inner
/// future aborts in-flight downloads, and the installed version is only recorded on success,
/// so the next sync resumes from the files that already verified.
pub async fn sync_instance(
    app: AppHandle,
    instance_id: String,
    manifest_url: String,
) -> Result<InstanceState, String> {
    validate_version_token("instance_id", &instance_id)?;
    let cancel = Arc::new(Notify::new());
    // Only the sync that registered the handle may remove it; a rejected concurrent sync for
    // the same instance must not make the running one uncancellable.
    let registered = SYNC_CANCELS
        .lock()
        .map(|mut m| {
            if m.contains_key(&instance_id) {
                false
            } else {
                m.insert(instance_id.clone(), cancel.clone());
                true
            }
        })
        .unwrap_or(false);

    let result = tokio::select! {
        res = sync_instance_inner(app, instance_id.clone(), manifest_url) => res,
        _ = cancel.notified() => Err(SYNC_CANCELLED.to_string()),
    };

    if registered {
        if let Ok(mut m) = SYNC_CANCELS.lock() {
            m.remove(&instance_id);
        }
    }
    result
}

async fn sync_instance_inner(
    app: AppHandle,
    instance_id: String,
    manifest_url: String,
) -> Result<InstanceState, String> {
    let _instance_guard = InstanceActionGuard::try_acquire(&instance_id, true)?;

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
    let state_snapshot = load_state(&instance_id);
    let base_dir = instance_dir(&instance_id);
    fs::create_dir_all(base_dir.join("mods").join("custom")).map_err(|e| e.to_string())?;

    let disabled_set: HashSet<String> = state_snapshot.disabled_mods.iter().cloned().collect();

    // 1. Offload mod hash verification and optional mod toggling to a blocking thread pool
    emit(
        "mods",
        0,
        manifest.mods.len(),
        "Verifying installed mods...",
    );
    let mods_clone = manifest.mods.clone();
    let base_for_check = base_dir.clone();
    let to_download: Vec<LauncherMod> = tokio::task::spawn_blocking(move || {
        let mut queue = Vec::new();
        for m in &mods_clone {
            let rel_path = validate_mod_rel_path(&m.path)?;
            let is_disabled = m.optional && disabled_set.contains(&m.slug);
            let active_path = base_for_check.join(&rel_path);
            let disabled_path =
                base_for_check.join(format!("{}.disabled", rel_path.to_string_lossy()));

            if is_disabled {
                if active_path.exists() {
                    let _ = fs::rename(&active_path, &disabled_path);
                }
                continue;
            } else if disabled_path.exists() && !active_path.exists() {
                let _ = fs::rename(&disabled_path, &active_path);
            }

            let valid = verify_file_hash(&active_path, ExpectedHash::from_mod(m));
            if !valid && !m.url.trim().is_empty() {
                queue.push(m.clone());
            }
        }
        Ok::<Vec<LauncherMod>, String>(queue)
    })
    .await
    .map_err(|e| e.to_string())??;

    // 2. Download missing or outdated mods in parallel using JoinSet (aborts siblings on error)
    let total_dl = to_download.len();
    if total_dl > 0 {
        let sem = Arc::new(Semaphore::new(CONCURRENT_DOWNLOADS));
        let client = http_client().clone();
        let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let mut join_set = JoinSet::new();

        for m in to_download {
            let sem = sem.clone();
            let client = client.clone();
            let base = base_dir.clone();
            let app = app.clone();
            let inst = instance_id.clone();
            let completed = completed.clone();

            join_set.spawn(async move {
                let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
                let rel_path = validate_mod_rel_path(&m.path)?;
                let dest = base.join(&rel_path);
                let expected = ExpectedHash::from_mod(&m);
                download_to(&client, m.url.trim(), &dest, expected)
                    .await
                    .map_err(|e| format!("{}: {e}", m.slug))?;
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
            });
        }

        while let Some(res) = join_set.join_next().await {
            match res {
                Ok(Ok(())) => {}
                Ok(Err(err)) => {
                    join_set.abort_all();
                    return Err(err);
                }
                Err(join_err) => {
                    join_set.abort_all();
                    return Err(join_err.to_string());
                }
            }
        }
    }

    // 3. Apply overrides from .mrpack if version changed or if shaderpacks/options are missing
    let shaderpacks_dir = base_dir.join("shaderpacks");
    let has_shaderpacks = fs::read_dir(&shaderpacks_dir)
        .map(|mut d| d.any(|e| e.is_ok()))
        .unwrap_or(false);
    let needs_overrides = state_snapshot.installed_version.as_deref() != Some(&manifest.version)
        || !has_shaderpacks
        || !base_dir.join("options.txt").exists();
    if needs_overrides {
        emit("overrides", 0, 1, "Applying modpack configs & overrides...");
        if let Err(e) = apply_mrpack_overrides(&instance_id, &base_dir, &manifest).await {
            log_event("ERROR", &format!("Overrides failed for {instance_id}: {e}"));
            return Err(format!("Failed to apply modpack configs & overrides: {e}"));
        }
    }

    // 4. Copy custom player mods and clean up stale mods on blocking worker
    let base_for_cleanup = base_dir.clone();
    let manifest_for_cleanup = manifest.clone();
    tokio::task::spawn_blocking(move || {
        sync_custom_mods(&base_for_cleanup, &manifest_for_cleanup)?;
        cleanup_stale_mods(&base_for_cleanup, &manifest_for_cleanup)
    })
    .await
    .map_err(|e| e.to_string())??;

    let final_state = {
        let _guard = STATE_LOCK
            .lock()
            .map_err(|_| "State lock poisoned".to_string())?;
        let mut st = load_state_unlocked(&instance_id);
        st.installed_version = Some(manifest.version.clone());
        save_state_unlocked(&instance_id, &st)?;
        st
    };

    emit("done", 1, 1, &format!("Up to date (v{})", manifest.version));
    Ok(final_state)
}

async fn apply_mrpack_overrides(
    instance_id: &str,
    base_dir: &Path,
    manifest: &LauncherManifest,
) -> Result<(), String> {
    validate_version_token("manifest.version", &manifest.version)?;
    let client = http_client();

    let mut candidate_urls = Vec::new();
    let trimmed = manifest.mrpack_url.trim();
    if !trimmed.is_empty() && is_allowed_download_url(trimmed) {
        candidate_urls.push(trimmed.to_string());
    }
    if instance_id == "petablocks-s2" {
        let s2_dist_tag = format!(
            "https://github.com/Petablocks/pb-modpacks/releases/download/s2-v{}/PETABLOCKS-Season-2-{}.mrpack",
            manifest.version, manifest.version
        );
        let s2_gh = format!(
            "https://github.com/Petablocks/pb-launcher/releases/latest/download/PETABLOCKS-Season-2-{}.mrpack",
            manifest.version
        );
        let s2_dist_gh = format!(
            "https://github.com/Petablocks/pb-modpacks/releases/latest/download/PETABLOCKS-Season-2-{}.mrpack",
            manifest.version
        );
        if !candidate_urls.contains(&s2_dist_tag) {
            candidate_urls.push(s2_dist_tag);
        }
        if !candidate_urls.contains(&s2_gh) {
            candidate_urls.push(s2_gh);
        }
        if !candidate_urls.contains(&s2_dist_gh) {
            candidate_urls.push(s2_dist_gh);
        }
    } else if instance_id == "petablocks-create2" {
        let c2_dist_tag = format!(
            "https://github.com/Petablocks/pb-modpacks/releases/download/create2-v{}/PETABLOCKS-Create-2-{}.mrpack",
            manifest.version, manifest.version
        );
        let c2_dist_gh = format!(
            "https://github.com/Petablocks/pb-modpacks/releases/latest/download/PETABLOCKS-Create-2-{}.mrpack",
            manifest.version
        );
        let c2_gh = format!(
            "https://github.com/Petablocks/pb-launcher/releases/latest/download/PETABLOCKS-Create-2-{}.mrpack",
            manifest.version
        );
        if !candidate_urls.contains(&c2_dist_tag) {
            candidate_urls.push(c2_dist_tag);
        }
        if !candidate_urls.contains(&c2_dist_gh) {
            candidate_urls.push(c2_dist_gh);
        }
        if !candidate_urls.contains(&c2_gh) {
            candidate_urls.push(c2_gh);
        }
    }

    if candidate_urls.is_empty() {
        return Err("No valid .mrpack download URL configured in manifest.".into());
    }

    let cache_dir = launcher_root().join("cache");
    let mrpack_dest = cache_dir.join(format!("{instance_id}-{}.mrpack", manifest.version));
    let expected = match manifest.mrpack_sha256.as_deref().filter(|s| s.len() == 64) {
        Some(sha) => ExpectedHash::Sha256(sha),
        None => ExpectedHash::None,
    };

    let mut downloaded = false;
    if mrpack_dest.exists()
        && matches!(expected, ExpectedHash::Sha256(_))
        && verify_file_hash(&mrpack_dest, expected)
    {
        downloaded = true;
    } else {
        for url in &candidate_urls {
            if download_to(client, url, &mrpack_dest, expected)
                .await
                .is_ok()
            {
                downloaded = true;
                break;
            }
        }
    }

    if !downloaded {
        return Err("Could not download or verify the modpack overrides (.mrpack).".into());
    }

    let base_owned = base_dir.to_path_buf();
    let mrpack_owned = mrpack_dest.clone();
    tokio::task::spawn_blocking(move || {
        let file = File::open(&mrpack_owned).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            // enclosed_name() rejects `..` / absolute paths (zip-slip)
            let Some(path) = entry.enclosed_name() else {
                continue;
            };
            let Ok(rel_path) = path.strip_prefix("overrides") else {
                continue;
            };
            if rel_path.as_os_str().is_empty() || entry.is_dir() {
                continue;
            }
            let rel = rel_path.to_string_lossy().replace('\\', "/");
            let dest = base_owned.join(rel_path);
            // Preserve existing user options.txt & servers.dat if already created
            if (rel == "options.txt" || rel == "servers.dat") && dest.exists() {
                continue;
            }
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = File::create(&dest).map_err(|e| format!("{rel}: {e}"))?;
            if entry.size() > 0 {
                io::copy(&mut entry, &mut out).map_err(|e| format!("{rel}: {e}"))?;
            }
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn sync_custom_mods(base_dir: &Path, manifest: &LauncherManifest) -> Result<(), String> {
    let custom_dir = base_dir.join("mods").join("custom");
    let mods_dir = base_dir.join("mods");
    let managed: HashSet<String> = manifest
        .mods
        .iter()
        .filter_map(|m| {
            Path::new(&m.path)
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
        })
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

fn cleanup_stale_mods(base_dir: &Path, manifest: &LauncherManifest) -> Result<(), String> {
    let mods_dir = base_dir.join("mods");
    let custom_dir = mods_dir.join("custom");

    let mut allowed: HashSet<String> = HashSet::new();
    for m in &manifest.mods {
        if let Some(f) = Path::new(&m.path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
        {
            let dis = format!("{f}.disabled");
            allowed.insert(f);
            allowed.insert(dis);
        }
    }

    if let Ok(entries) = fs::read_dir(&custom_dir) {
        for entry in entries.flatten() {
            let fname = entry.file_name().to_string_lossy().to_string();
            let dis = format!("{fname}.disabled");
            allowed.insert(fname);
            allowed.insert(dis);
        }
    }

    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let fname = entry.file_name().to_string_lossy().to_string();
                if (fname.ends_with(".jar") || fname.ends_with(".jar.disabled"))
                    && !allowed.contains(&fname)
                {
                    let backup = mods_dir.join("_removed");
                    if fs::create_dir_all(&backup).is_ok()
                        && fs::rename(&path, backup.join(&fname)).is_err()
                    {
                        let _ = fs::remove_file(&path);
                    }
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_escapes() {
        for bad in ["", ".", "..", "a/b", "a\\b", "C:", "a\0b"] {
            assert!(!is_safe_component(bad), "{bad:?}");
        }
        assert!(is_safe_component("petablocks-s2"));
        assert!(instance_dir("../../x").ends_with("invalid-instance"));
    }

    #[test]
    fn validates_mod_paths() {
        assert!(validate_mod_rel_path("mods/create-1.21.1.jar").is_ok());
        assert!(validate_mod_rel_path("mods/..\\evil.exe").is_err());
        assert!(validate_mod_rel_path("mods/sub/nested.jar").is_err());
        assert!(validate_mod_rel_path("config/options.txt").is_err());
        assert!(validate_mod_rel_path("C:\\Windows\\System32\\cmd.exe").is_err());
        assert!(validate_mod_rel_path("mods/not-a-jar.exe").is_err());
    }

    #[test]
    fn validates_download_urls() {
        assert!(is_allowed_download_url(
            "https://cdn.modrinth.com/data/abc/versions/1/mod.jar"
        ));
        assert!(is_allowed_download_url(
            "https://github.com/Petablocks/pb-launcher/releases/latest/download/launcher-manifest.json"
        ));
        assert!(is_allowed_download_url(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.259/neoforge-21.1.259-installer.jar"
        ));
        assert!(!is_allowed_download_url(
            "http://cdn.modrinth.com/data/abc/mod.jar"
        ));
        assert!(!is_allowed_download_url("https://evil.example.com/mod.jar"));
        assert!(!is_allowed_download_url(
            "https://github.com/other-org/malicious/releases/download/v1/mod.jar"
        ));
    }

    #[test]
    fn validates_version_tokens() {
        assert!(validate_version_token("mc", "1.21.1").is_ok());
        assert!(validate_version_token("nf", "21.1.259").is_ok());
        assert!(validate_version_token("mc", "../1.21.1").is_err());
        assert!(validate_version_token("mc", "1.21.1\\..\\evil").is_err());
    }

    #[test]
    fn merges_roaming_into_existing_local() {
        let base = std::env::temp_dir().join(format!("pb_merge_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let src = base.join("roaming");
        let dst = base.join("local");
        fs::create_dir_all(
            src.join("instances")
                .join("petablocks-s2")
                .join("shaderpacks"),
        )
        .unwrap();
        fs::write(
            src.join("instances")
                .join("petablocks-s2")
                .join("shaderpacks")
                .join("ComplementaryReimagined.zip"),
            b"shader",
        )
        .unwrap();
        fs::create_dir_all(dst.join("instances").join("petablocks-s2")).unwrap();
        fs::write(dst.join("launcher.log"), b"log").unwrap();

        let mut moved = false;
        merge_dir_into(&src, &dst, &mut moved);
        assert!(moved);
        assert!(dst
            .join("instances")
            .join("petablocks-s2")
            .join("shaderpacks")
            .join("ComplementaryReimagined.zip")
            .is_file());
        assert!(dst.join("launcher.log").is_file());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn test_extract_create2_mrpack_reproduction() {
        let mrpack_path = Path::new("../PETABLOCKS-Create-2-1.4.1.mrpack");
        if !mrpack_path.exists() {
            println!("mrpack not found at {:?}", mrpack_path);
            return;
        }
        let temp_dir = std::env::temp_dir().join("test_create2_extract");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let file = File::open(mrpack_path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        println!("Archive total entries: {}", archive.len());
        let mut extracted = 0;
        let mut skipped = 0;
        for i in 0..archive.len() {
            let mut entry = match archive.by_index(i) {
                Ok(e) => e,
                Err(err) => {
                    panic!("Failed to read entry {i}: {err}");
                }
            };
            let Some(p) = entry.enclosed_name() else {
                skipped += 1;
                continue;
            };
            let Ok(rel_path) = p.strip_prefix("overrides") else {
                skipped += 1;
                continue;
            };
            if rel_path.as_os_str().is_empty() || entry.is_dir() {
                skipped += 1;
                continue;
            }
            let rel = rel_path.to_string_lossy().replace('\\', "/");
            let dest = temp_dir.join(rel_path);
            if (rel == "options.txt" || rel == "servers.dat") && dest.exists() {
                skipped += 1;
                continue;
            }
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            let mut out = match File::create(&dest) {
                Ok(f) => f,
                Err(err) => {
                    panic!("Failed to create file for {dest:?}: {err}");
                }
            };
            if entry.size() > 0 {
                if let Err(err) = std::io::copy(&mut entry, &mut out) {
                    panic!(
                        "Failed to extract {:?} (entry index {}): {}",
                        entry.name(),
                        i,
                        err
                    );
                }
            }
            extracted += 1;
        }
        println!("Extracted {extracted} files successfully, skipped {skipped}");
        assert!(temp_dir.join("kubejs").exists(), "kubejs folder must exist");
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
