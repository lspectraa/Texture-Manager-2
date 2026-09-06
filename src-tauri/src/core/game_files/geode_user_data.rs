//! Geode user save directories (separate from the Geometry Dash game install).
//!
//! Mod save data such as texture-loader `saved.json` lives under the user save tree:
//! - macOS: `~/Library/Application Support/GeometryDash/geode/mods/...`
//! - Windows: `%LOCALAPPDATA%/GeometryDash/geode/mods/...`
//! - Android: `/Android/media/com.geode.launcher/save/geode/mods/...`

use std::path::PathBuf;

use crate::core::errors::AppError;

const GEOMETRY_DASH_SAVE_FOLDER: &str = "GeometryDash";
const TEXTURE_LOADER_MOD_ID: &str = "geode.texture-loader";

fn home_dir() -> Option<PathBuf> {
    if let Ok(home) = std::env::var("USERPROFILE") {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    None
}

/// True when reading/writing texture-loader applied pack order is implemented on this platform.
pub fn texture_loader_applied_save_supported() -> bool {
    true
}

/// Geode user save root.
///
/// Desktop: `…/GeometryDash`. Android: `…/Android/media/com.geode.launcher/save`.
pub fn resolve_geometry_dash_save_dir() -> Result<PathBuf, AppError> {
    #[cfg(target_os = "android")]
    {
        use super::{android_geode_save_dir_candidates, detect_android_geode_save_dir};

        if let Some(dir) = detect_android_geode_save_dir() {
            return Ok(dir);
        }

        return android_geode_save_dir_candidates()
            .into_iter()
            .next()
            .ok_or_else(|| {
                AppError::IoError(
                    "Could not resolve Geode save directory on Android internal storage."
                        .to_string(),
                )
            });
    }

    #[cfg(target_os = "windows")]
    {
        let local = std::env::var("LOCALAPPDATA")
            .map_err(|_| AppError::IoError("LOCALAPPDATA is not set.".to_string()))?;
        let trimmed = local.trim();
        if trimmed.is_empty() {
            return Err(AppError::IoError("LOCALAPPDATA is empty.".to_string()));
        }
        return Ok(PathBuf::from(trimmed).join(GEOMETRY_DASH_SAVE_FOLDER));
    }

    #[cfg(target_os = "linux")]
    {
        let home = home_dir().ok_or_else(|| AppError::IoError("HOME is not set.".to_string()))?;
        return Ok(home
            .join(".local")
            .join("share")
            .join(GEOMETRY_DASH_SAVE_FOLDER));
    }

    #[cfg(target_os = "macos")]
    {
        let home = home_dir().ok_or_else(|| AppError::IoError("HOME is not set.".to_string()))?;
        return Ok(home
            .join("Library")
            .join("Application Support")
            .join(GEOMETRY_DASH_SAVE_FOLDER));
    }

    #[cfg(not(any(
        target_os = "windows",
        target_os = "linux",
        target_os = "macos",
        target_os = "android"
    )))]
    {
        Err(AppError::InvalidOperation(
            "Texture loader applied packs are not supported on this platform.",
        ))
    }
}

/// `{save}/geode/mods/geode.texture-loader`
pub fn texture_loader_mod_save_dir() -> Result<PathBuf, AppError> {
    Ok(resolve_geometry_dash_save_dir()?
        .join("geode")
        .join("mods")
        .join(TEXTURE_LOADER_MOD_ID))
}

/// `{save}/geode/mods/geode.texture-loader/saved.json`
pub fn texture_loader_saved_json_path() -> Result<PathBuf, AppError> {
    Ok(texture_loader_mod_save_dir()?.join("saved.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_dir_ends_with_expected_folder() {
        let dir = resolve_geometry_dash_save_dir().expect("save dir");
        #[cfg(target_os = "android")]
        assert_eq!(dir.file_name().and_then(|n| n.to_str()), Some("save"));
        #[cfg(not(target_os = "android"))]
        assert_eq!(
            dir.file_name().and_then(|n| n.to_str()),
            Some(GEOMETRY_DASH_SAVE_FOLDER)
        );
    }

    #[test]
    fn saved_json_path_ends_with_expected_suffix() {
        let path = texture_loader_saved_json_path().expect("saved json path");
        let suffix = path
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join(std::path::MAIN_SEPARATOR_STR);
        assert!(suffix.ends_with("geode/mods/geode.texture-loader/saved.json")
            || suffix.ends_with("geode\\mods\\geode.texture-loader\\saved.json"));
    }

    #[cfg(target_os = "android")]
    #[test]
    fn android_save_candidates_include_launcher_save_path() {
        use super::super::android_geode_save_dir_candidates;

        let candidates = android_geode_save_dir_candidates();
        assert!(candidates.iter().any(|path| {
            let text = path.to_string_lossy();
            text.contains("com.geode.launcher") && text.ends_with("save")
        }));
        assert!(candidates.iter().any(|path| {
            path.to_string_lossy()
                .contains("/Android/media/com.geode.launcher/save")
        }));
    }
}
