use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

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

pub async fn ping_server(address: &str) -> ServerStatus {
    let (host, port) = match address.split_once(':') {
        Some((h, p)) => (h, p.parse::<u16>().unwrap_or(25565)),
        None => (address, 25565),
    };

    let target = format!("{host}:{port}");
    let start = Instant::now();

    let res = timeout(Duration::from_secs(4), async {
        let mut stream = TcpStream::connect(&target).await.map_err(|e| e.to_string())?;
        let latency = start.elapsed().as_millis() as u64;

        // Build Handshake packet (Packet ID 0x00)
        let mut handshake_data = Vec::new();
        push_varint(&mut handshake_data, 0x00); // Packet ID
        push_varint(&mut handshake_data, 767); // Protocol version (1.21.1 = 767)
        let host_bytes = host.as_bytes();
        push_varint(&mut handshake_data, host_bytes.len() as i32);
        handshake_data.extend_from_slice(host_bytes);
        handshake_data.extend_from_slice(&port.to_be_bytes());
        push_varint(&mut handshake_data, 1); // Next state = 1 (status)

        let mut packet = Vec::new();
        push_varint(&mut packet, handshake_data.len() as i32);
        packet.extend_from_slice(&handshake_data);

        // Status Request packet (length 1, packet ID 0x00)
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
        stream.read_exact(&mut json_buf).await.map_err(|e| e.to_string())?;

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
        _ => ServerStatus {
            online: false,
            latency_ms: None,
            online_players: 0,
            max_players: 0,
            player_sample: Vec::new(),
            version_name: None,
            motd: None,
        },
    }
}
