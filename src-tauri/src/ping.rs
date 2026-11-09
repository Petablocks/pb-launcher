use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

use crate::sync::http_client;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSample {
    pub name: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub online: bool,
    pub latency_ms: Option<u64>,
    pub online_players: u32,
    pub max_players: u32,
    pub player_sample: Vec<PlayerSample>,
    pub version_name: Option<String>,
    pub motd: Option<String>,
}

fn offline_status() -> ServerStatus {
    ServerStatus {
        online: false,
        latency_ms: None,
        online_players: 0,
        max_players: 0,
        player_sample: Vec::new(),
        version_name: None,
        motd: None,
    }
}

/// Restricts SLP pinging strictly to `petablocks.com` and `*.petablocks.com` so the WebView cannot
/// use the launcher backend as an arbitrary LAN/WAN port scanner.
pub fn is_allowed_server_host(host: &str) -> bool {
    let h = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if h.is_empty()
        || !h
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
    {
        return false;
    }
    h == "petablocks.com" || h.ends_with(".petablocks.com")
}

/// Parses `host[:port]` or `[ipv6]:port` cleanly using `rsplit_once(':')`.
pub fn parse_host_port(address: &str) -> (String, u16) {
    let trimmed = address.trim();
    if let Some(rest) = trimmed.strip_prefix('[') {
        if let Some((ipv6, after)) = rest.split_once(']') {
            let port = after
                .strip_prefix(':')
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(25565);
            return (ipv6.to_string(), port);
        }
    }
    match trimmed.rsplit_once(':') {
        Some((h, p)) if !h.contains(':') => (h.to_string(), p.parse::<u16>().unwrap_or(25565)),
        _ => (trimmed.to_string(), 25565),
    }
}

fn push_varint(buf: &mut Vec<u8>, mut val: i32) {
    loop {
        if (val & !0x7F) == 0 {
            buf.push(val as u8);
            return;
        }
        buf.push(((val & 0x7F) | 0x80) as u8);
        val = ((val as u32) >> 7) as i32;
    }
}

async fn read_varint(stream: &mut TcpStream) -> Result<i32, String> {
    let mut num_read = 0;
    let mut result = 0i32;
    loop {
        let byte = stream.read_u8().await.map_err(|e| e.to_string())?;
        let value = (byte & 0x7F) as i32;
        result |= value << (7 * num_read);
        num_read += 1;
        if num_read > 5 {
            return Err("VarInt too big".into());
        }
        if (byte & 0x80) == 0 {
            break;
        }
    }
    Ok(result)
}

fn strip_mc_formatting(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '§' {
            let _ = chars.next();
        } else {
            out.push(c);
        }
    }
    out.trim().to_string()
}

fn extract_motd(desc: &Value) -> Option<String> {
    if let Some(s) = desc.as_str() {
        return Some(strip_mc_formatting(s));
    }
    if let Some(obj) = desc.as_object() {
        let mut text = obj
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if let Some(extra) = obj.get("extra").and_then(|v| v.as_array()) {
            for item in extra {
                if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                    text.push_str(t);
                } else if let Some(t) = item.as_str() {
                    text.push_str(t);
                }
            }
        }
        let cleaned = strip_mc_formatting(&text);
        if !cleaned.is_empty() {
            return Some(cleaned);
        }
    }
    None
}

async fn resolve_minecraft_target(host: &str, port: u16) -> (String, u16) {
    if port != 25565 || !is_allowed_server_host(host) {
        return (host.to_string(), port);
    }

    // Resolve SRV record for verified *.petablocks.com domains
    let srv_name = format!("_minecraft._tcp.{}", host.trim_end_matches('.'));
    let doh_url = format!(
        "https://cloudflare-dns.com/dns-query?name={}&type=SRV",
        srv_name
    );

    if let Ok(Ok(resp)) = timeout(
        Duration::from_millis(1500),
        http_client()
            .get(&doh_url)
            .header("accept", "application/dns-json")
            .send(),
    )
    .await
    {
        if let Ok(json) = resp.json::<Value>().await {
            if let Some(answers) = json["Answer"].as_array() {
                for ans in answers {
                    if ans["type"].as_u64() == Some(33) {
                        if let Some(data) = ans["data"].as_str() {
                            let parts: Vec<&str> = data.split_whitespace().collect();
                            if parts.len() >= 4 {
                                if let Ok(resolved_port) = parts[2].parse::<u16>() {
                                    let resolved_host = parts[3].trim_end_matches('.').to_string();
                                    if is_allowed_server_host(&resolved_host) {
                                        return (resolved_host, resolved_port);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    (host.to_string(), port)
}

pub async fn ping_server(address: &str) -> ServerStatus {
    let (input_host, input_port) = parse_host_port(address);
    if !is_allowed_server_host(&input_host) {
        return offline_status();
    }

    let (host, port) = resolve_minecraft_target(&input_host, input_port).await;

    let target = format!("{host}:{port}");
    let start = Instant::now();

    let res = timeout(Duration::from_secs(4), async {
        let mut stream = TcpStream::connect(&target)
            .await
            .map_err(|e| e.to_string())?;
        let latency = start.elapsed().as_millis() as u64;

        let mut handshake_data = Vec::new();
        push_varint(&mut handshake_data, 0x00);
        push_varint(&mut handshake_data, 767);
        let host_bytes = host.as_bytes();
        push_varint(&mut handshake_data, host_bytes.len() as i32);
        handshake_data.extend_from_slice(host_bytes);
        handshake_data.extend_from_slice(&port.to_be_bytes());
        push_varint(&mut handshake_data, 1);

        let mut packet = Vec::new();
        push_varint(&mut packet, handshake_data.len() as i32);
        packet.extend_from_slice(&handshake_data);

        packet.push(0x01);
        packet.push(0x00);

        stream.write_all(&packet).await.map_err(|e| e.to_string())?;
        stream.flush().await.map_err(|e| e.to_string())?;

        let _packet_len = read_varint(&mut stream).await?;
        let packet_id = read_varint(&mut stream).await?;
        if packet_id != 0x00 {
            return Err("Unexpected SLP packet ID".to_string());
        }
        let json_len = read_varint(&mut stream).await? as usize;
        if json_len > 262_144 {
            return Err("SLP response too large".into());
        }
        let mut json_buf = vec![0u8; json_len];
        stream
            .read_exact(&mut json_buf)
            .await
            .map_err(|e| e.to_string())?;

        let val: Value = serde_json::from_slice(&json_buf).map_err(|e| e.to_string())?;
        let online_players = val["players"]["online"].as_u64().unwrap_or(0) as u32;
        let max_players = val["players"]["max"].as_u64().unwrap_or(0) as u32;
        let mut player_sample = Vec::new();
        if let Some(samples) = val["players"]["sample"].as_array() {
            for s in samples {
                if let (Some(name), Some(id)) = (s["name"].as_str(), s["id"].as_str()) {
                    player_sample.push(PlayerSample {
                        name: strip_mc_formatting(name),
                        id: id.to_string(),
                    });
                }
            }
        }
        let version_name = val["version"]["name"].as_str().map(String::from);
        let motd = extract_motd(&val["description"]);

        Ok::<ServerStatus, String>(ServerStatus {
            online: true,
            latency_ms: Some(latency),
            online_players,
            max_players,
            player_sample,
            version_name,
            motd,
        })
    })
    .await;

    match res {
        Ok(Ok(status)) => status,
        _ => offline_status(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn varint_encoding() {
        let mut b = Vec::new();
        push_varint(&mut b, 300);
        assert_eq!(b, [0xAC, 0x02]);
        let mut b = Vec::new();
        push_varint(&mut b, 767);
        assert_eq!(b, [0xFF, 0x05]);
    }

    #[test]
    fn strips_formatting() {
        assert_eq!(strip_mc_formatting("§aHello §lWorld"), "Hello World");
    }

    #[test]
    fn host_allowlist_and_parsing() {
        assert!(is_allowed_server_host("s2.petablocks.com"));
        assert!(is_allowed_server_host("petablocks.com"));
        assert!(!is_allowed_server_host("127.0.0.1"));
        assert!(!is_allowed_server_host("evil.com"));
        assert_eq!(
            parse_host_port("s2.petablocks.com:25566"),
            ("s2.petablocks.com".to_string(), 25566)
        );
        assert_eq!(
            parse_host_port("[::1]:25565"),
            ("::1".to_string(), 25565)
        );
    }

    #[tokio::test]
    async fn test_live_ping_servers() {
        let s2 = ping_server("s2.petablocks.com").await;
        println!("s2 ping: online={}, players={}/{}, motd={:?}, latency={:?}", s2.online, s2.online_players, s2.max_players, s2.motd, s2.latency_ms);
        let c2 = ping_server("create2.petablocks.com").await;
        println!("c2 ping: online={}, players={}/{}, motd={:?}, latency={:?}", c2.online, c2.online_players, c2.max_players, c2.motd, c2.latency_ms);
    }
}
