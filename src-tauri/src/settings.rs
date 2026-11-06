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
    #[serde(default = "default_tuning_preset")]
    pub tuning_preset: String, // "eco", "standard", "enthusiast", "custom"
    #[serde(default = "default_true")]
    pub close_on_launch: bool,
    pub direct_connect: bool,
    #[serde(default)]
    pub crash_webhook_url: Option<String>,
}

fn default_tuning_preset() -> String {
    "standard".to_string()
}

fn default_true() -> bool {
    true
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            memory_mb: 8192, // 8 GB default for optimal NeoForge + Create 1.21.1 performance
            custom_java_path: None,
            tuning_preset: "standard".into(),
            extra_jvm_args: "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch".into(),
            close_on_launch: true, // Hide launcher while playing and restore when Minecraft closes
            direct_connect: true,
            crash_webhook_url: None,
        }
    }
}

/// Total physical RAM in MB (0 if unknown).
pub fn system_memory_mb() -> u64 {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.total_memory() / (1024 * 1024)
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
