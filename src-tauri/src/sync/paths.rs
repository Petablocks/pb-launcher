//! Launcher data directories, path validation, atomic writes and the diagnostic log.

use super::*;

/// Append a timestamped diagnostic message to `%LOCALAPPDATA%\PETABLOCKS Launcher\launcher.log`.
pub fn log_event(level: &str, msg: &str) {
    let root = launcher_root();
    let _ = fs::create_dir_all(&root);
    let log_path = root.join("launcher.log");
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(f, "[{now}] [{level}] {msg}");
    }
}

/// Atomically write `data` to `dest` via a temporary sibling file + `sync_all()` + `fs::rename`.
pub fn atomic_write(dest: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let mut tmp_os = dest.as_os_str().to_owned();
    tmp_os.push(format!(".tmp.{pid}.{nanos}"));
    let tmp_path = PathBuf::from(tmp_os);

    {
        let mut f = File::create(&tmp_path).map_err(|e| e.to_string())?;
        f.write_all(data).map_err(|e| e.to_string())?;
        let _ = f.sync_all();
    }

    fs::rename(&tmp_path, dest).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        e.to_string()
    })
}

/// Primary launcher data directory under `%LOCALAPPDATA%\PETABLOCKS Launcher`.
pub fn launcher_root() -> PathBuf {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("PETABLOCKS Launcher")
}

/// One-time migration from `%APPDATA%\PETABLOCKS Launcher` (Roaming) to `%LOCALAPPDATA%\PETABLOCKS Launcher`.
/// Also merges any missing files/directories if both folders exist (for example if the launcher was
/// updated while running and Roaming could not be renamed atomically).
pub fn migrate_roaming_to_local() {
    let Some(local_base) = dirs::data_local_dir() else {
        return;
    };
    let Some(roaming_base) = dirs::data_dir() else {
        return;
    };
    if local_base == roaming_base {
        return;
    }
    let local_dir = local_base.join("PETABLOCKS Launcher");
    let roaming_dir = roaming_base.join("PETABLOCKS Launcher");
    if !roaming_dir.exists() {
        return;
    }
    if let Some(parent) = local_dir.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if !local_dir.exists() && fs::rename(&roaming_dir, &local_dir).is_ok() {
        log_event(
            "INFO",
            "Migrated launcher data root from Roaming AppData to LocalAppData.",
        );
        return;
    }

    // Fallback: merge any missing files/folders from Roaming into LocalAppData
    let mut moved_any = false;
    merge_dir_into(&roaming_dir, &local_dir, &mut moved_any);
    if moved_any {
        log_event(
            "INFO",
            "Merged remaining launcher data from Roaming AppData into LocalAppData.",
        );
    }
}

pub(crate) fn merge_dir_into(src: &Path, dst: &Path, moved_any: &mut bool) {
    let Ok(entries) = fs::read_dir(src) else {
        return;
    };
    let _ = fs::create_dir_all(dst);
    for entry in entries.flatten() {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            if !dst_path.exists() && fs::rename(&src_path, &dst_path).is_ok() {
                *moved_any = true;
                continue;
            }
            merge_dir_into(&src_path, &dst_path, moved_any);
            let _ = fs::remove_dir(&src_path);
        } else if !dst_path.exists() {
            if fs::rename(&src_path, &dst_path).is_ok() {
                *moved_any = true;
            } else if fs::copy(&src_path, &dst_path).is_ok() {
                let _ = fs::remove_file(&src_path);
                *moved_any = true;
            }
        }
    }
    let _ = fs::remove_dir(src);
}

/// Reject anything that could escape the instances folder (ids/filenames come from the webview).
pub fn is_safe_component(s: &str) -> bool {
    !s.is_empty() && s != "." && s != ".." && !s.contains(['/', '\\', ':', '\0'])
}

/// Strict validator for version identifiers (`minecraft_version`, `neoforge_version`, `instance_id`).
pub fn validate_version_token(name: &str, val: &str) -> Result<(), String> {
    let v = val.trim();
    if v.is_empty() || v.len() > 64 {
        return Err(format!("Invalid {name}: empty or too long."));
    }
    if v.contains("..")
        || !v
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
    {
        return Err(format!("Invalid characters in {name}: {val}"));
    }
    Ok(())
}

pub fn instance_dir(instance_id: &str) -> PathBuf {
    let id = if is_safe_component(instance_id) {
        instance_id
    } else {
        "invalid-instance"
    };
    launcher_root().join("instances").join(id)
}
