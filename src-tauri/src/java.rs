use reqwest::Client;
use serde::Serialize;
use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::settings::load_settings;
use crate::sync::launcher_root;

const ADOPTIUM_WINDOWS_X64_JRE21: &str =
    "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaStatus {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: String, // "custom", "managed", "system", or "missing"
}

fn managed_runtime_dir() -> PathBuf {
    launcher_root().join("runtime").join("java-21")
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn probe_java(java_exe: &Path) -> Option<String> {
    if !java_exe.exists() {
        return None;
    }
    let mut cmd = Command::new(java_exe);
    cmd.arg("-version");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let out = cmd.output().ok()?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    let combined = format!("{stderr}\n{stdout}");
    let first_line = combined.lines().next()?.to_string();
    // Require Java 21+
    if combined.contains("\"21.") || combined.contains("\"22.") || combined.contains(" 21.") {
        Some(first_line)
    } else {
        None
    }
}

fn find_java_in_dir(dir: &Path) -> Option<PathBuf> {
    let direct = dir.join("bin").join("java.exe");
    if direct.exists() {
        return Some(direct);
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let sub = entry.path().join("bin").join("java.exe");
            if sub.exists() {
                return Some(sub);
            }
        }
    }
    None
}

pub fn detect_java() -> JavaStatus {
    let settings = load_settings();

    // 1. Check user custom Java path if configured
    if let Some(custom) = settings.custom_java_path.as_ref().filter(|s| !s.trim().is_empty()) {
        let p = PathBuf::from(custom);
        if let Some(ver) = probe_java(&p) {
            return JavaStatus {
                found: true,
                path: Some(p.to_string_lossy().to_string()),
                version: Some(ver),
                source: "custom".into(),
            };
        }
    }

    // 2. Check managed Adoptium runtime inside launcher directory
    let managed = managed_runtime_dir();
    if let Some(exe) = find_java_in_dir(&managed) {
        if let Some(ver) = probe_java(&exe) {
            return JavaStatus {
                found: true,
                path: Some(exe.to_string_lossy().to_string()),
                version: Some(ver),
                source: "managed".into(),
            };
        }
    }

    // 3. Check JAVA_HOME & standard Windows Adoptium / Oracle / Microsoft JDK paths
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(jh) = std::env::var("JAVA_HOME") {
        candidates.push(PathBuf::from(jh));
    }
    candidates.push(PathBuf::from(r"C:\Program Files\Eclipse Adoptium"));
    candidates.push(PathBuf::from(r"C:\Program Files\Java"));
    candidates.push(PathBuf::from(r"C:\Program Files\Microsoft"));
    candidates.push(PathBuf::from(r"C:\Program Files\BellSoft"));
    candidates.push(PathBuf::from(r"C:\Program Files\Zulu"));

    for base in candidates {
        if let Some(exe) = find_java_in_dir(&base) {
            if let Some(ver) = probe_java(&exe) {
                return JavaStatus {
                    found: true,
                    path: Some(exe.to_string_lossy().to_string()),
                    version: Some(ver),
                    source: "system".into(),
                };
            }
        }
    }

    JavaStatus {
        found: false,
        path: None,
        version: None,
        source: "missing".into(),
    }
}

pub async fn ensure_java_21(app: &AppHandle) -> Result<PathBuf, String> {
    let status = detect_java();
    if status.found {
        if let Some(p) = status.path {
            return Ok(PathBuf::from(p));
        }
    }

    let _ = app.emit(
        "launch-status",
        "Downloading Adoptium OpenJDK 21 runtime (first-time setup)...",
    );

    let client = Client::builder()
        .user_agent("PETABLOCKS-Launcher/0.4.0")
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(ADOPTIUM_WINDOWS_X64_JRE21)
        .send()
        .await
        .map_err(|e| format!("Failed to download Java 21: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Adoptium API returned HTTP {}", res.status()));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("Failed reading Java 21 archive: {e}"))?;

    let target_dir = managed_runtime_dir();
    let _ = fs::remove_dir_all(&target_dir);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let _ = app.emit("launch-status", "Extracting OpenJDK 21 runtime...");

    let reader = io::Cursor::new(bytes.to_vec());
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let out_path = target_dir.join(rel);
        if entry.is_dir() {
            let _ = fs::create_dir_all(&out_path);
        } else {
            if let Some(p) = out_path.parent() {
                let _ = fs::create_dir_all(p);
            }
            let mut out_file = File::create(&out_path).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
        }
    }

    find_java_in_dir(&target_dir).ok_or_else(|| "Extracted Java 21 archive but java.exe was not found.".into())
}
