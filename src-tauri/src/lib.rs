mod auth;
mod community;
mod java;
mod launch;
mod ping;
mod settings;
mod sync;
mod updater;

use auth::{DeviceCodeInfo, Session};
use community::{
    CrashReportInfo, DiscordLinkStatus, FeedbackSubmitResult, LauncherLinkCodeResponse,
    ScreenshotItem,
};
use java::JavaStatus;
use launch::LaunchRequest;
use ping::ServerStatus;
use settings::LauncherSettings;
use sync::{CustomModFile, InstanceState, LauncherManifest, PackEntry};
use tauri::{AppHandle, Manager};
use updater::LauncherUpdateInfo;

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
async fn sync_get_changelog(instance_id: String, changelog_url: String) -> Result<String, String> {
    sync::fetch_changelog(&instance_id, &changelog_url).await
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
fn packs_list(instance_id: String) -> Result<Vec<PackEntry>, String> {
    sync::list_packs(&instance_id)
}

#[tauri::command]
fn packs_set_enabled(
    instance_id: String,
    kind: String,
    filename: String,
    enabled: bool,
) -> Result<Vec<PackEntry>, String> {
    sync::set_pack_enabled(&instance_id, &kind, &filename, enabled)
}

#[tauri::command]
fn packs_set_active_shader(
    instance_id: String,
    shader_filename: Option<String>,
) -> Result<Vec<PackEntry>, String> {
    sync::set_active_shader(&instance_id, shader_filename.as_deref())?;
    sync::list_packs(&instance_id)
}

#[tauri::command]
fn packs_open_dir(instance_id: String, kind: String) -> Result<String, String> {
    sync::open_packs_dir(&instance_id, &kind)
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
fn system_memory_mb() -> u64 {
    settings::system_memory_mb()
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

#[tauri::command]
async fn server_ping(address: String) -> ServerStatus {
    ping::ping_server(&address).await
}

#[tauri::command]
fn screenshots_list(instance_id: String) -> Result<Vec<ScreenshotItem>, String> {
    community::list_screenshots(&instance_id)
}

#[tauri::command]
fn screenshots_dir(instance_id: String) -> Result<String, String> {
    community::screenshots_dir(&instance_id)
}

#[tauri::command]
fn crash_latest(instance_id: String) -> Option<CrashReportInfo> {
    community::latest_crash_report(&instance_id)
}

#[tauri::command]
async fn crash_submit_webhook(
    webhook_url: String,
    player_name: String,
    player_uuid: Option<String>,
    instance_id: String,
    summary: String,
    log_snippet: String,
) -> Result<FeedbackSubmitResult, String> {
    community::submit_crash_webhook(
        &webhook_url,
        &player_name,
        player_uuid.as_deref().unwrap_or(""),
        &instance_id,
        &summary,
        &log_snippet,
    )
    .await
}

#[tauri::command]
async fn feedback_submit(
    webhook_url: String,
    target: Option<String>,
    category: String,
    title: String,
    description: String,
    player_name: String,
    player_uuid: Option<String>,
    contact: String,
    launcher_version: String,
    include_diagnostics: bool,
    instance_id: String,
) -> Result<FeedbackSubmitResult, String> {
    community::submit_beta_feedback(
        &webhook_url,
        target.as_deref().unwrap_or("launcher"),
        &category,
        &title,
        &description,
        &player_name,
        player_uuid.as_deref().unwrap_or(""),
        &contact,
        &launcher_version,
        include_diagnostics,
        &instance_id,
    )
    .await
}

#[tauri::command]
async fn updater_check(current_version: String) -> Result<LauncherUpdateInfo, String> {
    updater::check_for_update(&current_version).await
}

#[tauri::command]
async fn updater_install(app: AppHandle, download_url: String, version: String) -> Result<(), String> {
    updater::install_update(app, download_url, version).await
}

#[tauri::command]
fn splash_complete(app: AppHandle) -> Result<(), String> {
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.show();
        let _ = main_win.set_focus();
    }
    if let Some(splash_win) = app.get_webview_window("splash") {
        let _ = splash_win.close();
    }
    Ok(())
}

#[tauri::command]
async fn discord_check_link(uuid: String) -> Result<DiscordLinkStatus, String> {
    community::check_discord_link(&uuid).await
}

#[tauri::command]
async fn discord_request_link_code(
    uuid: String,
    username: String,
) -> Result<LauncherLinkCodeResponse, String> {
    community::request_discord_link_code(&uuid, &username).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first. A second launch surfaces the existing instance instead of silently
        // piling up (or being blocked by) a hidden/stuck one.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Discord IPC does blocking pipe I/O; never let it delay or hang startup.
            std::thread::spawn(|| community::update_discord_rpc("In PETABLOCKS Launcher", "Ready to Play"));
            // If the frontend never calls splash_complete (JS error, slow disk), don't leave an
            // invisible process running: reveal the main window after 20s.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(20)).await;
                if handle.get_webview_window("splash").is_some() {
                    let _ = splash_complete(handle);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth_start_login,
            auth_complete_login,
            auth_restore,
            auth_logout,
            sync_get_manifest,
            sync_get_changelog,
            sync_get_state,
            sync_set_mod_enabled,
            sync_instance,
            sync_list_custom_mods,
            sync_custom_mods_dir,
            packs_list,
            packs_set_enabled,
            packs_set_active_shader,
            packs_open_dir,
            settings_get,
            settings_save,
            system_memory_mb,
            java_detect,
            java_install,
            launch_instance,
            open_instance_dir,
            server_ping,
            screenshots_list,
            screenshots_dir,
            crash_latest,
            crash_submit_webhook,
            feedback_submit,
            updater_check,
            updater_install,
            splash_complete,
            discord_check_link,
            discord_request_link_code
        ])
        .run(tauri::generate_context!())
        .expect("error while running PETABLOCKS Launcher");
}
