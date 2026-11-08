use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

use crate::auth::{get_active_mc_session, Session};
use crate::java::ensure_java_21;
use crate::settings::load_settings;
use crate::sync::{
    atomic_write, download_to, http_client, instance_dir, launcher_root, validate_version_token,
    verify_file_hash, ExpectedHash, InstanceActionGuard,
};

const VERSION_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES_BASE_URL: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub instance_id: String,
    pub minecraft_version: String,
    pub neoforge_version: String,
    pub server_address: String,
    pub session: Session,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLogLine {
    pub line: String,
    pub is_error: bool,
}

fn rule_allows_windows(rules: Option<&Vec<Value>>) -> bool {
    let Some(rules) = rules else {
        return true;
    };
    let mut allowed = false;
    for rule in rules {
        let action = rule["action"].as_str().unwrap_or("allow") == "allow";
        if rule.get("features").is_some() {
            continue;
        }
        if let Some(os) = rule.get("os") {
            if os["arch"].as_str().is_some_and(|a| a != "x86_64") {
                continue;
            }
            let os_name = os["name"].as_str().unwrap_or("");
            if os_name == "windows" {
                allowed = action;
            }
        } else {
            allowed = action;
        }
    }
    allowed
}

/// Converts a Maven coordinate `group:artifact:version[:classifier][@ext]` into its relative repository path.
fn maven_coord_to_path(coord: &str) -> Option<String> {
    let (coord, ext) = match coord.split_once('@') {
        Some((c, e)) => (c, e),
        None => (coord, "jar"),
    };
    let parts: Vec<&str> = coord.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let file = if parts.len() >= 4 {
        format!("{artifact}-{version}-{}.{ext}", parts[3])
    } else {
        format!("{artifact}-{version}.{ext}")
    };
    Some(format!("{group}/{artifact}/{version}/{file}"))
}

async fn ensure_file(
    client: &Client,
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
) -> Result<(), String> {
    let expected = match expected_sha1 {
        Some(s) if !s.is_empty() => ExpectedHash::Sha1(s),
        _ => ExpectedHash::None,
    };
    if dest.exists() && verify_file_hash(dest, expected) {
        return Ok(());
    }
    download_to(client, url, dest, expected).await
}

async fn setup_vanilla(
    app: &AppHandle,
    client: &Client,
    mc_version: &str,
    root: &Path,
) -> Result<Value, String> {
    validate_version_token("minecraft_version", mc_version)?;
    let emit = |msg: &str| {
        let _ = app.emit("launch-status", msg.to_string());
    };

    let version_dir = root.join("versions").join(mc_version);
    let version_json_path = version_dir.join(format!("{mc_version}.json"));

    let version_json: Value = if let Ok(txt) = fs::read_to_string(&version_json_path) {
        serde_json::from_str(&txt).map_err(|e| e.to_string())?
    } else {
        emit(&format!("Fetching Minecraft {mc_version} metadata..."));
        let manifest: Value = client
            .get(VERSION_MANIFEST_URL)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        let ver_url = manifest["versions"]
            .as_array()
            .ok_or("Invalid version manifest")?
            .iter()
            .find(|v| v["id"].as_str() == Some(mc_version))
            .and_then(|v| v["url"].as_str())
            .ok_or_else(|| format!("Minecraft version {mc_version} not found"))?;

        let txt = client
            .get(ver_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;

        atomic_write(&version_json_path, txt.as_bytes())?;
        serde_json::from_str(&txt).map_err(|e| e.to_string())?
    };

    // Client jar
    let client_dl = &version_json["downloads"]["client"];
    let client_url = client_dl["url"].as_str().ok_or("Missing client jar URL")?;
    let client_sha1 = client_dl["sha1"].as_str();
    let client_jar = version_dir.join(format!("{mc_version}.jar"));
    emit(&format!("Ensuring Minecraft {mc_version} client jar..."));
    ensure_file(client, client_url, &client_jar, client_sha1).await?;

    // Libraries
    let libs_dir = root.join("libraries");
    let mut lib_tasks = Vec::new();
    if let Some(libs) = version_json["libraries"].as_array() {
        for lib in libs {
            if !rule_allows_windows(lib["rules"].as_array()) {
                continue;
            }
            if let Some(artifact) = lib["downloads"]["artifact"].as_object() {
                if let (Some(path), Some(url)) = (
                    artifact.get("path").and_then(|v| v.as_str()),
                    artifact.get("url").and_then(|v| v.as_str()),
                ) {
                    if path.contains("..") {
                        continue;
                    }
                    let sha = artifact
                        .get("sha1")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    lib_tasks.push((url.to_string(), libs_dir.join(path), sha));
                }
            }
        }
    }

    emit(&format!(
        "Verifying {} vanilla libraries...",
        lib_tasks.len()
    ));
    download_batch(client, lib_tasks).await?;

    // Asset index & objects
    let asset_index = &version_json["assetIndex"];
    let asset_id = asset_index["id"].as_str().ok_or("Missing assetIndex id")?;
    validate_version_token("asset_id", asset_id)?;
    let asset_url = asset_index["url"]
        .as_str()
        .ok_or("Missing assetIndex url")?;
    let asset_sha1 = asset_index["sha1"].as_str();
    let index_path = root
        .join("assets")
        .join("indexes")
        .join(format!("{asset_id}.json"));
    ensure_file(client, asset_url, &index_path, asset_sha1).await?;

    let index_txt = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let index_val: Value = serde_json::from_str(&index_txt).map_err(|e| e.to_string())?;
    let mut asset_tasks = Vec::new();
    if let Some(objects) = index_val["objects"].as_object() {
        for (_name, obj) in objects {
            if let Some(hash) = obj["hash"].as_str() {
                if hash.len() < 4 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
                    continue;
                }
                let prefix = &hash[..2];
                let dest = root.join("assets").join("objects").join(prefix).join(hash);
                if !dest.exists() {
                    let url = format!("{RESOURCES_BASE_URL}/{prefix}/{hash}");
                    asset_tasks.push((url, dest, Some(hash.to_string())));
                }
            }
        }
    }

    if !asset_tasks.is_empty() {
        emit(&format!(
            "Downloading {} game assets...",
            asset_tasks.len()
        ));
        download_batch(client, asset_tasks).await?;
    }

    Ok(version_json)
}

async fn download_batch(
    client: &Client,
    tasks: Vec<(String, PathBuf, Option<String>)>,
) -> Result<(), String> {
    let sem = Arc::new(Semaphore::new(10));
    let mut join_set = JoinSet::new();
    for (url, dest, sha) in tasks {
        let sem = sem.clone();
        let client = client.clone();
        join_set.spawn(async move {
            let _p = sem.acquire().await.map_err(|e| e.to_string())?;
            ensure_file(&client, &url, &dest, sha.as_deref()).await
        });
    }
    while let Some(res) = join_set.join_next().await {
        match res {
            Ok(Ok(())) => {}
            Ok(Err(err)) => {
                join_set.abort_all();
                return Err(err);
            }
            Err(join_err) => {
                join_set.abort_all();
                return Err(join_err.to_string());
            }
        }
    }
    Ok(())
}

async fn setup_neoforge(
    app: &AppHandle,
    client: &Client,
    java_exe: &Path,
    neoforge_version: &str,
    root: &Path,
) -> Result<Value, String> {
    validate_version_token("neoforge_version", neoforge_version)?;
    let profile_id = format!("neoforge-{neoforge_version}");
    let nf_version_dir = root.join("versions").join(&profile_id);
    let nf_json_path = nf_version_dir.join(format!("{profile_id}.json"));

    if !nf_json_path.exists() {
        let _ = app.emit(
            "launch-status",
            format!("Installing NeoForge {neoforge_version} client (one-time setup)..."),
        );

        let profiles_path = root.join("launcher_profiles.json");
        if !profiles_path.exists() {
            atomic_write(&profiles_path, br#"{"profiles":{}}"#)?;
        }

        let installer_url = format!(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{neoforge_version}/neoforge-{neoforge_version}-installer.jar"
        );
        let installer_jar = root
            .join("cache")
            .join(format!("neoforge-{neoforge_version}-installer.jar"));

        // Mandatory fail-closed SHA-1 verification before executing the NeoForge installer jar.
        let sha1_resp = client
            .get(format!("{installer_url}.sha1"))
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| format!("Failed to fetch NeoForge installer SHA-1 checksum: {e}"))?;
        let sha1_text = sha1_resp
            .text()
            .await
            .map_err(|e| format!("Failed reading NeoForge installer SHA-1: {e}"))?;
        let installer_sha1: String = sha1_text.trim().chars().take(40).collect();
        if installer_sha1.len() != 40 || !installer_sha1.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(
                "NeoForge Maven returned an invalid SHA-1 checksum; refusing to execute unverified installer."
                    .into(),
            );
        }

        ensure_file(
            client,
            &installer_url,
            &installer_jar,
            Some(&installer_sha1),
        )
        .await?;

        let mut cmd = TokioCommand::new(java_exe);
        cmd.arg("-jar")
            .arg(&installer_jar)
            .arg("--installClient")
            .arg(root)
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        cmd.creation_flags(0x08000000);

        let status = cmd
            .status()
            .await
            .map_err(|e| format!("Failed to run NeoForge installer: {e}"))?;

        if !status.success() {
            return Err(format!("NeoForge installer exited with status {status}"));
        }
    }

    let txt = fs::read_to_string(&nf_json_path)
        .map_err(|e| format!("Failed reading NeoForge version profile: {e}"))?;
    let nf_json: Value = serde_json::from_str(&txt).map_err(|e| e.to_string())?;

    let libs_dir = root.join("libraries");
    let mut tasks = Vec::new();
    if let Some(libs) = nf_json["libraries"].as_array() {
        for lib in libs {
            if let Some(artifact) = lib["downloads"]["artifact"].as_object() {
                if let (Some(path), Some(url)) = (
                    artifact.get("path").and_then(|v| v.as_str()),
                    artifact.get("url").and_then(|v| v.as_str()),
                ) {
                    if !url.is_empty() && !path.contains("..") {
                        let sha = artifact
                            .get("sha1")
                            .and_then(|v| v.as_str())
                            .map(String::from);
                        tasks.push((url.to_string(), libs_dir.join(path), sha));
                    }
                }
            }
        }
    }
    if !tasks.is_empty() {
        download_batch(client, tasks).await?;
    }

    Ok(nf_json)
}

fn expand_placeholders(arg: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = arg.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("${{{k}}}"), v);
    }
    out
}

fn collect_args(node: &Value, vars: &HashMap<&str, String>) -> Vec<String> {
    let mut out = Vec::new();
    let Some(arr) = node.as_array() else {
        return out;
    };
    for item in arr {
        if let Some(s) = item.as_str() {
            out.push(expand_placeholders(s, vars));
        } else if let Some(obj) = item.as_object() {
            if !rule_allows_windows(obj.get("rules").and_then(|r| r.as_array())) {
                continue;
            }
            if let Some(val) = obj.get("value") {
                if let Some(s) = val.as_str() {
                    out.push(expand_placeholders(s, vars));
                } else if let Some(list) = val.as_array() {
                    for v in list {
                        if let Some(s) = v.as_str() {
                            out.push(expand_placeholders(s, vars));
                        }
                    }
                }
            }
        }
    }
    out
}

fn collect_library_paths(ver_json: &Value, libs_dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let Some(libs) = ver_json["libraries"].as_array() else {
        return out;
    };
    for lib in libs {
        if !rule_allows_windows(lib["rules"].as_array()) {
            continue;
        }
        let rel = lib["downloads"]["artifact"]["path"]
            .as_str()
            .map(String::from)
            .or_else(|| lib["name"].as_str().and_then(maven_coord_to_path));
        if let Some(r) = rel {
            if r.contains("..") {
                continue;
            }
            let full = libs_dir.join(r.replace('/', "\\"));
            if full.exists() {
                out.push(full.to_string_lossy().to_string());
            }
        }
    }
    out
}

/// Assigns the spawned child process to a Windows Job Object so OS process accounting groups it cleanly.
#[cfg(windows)]
fn assign_child_to_job_object(pid: u32) {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::JobObjects::{AssignProcessToJobObject, CreateJobObjectW};
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return;
        }
        let proc_handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if !proc_handle.is_null() {
            let _ = AssignProcessToJobObject(job, proc_handle);
            let _ = CloseHandle(proc_handle);
        }
        // Keep the job handle open without JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE so an updater restart
        // does not abruptly kill a live world save.
        let _ = CloseHandle(job);
    }
}

pub async fn launch_game(app: AppHandle, req: LaunchRequest) -> Result<(), String> {
    // 1. Validate all version and instance identifiers before touching the filesystem
    validate_version_token("instance_id", &req.instance_id)?;
    validate_version_token("minecraft_version", &req.minecraft_version)?;
    if !req.neoforge_version.trim().is_empty() {
        validate_version_token("neoforge_version", &req.neoforge_version)?;
    }

    // 2. Acquire per-instance concurrency guard (transferred to the exit watcher once spawned)
    let instance_guard = InstanceActionGuard::try_acquire(&req.instance_id, false)?;

    // 3. Retrieve verified Minecraft session & JWT strictly from Rust memory
    let Some((verified_profile, mc_access_token)) = get_active_mc_session() else {
        return Err(
            "Launch blocked: A verified Microsoft account owning Minecraft: Java Edition is required before launching."
                .into(),
        );
    };
    if req.session.offline || verified_profile.uuid.trim().is_empty() || mc_access_token.trim().is_empty() {
        return Err(
            "Launch blocked: Your Minecraft session is offline or expired. Please sign in again."
                .into(),
        );
    }

    // 4. Backend enforcement of Closed Beta Discord link & guild membership
    if let Ok(discord) = crate::community::check_discord_link(&verified_profile.uuid).await {
        if !discord.linked || !discord.in_guild {
            return Err(
                "Launch blocked: Please link your Discord account and join the PETABLOCKS Discord server to play."
                    .into(),
            );
        }
    }

    let settings = load_settings();
    let root = launcher_root();
    let game_dir = instance_dir(&req.instance_id);
    fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;

    // 5. Ensure Java 21
    let java_exe = crate::java::cli_java(&ensure_java_21(&app).await?);

    // 6. Ensure Vanilla 1.21.1 + assets
    let client = http_client();
    let vanilla_json = setup_vanilla(&app, client, &req.minecraft_version, &root).await?;

    // 7. Ensure NeoForge
    let nf_json = setup_neoforge(&app, client, &java_exe, &req.neoforge_version, &root).await?;

    // 8. Construct Classpath & Arguments
    let libs_dir = root.join("libraries");
    let assets_dir = root.join("assets");
    let natives_dir = root.join("natives").join(&req.minecraft_version);
    fs::create_dir_all(&natives_dir).map_err(|e| e.to_string())?;

    let mut cp_entries = collect_library_paths(&nf_json, &libs_dir);
    for p in collect_library_paths(&vanilla_json, &libs_dir) {
        if !cp_entries.contains(&p) {
            cp_entries.push(p);
        }
    }

    if req.neoforge_version.trim().is_empty() {
        let vanilla_jar = root
            .join("versions")
            .join(&req.minecraft_version)
            .join(format!("{}.jar", req.minecraft_version));
        cp_entries.push(vanilla_jar.to_string_lossy().to_string());
    } else {
        let vanilla_filename = format!("{}.jar", req.minecraft_version);
        cp_entries.retain(|p| !p.ends_with(&vanilla_filename));
    }

    let classpath = cp_entries.join(";");
    let asset_index_id = vanilla_json["assetIndex"]["id"]
        .as_str()
        .unwrap_or(&req.minecraft_version)
        .to_string();
    let profile_id = format!("neoforge-{}", req.neoforge_version);

    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("auth_player_name", verified_profile.name.clone());
    vars.insert("version_name", profile_id.clone());
    vars.insert("game_directory", game_dir.to_string_lossy().to_string());
    vars.insert("assets_root", assets_dir.to_string_lossy().to_string());
    vars.insert("assets_index_name", asset_index_id);
    vars.insert("auth_uuid", verified_profile.uuid.clone());
    vars.insert("auth_access_token", mc_access_token);
    vars.insert("clientid", "acbc8721-204e-4445-8c3f-962fa445d718".into());
    vars.insert("auth_xuid", "0".into());
    vars.insert("user_type", "msa".into());
    vars.insert("version_type", "release".into());
    vars.insert(
        "natives_directory",
        natives_dir.to_string_lossy().to_string(),
    );
    vars.insert("launcher_name", "PETABLOCKS-Launcher".into());
    vars.insert("launcher_version", env!("CARGO_PKG_VERSION").into());
    vars.insert("classpath", classpath);
    vars.insert("classpath_separator", ";".into());
    vars.insert("library_directory", libs_dir.to_string_lossy().to_string());

    let mut full_args: Vec<String> = Vec::new();
    let total_mb = crate::settings::system_memory_mb();
    let cap = if total_mb > 0 {
        ((total_mb * 3 / 4).max(2048)) as u32
    } else {
        u32::MAX
    };
    let xmx = settings.memory_mb.max(1024).min(cap);
    full_args.push(format!("-Xmx{xmx}M"));
    full_args.push(format!("-Xms{}M", xmx.min(2048)));
    for extra in settings.extra_jvm_args.split_whitespace() {
        full_args.push(extra.to_string());
    }
    full_args.extend(collect_args(&vanilla_json["arguments"]["jvm"], &vars));
    full_args.extend(collect_args(&nf_json["arguments"]["jvm"], &vars));

    let main_class = nf_json["mainClass"]
        .as_str()
        .or_else(|| vanilla_json["mainClass"].as_str())
        .ok_or("Missing mainClass")?;
    full_args.push(main_class.to_string());

    full_args.extend(collect_args(&vanilla_json["arguments"]["game"], &vars));
    full_args.extend(collect_args(&nf_json["arguments"]["game"], &vars));

    if settings.direct_connect && !req.server_address.trim().is_empty() {
        full_args.push("--quickPlayMultiplayer".into());
        full_args.push(req.server_address.trim().to_string());
    }

    let _ = app.emit("launch-status", "Starting Minecraft (NeoForge)...");
    let _ = app.emit("game-state", "running");

    let mut mc_cmd = TokioCommand::new(&java_exe);
    mc_cmd
        .current_dir(&game_dir)
        .args(&full_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    mc_cmd.creation_flags(0x08000000);

    let mut child = mc_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Minecraft process: {e}"))?;

    let game_pid = child.id().unwrap_or_else(std::process::id);
    #[cfg(windows)]
    assign_child_to_job_object(game_pid);

    // Record session start (+1 session) and notify frontend
    let initial_state = crate::sync::record_session_start(&req.instance_id);
    let _ = app.emit("playtime-updated", (&req.instance_id, &initial_state));

    let server_addr = req.server_address.clone();
    let rpc_start = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Non-blocking Discord RPC update via background IPC worker
    crate::community::update_discord_rpc_with_pid(
        "Playing PETABLOCKS Season 2",
        &format!("Connected to {server_addr}"),
        game_pid,
        Some(rpc_start),
    );

    let (rpc_tx, mut rpc_rx) = tokio::sync::mpsc::channel::<()>(1);
    let last_saved_instant = Arc::new(std::sync::Mutex::new(Instant::now()));
    let last_saved_for_tick = last_saved_instant.clone();
    let inst_for_tick = req.instance_id.clone();
    let app_for_tick = app.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
        interval.tick().await;
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let delta = {
                        if let Ok(mut guard) = last_saved_for_tick.lock() {
                            let d = guard.elapsed().as_secs();
                            if d > 0 {
                                *guard = Instant::now();
                            }
                            d
                        } else {
                            0
                        }
                    };
                    if delta > 0 {
                        let inst_clone = inst_for_tick.clone();
                        if let Ok(st) = tokio::task::spawn_blocking(move || {
                            crate::sync::add_playtime_delta(&inst_clone, delta)
                        }).await {
                            let _ = app_for_tick.emit("playtime-updated", (&inst_for_tick, &st));
                        }
                    }

                    crate::community::update_discord_rpc_with_pid(
                        "Playing PETABLOCKS Season 2",
                        &format!("Connected to {server_addr}"),
                        game_pid,
                        Some(rpc_start),
                    );
                }
                _ = rpc_rx.recv() => break,
            }
        }
    });

    let log_file_path = game_dir.join("launcher-game.log");
    let log_file = Arc::new(std::sync::Mutex::new(
        std::fs::File::create(&log_file_path).ok(),
    ));

    if settings.close_on_launch {
        if let Some(main_win) = app.get_webview_window("main") {
            let _ = main_win.minimize();
        }
    }

    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        let file_clone = log_file.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(mut f) = file_clone.lock() {
                    if let Some(file) = f.as_mut() {
                        use std::io::Write;
                        let _ = writeln!(file, "{line}");
                    }
                }
                let _ = app_clone.emit("game-log", GameLogLine { line, is_error: false });
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        let file_clone = log_file.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(mut f) = file_clone.lock() {
                    if let Some(file) = f.as_mut() {
                        use std::io::Write;
                        let _ = writeln!(file, "[ERR] {line}");
                    }
                }
                let _ = app_clone.emit("game-log", GameLogLine { line, is_error: true });
            }
        });
    }

    let app_wait = app.clone();
    let inst_id = req.instance_id.clone();
    let last_saved_for_exit = last_saved_instant.clone();
    tokio::spawn(async move {
        // Hold instance_guard until the JVM process exits so a second launch cannot start concurrently
        let _keep_guard = instance_guard;
        let code = child.wait().await.ok().and_then(|s| s.code()).unwrap_or(-1);
        let _ = rpc_tx.send(()).await;
        let remainder = last_saved_for_exit
            .lock()
            .ok()
            .map(|mut g| {
                let d = g.elapsed().as_secs();
                *g = Instant::now();
                d
            })
            .unwrap_or(0);
        let inst_for_final = inst_id.clone();
        if let Ok(final_state) = tokio::task::spawn_blocking(move || {
            crate::sync::add_playtime_delta(&inst_for_final, remainder)
        })
        .await
        {
            let _ = app_wait.emit("playtime-updated", (&inst_id, &final_state));
        }
        crate::community::update_discord_rpc("In PETABLOCKS Launcher", "Ready to Play");
        if let Some(main_win) = app_wait.get_webview_window("main") {
            let _ = main_win.show();
            let _ = main_win.unminimize();
            let _ = main_win.set_focus();
        }
        let _ = app_wait.emit("game-state", format!("stopped:{code}"));
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maven_coords() {
        assert_eq!(
            maven_coord_to_path("net.neoforged:neoforge:21.1.259").unwrap(),
            "net/neoforged/neoforge/21.1.259/neoforge-21.1.259.jar"
        );
        assert_eq!(
            maven_coord_to_path("a.b:c:1.0:natives@zip").unwrap(),
            "a/b/c/1.0/c-1.0-natives.zip"
        );
        assert!(maven_coord_to_path("bad:coord").is_none());
    }

    #[test]
    fn os_rules() {
        let none: Vec<Value> = vec![];
        assert!(!rule_allows_windows(Some(&none)));
        assert!(rule_allows_windows(None));
        let win = vec![json!({"action": "allow", "os": {"name": "windows"}})];
        assert!(rule_allows_windows(Some(&win)));
        let linux = vec![json!({"action": "allow", "os": {"name": "linux"}})];
        assert!(!rule_allows_windows(Some(&linux)));
        let arm = vec![json!({"action": "allow", "os": {"name": "windows", "arch": "arm64"}})];
        assert!(!rule_allows_windows(Some(&arm)));
    }
}
