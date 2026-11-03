mod auth;
mod java;
mod launch;
mod settings;
mod sync;

use auth::{DeviceCodeInfo, Session};
use java::JavaStatus;
use launch::LaunchRequest;
use settings::LauncherSettings;
use sync::{CustomModFile, InstanceState, LauncherManifest};
use tauri::AppHandle;

#[tauri::command]
async fn auth_start_login() -> Result<DeviceCodeInfo, String> {
    auth::start_device_login().await
}

#[tauri::command]
async fn auth_complete_login(device_code: String, interval: u64, expires_in: u64) -> Result<Session, String> {
    auth::complete_device_login(device_code, interval, expires_in).await
}

#[tauri::command]
async fn auth_restore() -> Result<Option<Session>, String> {
    auth::restore().await
}

#[tauri::command]
fn auth_logout() -> Result<(), String> {
    auth::logout()
}

#[tauri::command]
async fn sync_get_manifest(instance_id: String, manifest_url: String) -> Result<LauncherManifest, String> {
    sync::fetch_manifest(&instance_id, &manifest_url).await
}

#[tauri::command]
fn sync_get_state(instance_id: String) -> InstanceState {
    sync::load_state(&instance_id)
}

#[tauri::command]
fn sync_set_mod_enabled(instance_id: String, slug: String, enabled: bool) -> Result<InstanceState, String> {
    sync::set_mod_enabled(&instance_id, &slug, enabled)
}

#[tauri::command]
async fn sync_instance(app: AppHandle, instance_id: String, manifest_url: String) -> Result<InstanceState, String> {
    sync::sync_instance(app, instance_id, manifest_url).await
}

#[tauri::command]
fn sync_list_custom_mods(instance_id: String) -> Result<Vec<CustomModFile>, String> {
    sync::list_custom_mods(&instance_id)
}

#[tauri::command]
fn sync_custom_mods_dir(instance_id: String) -> Result<String, String> {
    sync::open_custom_mods_dir(&instance_id)
}

#[tauri::command]
fn settings_get() -> LauncherSettings {
    settings::load_settings()
}

#[tauri::command]
fn settings_save(settings: LauncherSettings) -> Result<(), String> {
    settings::save_settings(&settings)
}

#[tauri::command]
fn java_detect() -> JavaStatus {
    java::detect_java()
}

#[tauri::command]
async fn java_install(app: AppHandle) -> Result<JavaStatus, String> {
    java::ensure_java_21(&app).await?;
    Ok(java::detect_java())
}

#[tauri::command]
async fn launch_instance(app: AppHandle, req: LaunchRequest) -> Result<(), String> {
    launch::launch_game(app, req).await
}

#[tauri::command]
fn open_instance_dir(instance_id: String) -> Result<String, String> {
    let dir = sync::instance_dir(&instance_id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            auth_start_login,
            auth_complete_login,
            auth_restore,
            auth_logout,
            sync_get_manifest,
            sync_get_state,
            sync_set_mod_enabled,
            sync_instance,
            sync_list_custom_mods,
            sync_custom_mods_dir,
            settings_get,
            settings_save,
            java_detect,
            java_install,
            launch_instance,
            open_instance_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running PETABLOCKS Launcher");
}
