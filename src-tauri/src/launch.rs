use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::Semaphore;

use crate::auth::Session;
use crate::java::ensure_java_21;
use crate::settings::load_settings;
use crate::sync::{instance_dir, launcher_root};

const VERSION_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
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

fn http() -> Client {
    Client::builder()
        .user_agent(concat!("PETABLOCKS-Launcher/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(120))
        .build()
        .expect("http client")
}

fn sha1_file(path: &Path) -> Option<String> {
    let mut f = File::open(path).ok()?;
    let mut hasher = Sha1::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hex::encode(hasher.finalize()))
}

fn rule_allows_windows(rules: Option<&Vec<Value>>) -> bool {
    let Some(rules) = rules else {
        return true;
    };
    let mut allowed = false;
    for rule in rules {
        let action = rule["action"].as_str().unwrap_or("allow") == "allow";
        // Skip feature-gated rules like is_demo_user or has_custom_resolution
        if rule.get("features").is_some() {
            continue;
        }
        if let Some(os) = rule.get("os") {
            // We only target 64-bit x86; arm64/x86 rules never match.
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

async fn ensure_file(client: &Client, url: &str, dest: &Path, expected_sha1: Option<&str>) -> Result<(), String> {
    if dest.exists() {
        if let Some(sha) = expected_sha1 {
            if sha1_file(dest).map(|h| h.eq_ignore_ascii_case(sha)).unwrap_or(false) {
                return Ok(());
            }
        } else {
            return Ok(());
        }
    }
    crate::sync::download_to(client, url, dest, expected_sha1).await
}

async fn setup_vanilla(
    app: &AppHandle,
    client: &Client,
    mc_version: &str,
    root: &Path,
) -> Result<Value, String> {
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

        fs::create_dir_all(&version_dir).map_err(|e| e.to_string())?;
        fs::write(&version_json_path, &txt).map_err(|e| e.to_string())?;
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
                    let sha = artifact.get("sha1").and_then(|v| v.as_str()).map(String::from);
                    lib_tasks.push((url.to_string(), libs_dir.join(path), sha));
                }
            }
        }
    }

    emit(&format!("Verifying {} vanilla libraries...", lib_tasks.len()));
    download_batch(client, lib_tasks).await?;

    // Asset index & objects
    let asset_index = &version_json["assetIndex"];
    let asset_id = asset_index["id"].as_str().ok_or("Missing assetIndex id")?;
    let asset_url = asset_index["url"].as_str().ok_or("Missing assetIndex url")?;
    let asset_sha1 = asset_index["sha1"].as_str();
    let index_path = root.join("assets").join("indexes").join(format!("{asset_id}.json"));
    ensure_file(client, asset_url, &index_path, asset_sha1).await?;

    let index_txt = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let index_val: Value = serde_json::from_str(&index_txt).map_err(|e| e.to_string())?;
    let mut asset_tasks = Vec::new();
    if let Some(objects) = index_val["objects"].as_object() {
        for (_name, obj) in objects {
            if let Some(hash) = obj["hash"].as_str() {
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
        emit(&format!("Downloading {} game assets...", asset_tasks.len()));
        download_batch(client, asset_tasks).await?;
    }

    Ok(version_json)
}

async fn download_batch(
    client: &Client,
    tasks: Vec<(String, PathBuf, Option<String>)>,
) -> Result<(), String> {
    let sem = Arc::new(Semaphore::new(10));
    let mut handles = Vec::with_capacity(tasks.len());
    for (url, dest, sha) in tasks {
        let sem = sem.clone();
        let client = client.clone();
        handles.push(tokio::spawn(async move {
            let _p = sem.acquire().await.map_err(|e| e.to_string())?;
            ensure_file(&client, &url, &dest, sha.as_deref()).await
        }));
    }
    for h in handles {
        h.await.map_err(|e| e.to_string())??;
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
    let profile_id = format!("neoforge-{neoforge_version}");
    let nf_version_dir = root.join("versions").join(&profile_id);
    let nf_json_path = nf_version_dir.join(format!("{profile_id}.json"));

    if !nf_json_path.exists() {
        let _ = app.emit(
            "launch-status",
            format!("Installing NeoForge {neoforge_version} client (one-time setup)..."),
        );

        // Ensure launcher_profiles.json exists so NeoForge installer succeeds
        let profiles_path = root.join("launcher_profiles.json");
        if !profiles_path.exists() {
            fs::write(&profiles_path, r#"{"profiles":{}}"#).map_err(|e| e.to_string())?;
        }

        let installer_url = format!(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{neoforge_version}/neoforge-{neoforge_version}-installer.jar"
        );
        let installer_jar = root
            .join("cache")
            .join(format!("neoforge-{neoforge_version}-installer.jar"));
        // Maven publishes a .sha1 next to every artifact; verify the installer we are about to run.
        let installer_sha1 = match client.get(format!("{installer_url}.sha1")).send().await {
            Ok(r) if r.status().is_success() => r
                .text()
                .await
                .ok()
                .map(|t| t.trim().chars().take(40).collect::<String>())
                .filter(|s| s.len() == 40),
            _ => None,
        };
        // A previously cached installer of unknown provenance must not be trusted when we can verify.
        if installer_sha1.is_some() && installer_jar.exists() {
            let _ = fs::remove_file(&installer_jar);
        }
        ensure_file(client, &installer_url, &installer_jar, installer_sha1.as_deref()).await?;

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

    // Ensure all libraries declared in NeoForge version JSON are present
    let libs_dir = root.join("libraries");
    let mut tasks = Vec::new();
    if let Some(libs) = nf_json["libraries"].as_array() {
        for lib in libs {
            if let Some(artifact) = lib["downloads"]["artifact"].as_object() {
                if let (Some(path), Some(url)) = (
                    artifact.get("path").and_then(|v| v.as_str()),
                    artifact.get("url").and_then(|v| v.as_str()),
                ) {
                    if !url.is_empty() {
                        let sha = artifact.get("sha1").and_then(|v| v.as_str()).map(String::from);
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
    let Some(arr) = node.as_array() else { return out };
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
    let Some(libs) = ver_json["libraries"].as_array() else { return out };
    for lib in libs {
        if !rule_allows_windows(lib["rules"].as_array()) {
            continue;
        }
        let rel = lib["downloads"]["artifact"]["path"]
            .as_str()
            .map(String::from)
            .or_else(|| lib["name"].as_str().and_then(maven_coord_to_path));
        if let Some(r) = rel {
            let full = libs_dir.join(r.replace('/', "\\"));
            if full.exists() {
                out.push(full.to_string_lossy().to_string());
            }
        }
    }
    out
}

pub async fn launch_game(app: AppHandle, req: LaunchRequest) -> Result<(), String> {
    // Strict Mojang AppID Policy Compliance: Reject launch unless online session & access token are present
    if req.session.offline || req.session.access_token.trim().is_empty() || req.session.profile.uuid.trim().is_empty() {
        return Err(
            "Launch blocked: A verified Microsoft account owning Minecraft: Java Edition is required before launching."
                .into(),
        );
    }

    let settings = load_settings();
    let root = launcher_root();
    let game_dir = instance_dir(&req.instance_id);
    fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;

    // 1. Ensure Java 21
    let java_exe = crate::java::cli_java(&ensure_java_21(&app).await?);

    // 2. Ensure Vanilla 1.21.1 + assets
    let client = http();
    let vanilla_json = setup_vanilla(&app, &client, &req.minecraft_version, &root).await?;

    // 3. Ensure NeoForge
    let nf_json = setup_neoforge(&app, &client, &java_exe, &req.neoforge_version, &root).await?;

    // 4. Construct Classpath & Arguments
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

    // Only append the vanilla client jar if launching vanilla without NeoForge.
    // NeoForge provides its own patched client provider (e.g. client-...-srg.jar)
    // and defines module "minecraft". Appending vanilla 1.21.1.jar causes Java's
    // ModuleLayer to see duplicate package exports between module "minecraft" and
    // automatic module "_1._21._1" (ResolutionException).
    if req.neoforge_version.trim().is_empty() {
        let vanilla_jar = root
            .join("versions")
            .join(&req.minecraft_version)
            .join(format!("{}.jar", req.minecraft_version));
        cp_entries.push(vanilla_jar.to_string_lossy().to_string());
    } else {
        // Extra safeguard: strip any vanilla client jar from the NeoForge classpath
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
    vars.insert("auth_player_name", req.session.profile.name.clone());
    vars.insert("version_name", profile_id.clone());
    vars.insert("game_directory", game_dir.to_string_lossy().to_string());
    vars.insert("assets_root", assets_dir.to_string_lossy().to_string());
    vars.insert("assets_index_name", asset_index_id);
    vars.insert("auth_uuid", req.session.profile.uuid.clone());
    vars.insert("auth_access_token", req.session.access_token.clone());
    vars.insert("clientid", "acbc8721-204e-4445-8c3f-962fa445d718".into());
    vars.insert("auth_xuid", "0".into());
    vars.insert("user_type", "msa".into());
    vars.insert("version_type", "release".into());
    vars.insert("natives_directory", natives_dir.to_string_lossy().to_string());
    vars.insert("launcher_name", "PETABLOCKS-Launcher".into());
    vars.insert("launcher_version", env!("CARGO_PKG_VERSION").into());
    vars.insert("classpath", classpath);
    vars.insert("classpath_separator", ";".into());
    vars.insert("library_directory", libs_dir.to_string_lossy().to_string());

    let mut full_args: Vec<String> = Vec::new();
    // Xms must never exceed Xmx or the JVM refuses to start.
    // Never hand the JVM more than 75% of physical RAM (min 2 GB), or the OS starts swapping.
    let total_mb = crate::settings::system_memory_mb();
    let cap = if total_mb > 0 { ((total_mb * 3 / 4).max(2048)) as u32 } else { u32::MAX };
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

    // Direct connect to server if enabled in settings
    if settings.direct_connect && !req.server_address.trim().is_empty() {
        full_args.push("--quickPlayMultiplayer".into());
        // Pass bare hostname (e.g. s2.petablocks.com or create2.petablocks.com) so Minecraft client resolves SRV automatically
        let addr = req.server_address.trim().to_string();
        full_args.push(addr);
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
    mc_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW: ensures no console window ever spawns

    let mut child = mc_cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Minecraft process: {e}"))?;

    let game_pid = child.id().unwrap_or_else(|| std::process::id());
    let server_addr = req.server_address.clone();
    let rpc_start = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Initial Discord update attached directly to Minecraft's process ID
    crate::community::update_discord_rpc_with_pid(
        "Playing PETABLOCKS Season 2",
        &format!("Connected to {server_addr}"),
        game_pid,
        Some(rpc_start),
    );

    // Spawn a persistent heartbeat task that keeps Discord Rich Presence alive
    let (rpc_tx, mut rpc_rx) = tokio::sync::mpsc::channel::<()>(1);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    // Blocking pipe I/O: keep it off the async worker threads.
                    let state = format!("Connected to {server_addr}");
                    let _ = tokio::task::spawn_blocking(move || {
                        crate::community::update_discord_rpc_with_pid(
                            "Playing PETABLOCKS Season 2",
                            &state,
                            game_pid,
                            Some(rpc_start),
                        );
                    })
                    .await;
                }
                _ = rpc_rx.recv() => break,
            }
        }
    });

    let log_file_path = game_dir.join("launcher-game.log");
    let log_file = std::sync::Arc::new(std::sync::Mutex::new(
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
    let started_at = Instant::now();
    tokio::spawn(async move {
        let code = child.wait().await.ok().and_then(|s| s.code()).unwrap_or(-1);
        let _ = rpc_tx.send(()).await;
        let elapsed = started_at.elapsed().as_secs();
        crate::sync::record_session_playtime(&inst_id, elapsed);
        crate::community::update_discord_rpc("In PETABLOCKS Launcher", "Ready to Play");
        // Always restore the launcher window when game terminates
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
