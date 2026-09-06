//! Read/write Geode texture-loader applied pack order (`saved.json` in user save dir).

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::core::errors::AppError;
use crate::core::game_files::geode_user_data::{
    texture_loader_applied_save_supported, texture_loader_mod_save_dir,
    texture_loader_saved_json_path,
};
use crate::core::game_files::{geometry_dash_required_error, GameFilesLayout};
use crate::core::pack_installer::{list_installed_packs, InstalledPackSummary};
use crate::core::safe_fs::{
    ensure_canonical_under_root, ensure_no_parent_dir_components, is_safe_path_segment,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppliedPackEntryDto {
    pub folder_name: String,
    pub path: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack_png_path: Option<String>,
    pub missing: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReadTextureLoaderAppliedResult {
    pub saved_json_path: String,
    pub mod_save_dir: String,
    pub supported: bool,
    pub entries: Vec<AppliedPackEntryDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteTextureLoaderAppliedRequest {
    pub applied_paths: Vec<String>,
}

fn pack_folder_name(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|n| n.to_str())
        .filter(|n| is_safe_path_segment(n))
        .map(str::to_string)
}

fn display_name_for_pack(pack: &InstalledPackSummary) -> String {
    pack.metadata
        .as_ref()
        .map(|m| m.name.trim())
        .filter(|n| !n.is_empty())
        .unwrap_or(pack.folder_name.as_str())
        .to_string()
}

fn installed_packs_by_folder(layout: &GameFilesLayout) -> Result<HashMap<String, InstalledPackSummary>, AppError> {
    let packs = list_installed_packs(layout)?;
    Ok(packs
        .into_iter()
        .map(|pack| (pack.folder_name.clone(), pack))
        .collect())
}

fn resolve_entry_path(
    raw_path: &str,
    packs_by_folder: &HashMap<String, InstalledPackSummary>,
    packs_root: &Path,
) -> AppliedPackEntryDto {
    let path = PathBuf::from(raw_path);
    let folder_name = pack_folder_name(&path).unwrap_or_else(|| raw_path.to_string());

    if let Some(pack) = packs_by_folder.get(&folder_name) {
        return AppliedPackEntryDto {
            folder_name: pack.folder_name.clone(),
            path: pack.path.clone(),
            display_name: display_name_for_pack(pack),
            pack_png_path: pack.pack_png_path.clone(),
            missing: false,
        };
    }

    AppliedPackEntryDto {
        folder_name: folder_name.clone(),
        path: raw_path.to_string(),
        display_name: folder_name.clone(),
        pack_png_path: None,
        missing: !packs_root.join(&folder_name).is_dir(),
    }
}

fn read_saved_applied_paths(saved_json: &Path) -> Result<Vec<String>, AppError> {
    if !saved_json.is_file() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(saved_json).map_err(|err| {
        AppError::IoError(format!(
            "failed to read texture-loader saved.json: {err}"
        ))
    })?;
    let value: Value = serde_json::from_str(&text).map_err(|err| {
        AppError::IoError(format!(
            "failed to parse texture-loader saved.json: {err}"
        ))
    })?;
    let Some(applied) = value.get("applied").and_then(Value::as_array) else {
        return Ok(Vec::new());
    };
    let mut paths = Vec::new();
    for entry in applied {
        let Some(path) = entry.get("path").and_then(Value::as_str) else {
            continue;
        };
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            paths.push(trimmed.to_string());
        }
    }
    Ok(paths)
}

fn read_saved_json_value(saved_json: &Path) -> Result<Value, AppError> {
    if !saved_json.is_file() {
        return Ok(serde_json::json!({
            "shown-moved-alert": true,
            "applied": []
        }));
    }
    let text = fs::read_to_string(saved_json).map_err(|err| {
        AppError::IoError(format!(
            "failed to read texture-loader saved.json: {err}"
        ))
    })?;
    serde_json::from_str(&text).map_err(|err| {
        AppError::IoError(format!(
            "failed to parse texture-loader saved.json: {err}"
        ))
    })
}

fn canonical_pack_path(layout: &GameFilesLayout, folder_name: &str) -> Result<PathBuf, AppError> {
    if !is_safe_path_segment(folder_name) {
        return Err(AppError::InvalidPath("invalid pack folder name"));
    }
    let packs_root = layout.texture_loader_packs();
    let pack_dir = packs_root.join(folder_name);
    if !pack_dir.is_dir() {
        return Err(AppError::InvalidPath("pack folder does not exist"));
    }
    ensure_no_parent_dir_components(&pack_dir)?;
    Ok(pack_dir)
}

fn normalize_applied_input(
    applied_paths: &[String],
    layout: &GameFilesLayout,
    packs_by_folder: &HashMap<String, InstalledPackSummary>,
) -> Result<Vec<PathBuf>, AppError> {
    if !layout.geometry_dash_found() {
        return Err(geometry_dash_required_error());
    }

    let packs_root = layout.texture_loader_packs();
    let mut normalized = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for raw in applied_paths {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let path = PathBuf::from(trimmed);
        let folder_name = pack_folder_name(&path).ok_or(AppError::InvalidPath(
            "applied pack path must end with a valid folder name",
        ))?;

        let canonical = if let Some(pack) = packs_by_folder.get(&folder_name) {
            PathBuf::from(&pack.path)
        } else {
            canonical_pack_path(layout, &folder_name)?
        };

        ensure_pack_under_packs_root(&canonical, &packs_root)?;

        if seen.insert(folder_name) {
            normalized.push(canonical);
        }
    }

    Ok(normalized)
}

fn ensure_pack_under_packs_root(pack_dir: &Path, packs_root: &Path) -> Result<(), AppError> {
    ensure_no_parent_dir_components(pack_dir)?;
    if pack_dir.parent() != Some(packs_root) {
        return Err(AppError::InvalidPath(
            "pack must be an immediate child of texture-loader packs",
        ));
    }
    #[cfg(not(target_os = "android"))]
    {
        ensure_canonical_under_root(pack_dir, packs_root)?;
    }
    Ok(())
}

pub fn read_texture_loader_applied(
    layout: &GameFilesLayout,
) -> Result<ReadTextureLoaderAppliedResult, AppError> {
    let supported = texture_loader_applied_save_supported();
    let mod_save_dir = if supported {
        texture_loader_mod_save_dir()?
    } else {
        PathBuf::new()
    };
    let saved_json_path = if supported {
        texture_loader_saved_json_path()?
    } else {
        PathBuf::new()
    };

    let packs_by_folder = if layout.geometry_dash_found() {
        installed_packs_by_folder(layout)?
    } else {
        HashMap::new()
    };
    let packs_root = layout.texture_loader_packs();

    let raw_paths = if supported {
        read_saved_applied_paths(&saved_json_path)?
    } else {
        Vec::new()
    };

    let entries = raw_paths
        .iter()
        .map(|path| resolve_entry_path(path, &packs_by_folder, &packs_root))
        .collect();

    Ok(ReadTextureLoaderAppliedResult {
        saved_json_path: saved_json_path.to_string_lossy().into_owned(),
        mod_save_dir: mod_save_dir.to_string_lossy().into_owned(),
        supported,
        entries,
    })
}

pub fn write_texture_loader_applied(
    layout: &GameFilesLayout,
    request: &WriteTextureLoaderAppliedRequest,
) -> Result<(), AppError> {
    if !texture_loader_applied_save_supported() {
        return Err(AppError::InvalidOperation(
            "Texture loader applied packs are not supported on this platform.",
        ));
    }

    let mod_save_dir = texture_loader_mod_save_dir()?;
    let saved_json_path = texture_loader_saved_json_path()?;
    let packs_by_folder = installed_packs_by_folder(layout)?;
    let normalized = normalize_applied_input(&request.applied_paths, layout, &packs_by_folder)?;

    fs::create_dir_all(&mod_save_dir).map_err(|err| {
        AppError::IoError(format!(
            "failed to create texture-loader mod save directory: {err}"
        ))
    })?;

    let mut root = read_saved_json_value(&saved_json_path)?;
    if !root.is_object() {
        root = serde_json::json!({
            "shown-moved-alert": true,
            "applied": []
        });
    }
    let applied: Vec<Value> = normalized
        .iter()
        .map(|path| {
            serde_json::json!({
                "path": path.to_string_lossy()
            })
        })
        .collect();
    if let Some(obj) = root.as_object_mut() {
        obj.insert("applied".to_string(), Value::Array(applied));
    }

    let json = serde_json::to_string_pretty(&root).map_err(|err| {
        AppError::IoError(format!(
            "failed to serialize texture-loader saved.json: {err}"
        ))
    })?;

    fs::write(&saved_json_path, format!("{json}\n")).map_err(|err| {
        AppError::IoError(format!(
            "failed to write texture-loader saved.json: {err}"
        ))
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("tm2-texture-loader-applied-{label}-{nanos}"));
        fs::create_dir_all(&dir).expect("temp");
        dir
    }

    fn make_gd_found(gd: &Path) {
        let resources = gd.join("Resources");
        fs::create_dir_all(resources.join("icons")).expect("resources/icons");
        let _ = fs::write(gd.join("GeometryDash.exe"), b"");
        let _ = fs::write(gd.join("libcocos2d.dll"), b"");
    }

    fn test_layout(root: &Path, gd: &Path) -> GameFilesLayout {
        fs::create_dir_all(gd.join("Resources")).expect("resources");
        GameFilesLayout {
            root: root.to_path_buf(),
            geometry_dash_dir: gd.to_path_buf(),
            resources: gd.join("Resources"),
            geode_resources: gd.join("geode").join("resources"),
            geode_unzipped: gd.join("geode").join("unzipped"),
            current_split: root.join("split-cache"),
            legacy: root.join("legacy"),
        }
    }

    fn write_pack_json(dir: &Path, name: &str) {
        fs::create_dir_all(dir).expect("pack dir");
        fs::write(dir.join("pack.json"), format!(r#"{{"name":"{name}"}}"#)).expect("pack json");
    }

    #[test]
    fn read_saved_json_preserves_extra_fields_in_memory() {
        let save_dir = unique_temp("save");
        let mod_dir = save_dir.join("geode").join("mods").join("geode.texture-loader");
        fs::create_dir_all(&mod_dir).expect("mod dir");
        let saved_json = mod_dir.join("saved.json");
        fs::write(
            &saved_json,
            r#"{
  "shown-moved-alert": false,
  "applied": []
}"#,
        )
        .expect("write saved");

        let root = read_saved_json_value(&saved_json).expect("read");
        assert_eq!(root.get("shown-moved-alert"), Some(&Value::Bool(false)));
    }

    #[test]
    fn normalize_matches_by_folder_name_from_stale_path() {
        let root = unique_temp("root");
        let gd = unique_temp("gd");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);
        let packs_root = layout.texture_loader_packs();
        write_pack_json(&packs_root.join("Sunix Black Arrows"), "Sunix Black Arrows");

        let packs_by_folder = installed_packs_by_folder(&layout).expect("packs");
        let stale = "/old/steam/path/geode/config/geode.texture-loader/packs/Sunix Black Arrows";
        let normalized =
            normalize_applied_input(&[stale.to_string()], &layout, &packs_by_folder).expect("normalize");
        assert_eq!(normalized.len(), 1);
        assert!(normalized[0].ends_with("Sunix Black Arrows"));
    }

    #[test]
    fn resolve_entry_marks_missing_when_pack_not_installed() {
        let root = unique_temp("root-missing");
        let gd = unique_temp("gd-missing");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);
        let packs_by_folder = installed_packs_by_folder(&layout).expect("packs");
        let entry = resolve_entry_path(
            "/missing/geode/config/geode.texture-loader/packs/Gone Pack",
            &packs_by_folder,
            &layout.texture_loader_packs(),
        );
        assert!(entry.missing);
        assert_eq!(entry.folder_name, "Gone Pack");
    }
}
