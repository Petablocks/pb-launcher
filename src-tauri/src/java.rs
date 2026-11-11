use serde::Serialize;
use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

use crate::events::emit_launch_status;
use crate::settings::load_settings;
use crate::sync::{download_to, http_client, launcher_root, ExpectedHash};

/// Release metadata (download link + SHA-256) for the latest Temurin 21 Windows x64 JRE.
const ADOPTIUM_WINDOWS_X64_JRE21_META: &str =
    "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse";

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

/// `javaw.exe` is the GUI-subsystem binary and may print nothing for `-version` or when its
/// stdio is piped, so use the sibling `java.exe` (with CREATE_NO_WINDOW) for probing and launching.
pub fn cli_java(java_exe: &Path) -> PathBuf {
    if java_exe
        .file_name()
        .is_some_and(|n| n.eq_ignore_ascii_case("javaw.exe"))
    {
        let sibling = java_exe.with_file_name("java.exe");
        if sibling.exists() {
            return sibling;
        }
    }
    java_exe.to_path_buf()
}

/// Parses the major Java version number from `java -version` output (handles `"21"`, `"21.0.5"`,
/// `"22.0.1"`, `"23"`, `"1.8.0_412"`, etc.).
pub fn parse_java_major(output: &str) -> Option<u32> {
    // 1. Check quoted version string first, e.g. `openjdk version "21.0.5"` or `java version "21"`
    if let Some(first_quote) = output.find('"') {
        let rest = &output[first_quote + 1..];
        if let Some(end_quote) = rest.find('"') {
            let ver_token = &rest[..end_quote];
            if let Some(major) = extract_major_from_token(ver_token) {
                return Some(major);
            }
        }
    }
    // 2. Fallback: scan whitespace tokens after `version` or `openjdk`
    for word in output.split_whitespace() {
        let clean = word.trim_matches('"');
        if clean.chars().next().is_some_and(|c| c.is_ascii_digit()) {
            if let Some(major) = extract_major_from_token(clean) {
                return Some(major);
            }
        }
    }
    None
}

fn extract_major_from_token(token: &str) -> Option<u32> {
    let mut parts = token.split(['.', '-', '_', '+']);
    let first = parts.next()?.parse::<u32>().ok()?;
    if first == 1 {
        parts.next()?.parse::<u32>().ok()
    } else {
        Some(first)
    }
}

fn probe_java(java_exe: &Path) -> Option<String> {
    if !java_exe.exists() {
        return None;
    }
    let mut cmd = Command::new(cli_java(java_exe));
    cmd.arg("-version");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let out = cmd.output().ok()?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    let combined = format!("{stderr}\n{stdout}");
    let first_line = combined.lines().next()?.to_string();
    // Require Java 21+ (supports GA "21", "21.0.x", 22, 23, etc.)
    if parse_java_major(&combined).is_some_and(|major| major >= 21) {
        Some(first_line)
    } else {
        None
    }
}

fn find_java_in_dir(dir: &Path) -> Option<PathBuf> {
    #[cfg(windows)]
    let preferred = "javaw.exe";
    #[cfg(not(windows))]
    let preferred = "java";

    let direct_pref = dir.join("bin").join(preferred);
    if direct_pref.exists() {
        return Some(direct_pref);
    }
    let direct_java = dir.join("bin").join("java.exe");
    if direct_java.exists() {
        return Some(direct_java);
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let sub_pref = entry.path().join("bin").join(preferred);
            if sub_pref.exists() {
                return Some(sub_pref);
            }
            let sub_java = entry.path().join("bin").join("java.exe");
            if sub_java.exists() {
                return Some(sub_java);
            }
        }
    }
    None
}

pub fn detect_java() -> JavaStatus {
    let settings = load_settings();

    // 1. Check user custom Java path if configured
    if let Some(custom) = settings
        .custom_java_path
        .as_ref()
        .filter(|s| !s.trim().is_empty())
    {
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

    // 3. Check JAVA_HOME & standard Windows ProgramFiles directories dynamically
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(jh) = std::env::var("JAVA_HOME") {
        if !jh.trim().is_empty() {
            candidates.push(PathBuf::from(jh));
        }
    }

    let mut prog_dirs = Vec::new();
    for env_key in ["ProgramW6432", "ProgramFiles"] {
        if let Ok(val) = std::env::var(env_key) {
            let pb = PathBuf::from(val);
            if !prog_dirs.contains(&pb) {
                prog_dirs.push(pb);
            }
        }
    }
    if prog_dirs.is_empty() {
        prog_dirs.push(PathBuf::from(r"C:\Program Files"));
    }

    for prog in prog_dirs {
        for vendor in ["Eclipse Adoptium", "Java", "Microsoft", "BellSoft", "Zulu"] {
            candidates.push(prog.join(vendor));
        }
    }

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

pub async fn ensure_java_21(app: &AppHandle, instance_id: Option<&str>) -> Result<PathBuf, String> {
    let status = tokio::task::spawn_blocking(detect_java)
        .await
        .map_err(|e| e.to_string())?;
    if status.found {
        if let Some(p) = status.path {
            return Ok(PathBuf::from(p));
        }
    }

    emit_launch_status(
        app,
        instance_id,
        "Downloading Adoptium OpenJDK 21 runtime (first-time setup)...",
    );

    let client = http_client();
    let meta: serde_json::Value = client
        .get(ADOPTIUM_WINDOWS_X64_JRE21_META)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Failed to query Adoptium: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Invalid Adoptium response: {e}"))?;
    let pkg = &meta[0]["binary"]["package"];
    let link = pkg["link"]
        .as_str()
        .ok_or("Adoptium response had no download link")?;
    let checksum = pkg["checksum"]
        .as_str()
        .ok_or("Adoptium response had no checksum")?;
    if !link.starts_with("https://") {
        return Err("Adoptium download link is not HTTPS.".into());
    }

    let zip_dest = launcher_root().join("cache").join("adoptium-jre21-x64.zip");
    download_to(client, link, &zip_dest, ExpectedHash::Sha256(checksum))
        .await
        .map_err(|e| format!("Failed to download or verify Java 21 runtime: {e}"))?;

    emit_launch_status(app, instance_id, "Extracting OpenJDK 21 runtime...");

    let zip_for_extract = zip_dest.clone();
    let extracted_exe = tokio::task::spawn_blocking(move || {
        let target_dir = managed_runtime_dir();
        let _ = fs::remove_dir_all(&target_dir);
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

        let file = File::open(&zip_for_extract).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
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
        let _ = fs::remove_file(&zip_for_extract);
        find_java_in_dir(&target_dir)
            .ok_or_else(|| "Extracted Java 21 archive but java.exe was not found.".to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(extracted_exe)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_java_major_versions() {
        assert_eq!(
            parse_java_major("openjdk version \"21\" 2023-09-19"),
            Some(21)
        );
        assert_eq!(
            parse_java_major("openjdk version \"21.0.5\" 2024-10-15 LTS"),
            Some(21)
        );
        assert_eq!(
            parse_java_major("openjdk version \"23.0.1\" 2024-10-15"),
            Some(23)
        );
        assert_eq!(parse_java_major("java version \"1.8.0_412\""), Some(8));
        assert_eq!(parse_java_major("openjdk 21.0.4 2024-07-16"), Some(21));
    }
}
