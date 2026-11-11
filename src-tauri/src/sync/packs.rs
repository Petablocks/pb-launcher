//! Shaderpack and resource pack management for an instance.

use super::*;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackEntry {
    pub filename: String,
    pub clean_name: String,
    pub size: u64,
    pub enabled: bool,
    pub active: bool,
    pub kind: String, // "shader" or "resourcepack"
}

pub(crate) fn read_active_shader(base_dir: &Path) -> Option<String> {
    let iris_cfg = base_dir.join("config").join("iris.properties");
    let content = fs::read_to_string(iris_cfg).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(val) = trimmed.strip_prefix("shaderPack=") {
            let v = val.trim();
            if !v.is_empty() && v != "(off)" && v != "off" {
                return Some(v.to_string());
            }
            return None;
        }
    }
    None
}

pub fn set_active_shader(instance_id: &str, shader_filename: Option<&str>) -> Result<(), String> {
    if let Some(name) = shader_filename {
        if !is_safe_component(name) {
            return Err("Invalid shader filename.".into());
        }
    }
    let base_dir = instance_dir(instance_id);
    let cfg_dir = base_dir.join("config");
    fs::create_dir_all(&cfg_dir).map_err(|e| e.to_string())?;
    let iris_cfg = cfg_dir.join("iris.properties");
    let target_val = shader_filename.unwrap_or("(off)");
    let enable_val = if shader_filename.is_some() {
        "true"
    } else {
        "false"
    };

    let existing = fs::read_to_string(&iris_cfg).unwrap_or_default();
    let mut out_lines = Vec::new();
    let mut found_pack = false;
    let mut found_enable = false;

    for line in existing.lines() {
        if line.trim_start().starts_with("shaderPack=") {
            out_lines.push(format!("shaderPack={target_val}"));
            found_pack = true;
        } else if line.trim_start().starts_with("enableShaders=") {
            out_lines.push(format!("enableShaders={enable_val}"));
            found_enable = true;
        } else {
            out_lines.push(line.to_string());
        }
    }
    if !found_pack {
        out_lines.push(format!("shaderPack={target_val}"));
    }
    if !found_enable {
        out_lines.push(format!("enableShaders={enable_val}"));
    }
    atomic_write(&iris_cfg, out_lines.join("\n").as_bytes())
}

pub fn list_packs(instance_id: &str) -> Result<Vec<PackEntry>, String> {
    let base_dir = instance_dir(instance_id);
    let shader_dir = base_dir.join("shaderpacks");
    let rp_dir = base_dir.join("resourcepacks");
    let _ = fs::create_dir_all(&shader_dir);
    let _ = fs::create_dir_all(&rp_dir);

    let active_shader = read_active_shader(&base_dir);
    let mut out = Vec::new();

    for (dir, kind) in [(&shader_dir, "shader"), (&rp_dir, "resourcepack")] {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let Ok(meta) = entry.metadata() else { continue };
                if !meta.is_file() {
                    continue;
                }
                let raw_name = entry.file_name().to_string_lossy().to_string();
                if raw_name.ends_with(".txt")
                    || raw_name.contains(".part.")
                    || raw_name.contains(".tmp.")
                {
                    continue;
                }
                let enabled = !raw_name.ends_with(".disabled");
                let base_filename = raw_name
                    .strip_suffix(".disabled")
                    .unwrap_or(&raw_name)
                    .to_string();
                let clean_name = base_filename
                    .strip_suffix(".zip")
                    .unwrap_or(&base_filename)
                    .replace('_', " ");
                let active = if kind == "shader" {
                    enabled && active_shader.as_deref() == Some(base_filename.as_str())
                } else {
                    enabled
                };
                out.push(PackEntry {
                    filename: base_filename,
                    clean_name,
                    size: meta.len(),
                    enabled,
                    active,
                    kind: kind.to_string(),
                });
            }
        }
    }

    out.sort_by(|a, b| {
        a.kind
            .cmp(&b.kind)
            .then_with(|| a.clean_name.cmp(&b.clean_name))
    });
    Ok(out)
}

pub fn set_pack_enabled(
    instance_id: &str,
    kind: &str,
    filename: &str,
    enabled: bool,
) -> Result<Vec<PackEntry>, String> {
    if !is_safe_component(filename) {
        return Err("Invalid pack filename.".into());
    }
    let base_dir = instance_dir(instance_id);
    let folder = if kind == "shader" {
        "shaderpacks"
    } else {
        "resourcepacks"
    };
    let dir = base_dir.join(folder);
    let active_path = dir.join(filename);
    let disabled_path = dir.join(format!("{filename}.disabled"));

    if enabled && disabled_path.exists() && !active_path.exists() {
        fs::rename(&disabled_path, &active_path).map_err(|e| e.to_string())?;
    } else if !enabled && active_path.exists() {
        fs::rename(&active_path, &disabled_path).map_err(|e| e.to_string())?;
        if kind == "shader" && read_active_shader(&base_dir).as_deref() == Some(filename) {
            let _ = set_active_shader(instance_id, None);
        }
    }
    list_packs(instance_id)
}

pub fn open_packs_dir(instance_id: &str, kind: &str) -> Result<String, String> {
    let folder = if kind == "shader" {
        "shaderpacks"
    } else {
        "resourcepacks"
    };
    let dir = instance_dir(instance_id).join(folder);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}
