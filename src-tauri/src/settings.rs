use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::sync::launcher_root;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    pub memory_mb: u32,
    pub custom_java_path: Option<String>,
    pub extra_jvm_args: String,
    pub close_on_launch: bool,
    pub direct_connect: bool,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            memory_mb: 6144, // 6 GB recommended default for PETABLOCKS Season 2
            custom_java_path: None,
            extra_jvm_args: "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC".into(),
            close_on_launch: false,
            direct_connect: true,
        }
    }
}

fn settings_path() -> PathBuf {
    launcher_root().join("settings.json")
}

pub fn load_settings() -> LauncherSettings {
    fs::read_to_string(settings_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_settings(settings: &LauncherSettings) -> Result<(), String> {
    let root = launcher_root();
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(settings_path(), json).map_err(|e| e.to_string())
}
