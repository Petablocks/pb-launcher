mod auth;

use auth::{DeviceCodeInfo, Session};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            auth_start_login,
            auth_complete_login,
            auth_restore,
            auth_logout
        ])
        .run(tauri::generate_context!())
        .expect("error while running PETABLOCKS Launcher");
}
