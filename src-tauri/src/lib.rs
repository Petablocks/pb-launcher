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
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_opener::OpenerExt;
use updater::LauncherUpdateInfo;

#[tauri::command]
async fn auth_start_login() -> Result<DeviceCodeInfo, String> {
    auth::start_device_login().await
}

#[tauri::command]
async fn auth_complete_login(
    device_code: String,
    interval: u64,
    expires_in: u64,
) -> Result<Session, String> {
    auth::complete_device_login(device_code, interval, expires_in).await
}

#[tauri::command]
async fn auth_restore() -> Result<Option<Session>, String> {
    auth::restore().await
}

#[tauri::command]
async fn auth_logout() -> Result<(), String> {
    tokio::task::spawn_blocking(auth::logout)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sync_get_manifest(
    instance_id: String,
    manifest_url: String,
) -> Result<LauncherManifest, String> {
    sync::fetch_manifest(&instance_id, &manifest_url).await
}

#[tauri::command]
async fn sync_get_changelog(instance_id: String, changelog_url: String) -> Result<String, String> {
    sync::fetch_changelog(&instance_id, &changelog_url).await
}

#[tauri::command]
async fn sync_get_state(instance_id: String) -> Result<InstanceState, String> {
    tokio::task::spawn_blocking(move || sync::load_state(&instance_id))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_set_mod_enabled(
    instance_id: String,
    slug: String,
    enabled: bool,
) -> Result<InstanceState, String> {
    tokio::task::spawn_blocking(move || sync::set_mod_enabled(&instance_id, &slug, enabled))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sync_instance(
    app: AppHandle,
    instance_id: String,
    manifest_url: String,
) -> Result<InstanceState, String> {
    sync::sync_instance(app, instance_id, manifest_url).await
}

#[tauri::command]
async fn sync_list_custom_mods(instance_id: String) -> Result<Vec<CustomModFile>, String> {
    tokio::task::spawn_blocking(move || sync::list_custom_mods(&instance_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn sync_custom_mods_dir(app: AppHandle, instance_id: String) -> Result<String, String> {
    let dir = tokio::task::spawn_blocking(move || sync::open_custom_mods_dir(&instance_id))
        .await
        .map_err(|e| e.to_string())??;
    app.opener()
        .open_path(&dir, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
async fn packs_list(instance_id: String) -> Result<Vec<PackEntry>, String> {
    tokio::task::spawn_blocking(move || sync::list_packs(&instance_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn packs_set_enabled(
    instance_id: String,
    kind: String,
    filename: String,
    enabled: bool,
) -> Result<Vec<PackEntry>, String> {
    tokio::task::spawn_blocking(move || {
        sync::set_pack_enabled(&instance_id, &kind, &filename, enabled)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn packs_set_active_shader(
    instance_id: String,
    shader_filename: Option<String>,
) -> Result<Vec<PackEntry>, String> {
    tokio::task::spawn_blocking(move || {
        sync::set_active_shader(&instance_id, shader_filename.as_deref())?;
        sync::list_packs(&instance_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn packs_open_dir(
    app: AppHandle,
    instance_id: String,
    kind: String,
) -> Result<String, String> {
    let dir = tokio::task::spawn_blocking(move || sync::open_packs_dir(&instance_id, &kind))
        .await
        .map_err(|e| e.to_string())??;
    app.opener()
        .open_path(&dir, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
async fn settings_get() -> Result<LauncherSettings, String> {
    tokio::task::spawn_blocking(settings::load_settings)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn settings_save(settings: LauncherSettings) -> Result<(), String> {
    tokio::task::spawn_blocking(move || settings::save_settings(&settings))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn system_memory_mb() -> Result<u64, String> {
    tokio::task::spawn_blocking(settings::system_memory_mb)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn java_detect() -> Result<JavaStatus, String> {
    tokio::task::spawn_blocking(java::detect_java)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn java_install(app: AppHandle) -> Result<JavaStatus, String> {
    java::ensure_java_21(&app).await?;
    tokio::task::spawn_blocking(java::detect_java)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launch_instance(app: AppHandle, req: LaunchRequest) -> Result<(), String> {
    launch::launch_game(app, req).await
}

#[tauri::command]
async fn open_instance_dir(app: AppHandle, instance_id: String) -> Result<String, String> {
    let dir = tokio::task::spawn_blocking(move || {
        let dir = sync::instance_dir(&instance_id);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok::<String, String>(dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    app.opener()
        .open_path(&dir, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
async fn server_ping(address: String) -> ServerStatus {
    ping::ping_server(&address).await
}

#[tauri::command]
async fn screenshots_list(
    app: AppHandle,
    instance_id: String,
) -> Result<Vec<ScreenshotItem>, String> {
    let inst_for_scope = instance_id.clone();
    let list = tokio::task::spawn_blocking(move || community::list_screenshots(&instance_id))
        .await
        .map_err(|e| e.to_string())??;
    let shots_dir = sync::instance_dir(&inst_for_scope).join("screenshots");
    let _ = app.asset_protocol_scope().allow_directory(&shots_dir, false);
    Ok(list)
}

#[tauri::command]
async fn screenshots_dir(app: AppHandle, instance_id: String) -> Result<String, String> {
    let dir = tokio::task::spawn_blocking(move || community::screenshots_dir(&instance_id))
        .await
        .map_err(|e| e.to_string())??;
    app.opener()
        .open_path(&dir, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
async fn screenshot_open_file(
    app: AppHandle,
    instance_id: String,
    filename: String,
) -> Result<(), String> {
    if !sync::is_safe_component(&filename) {
        return Err("Invalid screenshot filename.".into());
    }
    let path = sync::instance_dir(&instance_id)
        .join("screenshots")
        .join(&filename);
    if !path.is_file() {
        return Err("Screenshot file not found.".into());
    }
    app.opener()
        .open_path(path.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn crash_latest(instance_id: String) -> Result<Option<CrashReportInfo>, String> {
    tokio::task::spawn_blocking(move || community::latest_crash_report(&instance_id))
        .await
        .map_err(|e| e.to_string())
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
#[allow(clippy::too_many_arguments)]
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
async fn updater_install(
    app: AppHandle,
    download_url: String,
    version: String,
) -> Result<(), String> {
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
    // Migrate legacy %APPDATA% (Roaming) data to %LOCALAPPDATA% on first launch
    sync::migrate_roaming_to_local();

    // Install panic hook that logs panics to %LOCALAPPDATA%\PETABLOCKS Launcher\launcher.log
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let msg = community::scrub_pii(&info.to_string());
        sync::log_event("PANIC", &msg);
        default_hook(info);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    if sync::is_any_sync_active() {
                        api.prevent_close();
                        let _ = window.emit(
                            "launch-status",
                            "Please wait for the active modpack download to finish before closing."
                                .to_string(),
                        );
                    }
                }
            }
        })
        .setup(|app| {
            let root = sync::launcher_root();
            let _ = std::fs::create_dir_all(&root);
            let _ = app.asset_protocol_scope().allow_directory(&root, true);
            community::update_discord_rpc("In PETABLOCKS Launcher", "Ready to Play");
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
            screenshot_open_file,
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
