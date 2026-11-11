//! Typed payloads for events emitted to the webview. Every launch / game event carries the
//! instance it belongs to so the UI can track several instances independently.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchStatusEvent {
    /// `None` for launcher-wide notices (e.g. "wait for the download before closing").
    pub instance_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStateEvent {
    pub instance_id: String,
    /// `"running"` or `"stopped"`.
    pub state: &'static str,
    pub exit_code: Option<i32>,
    /// True when the player ended the game from the launcher, so a non-zero exit is not a crash.
    pub stopped_by_user: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLogLine {
    pub line: String,
    pub is_error: bool,
}

/// Game output is delivered in batches rather than one IPC event per line.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLogBatch {
    pub instance_id: String,
    pub lines: Vec<GameLogLine>,
}

pub fn emit_launch_status(app: &AppHandle, instance_id: Option<&str>, message: &str) {
    let _ = app.emit(
        "launch-status",
        LaunchStatusEvent {
            instance_id: instance_id.map(str::to_string),
            message: message.to_string(),
        },
    );
}

pub fn emit_game_state(
    app: &AppHandle,
    instance_id: &str,
    state: &'static str,
    exit_code: Option<i32>,
    stopped_by_user: bool,
) {
    let _ = app.emit(
        "game-state",
        GameStateEvent {
            instance_id: instance_id.to_string(),
            state,
            exit_code,
            stopped_by_user,
        },
    );
}
