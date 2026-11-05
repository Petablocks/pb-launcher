use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::time::Duration;

use crate::sync::launcher_root;

const KEYRING_SERVICE: &str = "com.petablocks.launcher";
const KEYRING_USER: &str = "microsoft-account";
const DEVICE_CODE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE: &str = "XboxLive.signin offline_access";

const DEFAULT_CLIENT_ID: &str = "acbc8721-204e-4445-8c3f-962fa445d718";

/// Azure AD application (client) ID. Reads `PB_LAUNCHER_CLIENT_ID` at runtime or build time,
/// falling back to the official PETABLOCKS Launcher registration.
fn client_id() -> Result<String, String> {
    Ok(std::env::var("PB_LAUNCHER_CLIENT_ID")
        .ok()
        .or_else(|| option_env!("PB_LAUNCHER_CLIENT_ID").map(String::from))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_CLIENT_ID.to_string()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub uuid: String,
    pub name: String,
}

/// Persisted in the OS credential store (Keyring / Windows Credential Manager).
/// NOTE: Windows Credential Manager has a hard limit of 2560 UTF-16 code units (5120 bytes)
/// on the password attribute. We keep ONLY the Microsoft OAuth refresh token and profile here
/// (~150-250 bytes), well below the 2560 character limit.
#[derive(Serialize, Deserialize)]
struct StoredAccount {
    refresh_token: String,
    profile: Profile,
}

/// Cached Minecraft token cached on disk in the launcher directory (`session-cache.json`).
/// Contains the large JWT (~1.5KB) and expiration timestamp to avoid Mojang rate-limits.
#[derive(Serialize, Deserialize)]
struct CachedToken {
    mc_token: String,
    expires_at: u64,
}

fn session_cache_path() -> std::path::PathBuf {
    launcher_root().join("session-cache.json")
}

fn load_cached_token() -> Option<CachedToken> {
    let p = session_cache_path();
    let data = fs::read_to_string(&p).ok()?;
    serde_json::from_str(&data).ok()
}

fn save_cached_token(mc_token: &str, expires_at: u64) {
    let c = CachedToken {
        mc_token: mc_token.to_string(),
        expires_at,
    };
    if let Ok(json) = serde_json::to_string(&c) {
        let _ = fs::write(session_cache_path(), json);
    }
}

fn clear_cached_token() {
    let _ = fs::remove_file(session_cache_path());
}

#[derive(Serialize)]
pub struct DeviceCodeInfo {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

/// Result returned to the UI. `access_token` is the Minecraft services token used at launch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub profile: Profile,
    pub access_token: String,
    pub offline: bool,
}

fn http() -> Client {
    Client::builder()
        .user_agent("PETABLOCKS-Launcher")
        .timeout(Duration::from_secs(30))
        .build()
        .expect("http client")
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

fn save_account(acc: &StoredAccount) -> Result<(), String> {
    let json = serde_json::to_string(acc).map_err(|e| e.to_string())?;
    entry()?.set_password(&json).map_err(|e| e.to_string())
}

fn load_account() -> Option<StoredAccount> {
    let raw = entry().ok()?.get_password().ok()?;
    serde_json::from_str(&raw).ok()
}

pub async fn start_device_login() -> Result<DeviceCodeInfo, String> {
    let res: Value = http()
        .post(DEVICE_CODE_URL)
        .form(&[("client_id", client_id()?), ("scope", SCOPE.to_string())])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(err) = res.get("error_description").and_then(|v| v.as_str()) {
        if err.contains("AADSTS70002") || err.contains("marked as 'mobile") {
            return Err("Entra App config needed: In Azure Portal -> App registrations -> PETABLOCKS Launcher -> Authentication -> Set 'Allow public client flows' to Yes (and add a Mobile and desktop applications platform), then click Save.".into());
        }
        return Err(err.to_string());
    }
    Ok(DeviceCodeInfo {
        device_code: res["device_code"].as_str().unwrap_or_default().to_string(),
        user_code: res["user_code"].as_str().unwrap_or_default().to_string(),
        verification_uri: res["verification_uri"]
            .as_str()
            .unwrap_or("https://microsoft.com/link")
            .to_string(),
        interval: res["interval"].as_u64().unwrap_or(5),
        expires_in: res["expires_in"].as_u64().unwrap_or(900),
    })
}

/// Polls until the user completes sign-in in the browser.
pub async fn complete_device_login(device_code: String, interval: u64, expires_in: u64) -> Result<Session, String> {
    let client = http();
    let id = client_id()?;
    let mut waited = 0u64;
    let mut wait = interval.max(1);
    loop {
        tokio::time::sleep(Duration::from_secs(wait)).await;
        waited += wait;
        if waited > expires_in {
            return Err("Sign-in code expired. Please try again.".into());
        }
        let res: Value = client
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("client_id", id.as_str()),
                ("device_code", device_code.as_str()),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        match res.get("error").and_then(|v| v.as_str()) {
            None => {
                let access = res["access_token"].as_str().ok_or("Missing access token")?;
                let refresh = res["refresh_token"].as_str().ok_or("Missing refresh token")?;
                return finish_login(&client, access, refresh).await;
            }
            Some("authorization_pending") => {}
            Some("slow_down") => wait += 5,
            Some("authorization_declined") => return Err("Sign-in was declined.".into()),
            Some("expired_token") => return Err("Sign-in code expired. Please try again.".into()),
            Some(_) => {
                return Err(res["error_description"].as_str().unwrap_or("Sign-in failed").to_string())
            }
        }
    }
}

/// Microsoft access token -> Xbox Live -> XSTS -> Minecraft token + profile.
async fn finish_login(client: &Client, ms_access: &str, refresh: &str) -> Result<Session, String> {
    let xbl: Value = post_json(
        client,
        "https://user.auth.xboxlive.com/user/authenticate",
        json!({
            "Properties": {"AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": format!("d={ms_access}")},
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }),
    )
    .await?;
    let xbl_token = xbl["Token"].as_str().ok_or("Xbox Live authentication failed")?;

    let xsts: Value = post_json(
        client,
        "https://xsts.auth.xboxlive.com/xsts/authorize",
        json!({
            "Properties": {"SandboxId": "RETAIL", "UserTokens": [xbl_token]},
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }),
    )
    .await?;
    if let Some(code) = xsts.get("XErr").and_then(|v| v.as_u64()) {
        return Err(match code {
            2148916233 => "This Microsoft account has no Xbox profile. Create one at xbox.com first.".into(),
            2148916235 => "Xbox Live is not available in your country/region.".into(),
            2148916238 => "This is a child account; add it to a Microsoft family to play.".into(),
            c => format!("Xbox authorization failed (XErr {c})."),
        });
    }
    let xsts_token = xsts["Token"].as_str().ok_or("XSTS authorization failed")?;
    let uhs = xsts["DisplayClaims"]["xui"][0]["uhs"].as_str().ok_or("Missing Xbox user hash")?;

    let mc: Value = post_json(
        client,
        "https://api.minecraftservices.com/authentication/login_with_xbox",
        json!({"identityToken": format!("XBL3.0 x={uhs};{xsts_token}")}),
    )
    .await?;
    let Some(mc_token) = mc["access_token"].as_str().map(String::from) else {
        let detail = mc["errorMessage"]
            .as_str()
            .or_else(|| mc["error"].as_str())
            .unwrap_or("Authentication failed with Minecraft services");
        return Err(format!(
            "Microsoft & Xbox Live sign-in succeeded, but Minecraft Services rejected the token ({detail}). Please check your Microsoft account entitlement or retry."
        ));
    };

    let profile_res = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(&mc_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if profile_res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("This account does not own Minecraft: Java Edition.".into());
    }
    let p: Value = profile_res.json().await.map_err(|e| e.to_string())?;
    let profile = Profile {
        uuid: p["id"].as_str().ok_or("Missing profile id")?.to_string(),
        name: p["name"].as_str().ok_or("Missing profile name")?.to_string(),
    };

    let expires_in = mc["expires_in"].as_u64().unwrap_or(86400);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mc_token_expires_at = now + expires_in.saturating_sub(600); // 10 min buffer

    // 1. Save small credentials (<200 chars) to Windows Credential Manager
    save_account(&StoredAccount {
        refresh_token: refresh.to_string(),
        profile: profile.clone(),
    })?;

    // 2. Cache the larger Minecraft services JWT to local disk to avoid Windows 2560 char limits
    save_cached_token(&mc_token, mc_token_expires_at);

    Ok(Session { profile, access_token: mc_token, offline: false })
}

async fn post_json(client: &Client, url: &str, body: Value) -> Result<Value, String> {
    let res = client
        .post(url)
        .json(&body)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.json().await.map_err(|e| e.to_string())
}

/// Restore the saved account at startup.
/// Optimizations:
/// 1. Uses cached valid mc_token if it hasn't expired yet (prevents unnecessary Mojang rate-limit hits on restarts/updates).
/// 2. If rate-limited (TOO_MANY_REQUESTS) or offline, falls back to existing cached token/profile rather than failing.
pub async fn restore() -> Result<Option<Session>, String> {
    let Some(acc) = load_account() else { return Ok(None) };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let cached = load_cached_token();

    // Fast-path: if cached Minecraft token is still valid for at least 10 minutes, reuse it immediately!
    if let Some(c) = &cached {
        if c.expires_at > now && !c.mc_token.trim().is_empty() {
            return Ok(Some(Session {
                profile: acc.profile,
                access_token: c.mc_token.clone(),
                offline: false,
            }));
        }
    }

    let client = http();
    let res = client
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", client_id()?.as_str()),
            ("refresh_token", acc.refresh_token.as_str()),
            ("scope", SCOPE),
        ])
        .send()
        .await;

    let res = match res {
        Ok(r) => r,
        Err(_) => {
            return Ok(Some(Session {
                profile: acc.profile,
                access_token: cached.map(|c| c.mc_token).unwrap_or_default(),
                offline: true,
            }))
        }
    };

    let v: Value = res.json().await.map_err(|e| e.to_string())?;
    match (v["access_token"].as_str(), v["refresh_token"].as_str()) {
        (Some(a), Some(r)) => match finish_login(&client, a, r).await {
            Ok(session) => Ok(Some(session)),
            Err(e) if e.contains("TOO_MANY_REQUESTS") => {
                // Rate limited by Mojang: fallback to cached token if available so player isn't blocked!
                if let Some(c) = cached {
                    if !c.mc_token.is_empty() {
                        return Ok(Some(Session {
                            profile: acc.profile,
                            access_token: c.mc_token,
                            offline: false,
                        }));
                    }
                }
                Err(e)
            }
            Err(e) => Err(e),
        },
        _ => {
            // Refresh token rejected: require a fresh sign-in.
            let _ = logout();
            Ok(None)
        }
    }
}

pub fn logout() -> Result<(), String> {
    clear_cached_token();
    match entry()?.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
