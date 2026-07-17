use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::core::errors::AppError;
use crate::core::game_files::{
    detect_geometry_dash_dir, looks_like_geometry_dash_dir, resolve_game_files_root,
    resolve_geometry_dash_dir_with_override, GameFilesLayout,
};

const SETTINGS_FILE_NAME: &str = "settings.json";
const DEFAULT_SHEET_CONCURRENCY: u32 = 5;
const DEFAULT_LANGUAGE: &str = "en";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AppTheme {
    Dark,
    Light,
}

impl Default for AppTheme {
    fn default() -> Self {
        Self::Dark
    }
}

impl AppTheme {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Dark => "dark",
            Self::Light => "light",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "dark" => Some(Self::Dark),
            "light" => Some(Self::Light),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_dash_dir: Option<String>,
    #[serde(default = "default_sheet_concurrency")]
    pub default_sheet_concurrency: u32,
    #[serde(default)]
    pub theme: AppTheme,
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_sheet_concurrency() -> u32 {
    DEFAULT_SHEET_CONCURRENCY
}

fn default_language() -> String {
    DEFAULT_LANGUAGE.to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            geometry_dash_dir: None,
            default_sheet_concurrency: DEFAULT_SHEET_CONCURRENCY,
            theme: AppTheme::Dark,
            language: default_language(),
        }
    }
}

impl AppSettings {
    pub fn clamp(mut self) -> Self {
        self.default_sheet_concurrency = self.default_sheet_concurrency.clamp(1, 64);
        if self.language.trim().is_empty() {
            self.language = default_language();
        }
        if let Some(path) = self.geometry_dash_dir.as_mut() {
            let trimmed = path.trim().to_string();
            if trimmed.is_empty() {
                self.geometry_dash_dir = None;
            } else {
                *path = trimmed;
            }
        }
        self
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsView {
    pub geometry_dash_dir: Option<String>,
    pub geometry_dash_resolved: String,
    pub geometry_dash_detected: String,
    pub geometry_dash_found: bool,
    pub geometry_dash_override_active: bool,
    pub default_sheet_concurrency: u32,
    pub theme: String,
    pub language: String,
    pub game_files_root: String,
    pub split_cache_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAppSettingsRequest {
    /// When set, replaces the Geometry Dash override (must look like a valid install).
    #[serde(default)]
    pub geometry_dash_dir: Option<String>,
    /// When true, clears any Geometry Dash override and re-detects.
    #[serde(default)]
    pub clear_geometry_dash_dir: bool,
    #[serde(default)]
    pub default_sheet_concurrency: Option<u32>,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
}

pub fn settings_path(root: &Path) -> PathBuf {
    root.join(SETTINGS_FILE_NAME)
}

pub fn load_settings() -> AppSettings {
    let root = resolve_game_files_root();
    load_settings_from_root(&root)
}

pub fn load_settings_from_root(root: &Path) -> AppSettings {
    let path = settings_path(root);
    let Ok(text) = fs::read_to_string(&path) else {
        return AppSettings::default();
    };
    serde_json::from_str::<AppSettings>(&text)
        .unwrap_or_default()
        .clamp()
}

pub fn save_settings(settings: &AppSettings) -> Result<AppSettings, AppError> {
    let root = resolve_game_files_root();
    fs::create_dir_all(&root)?;
    let clamped = settings.clone().clamp();
    let json = serde_json::to_string_pretty(&clamped)
        .map_err(|err| AppError::IoError(format!("failed to serialize settings: {err}")))?;
    fs::write(settings_path(&root), json)?;
    Ok(clamped)
}

pub fn settings_view(settings: &AppSettings, layout: &GameFilesLayout) -> AppSettingsView {
    let override_active = settings
        .geometry_dash_dir
        .as_ref()
        .map(|path| !path.trim().is_empty())
        .unwrap_or(false);
    let detected = detect_geometry_dash_dir()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();
    let resolved = layout.geometry_dash_dir.to_string_lossy().to_string();
    let found = layout.geometry_dash_found();

    AppSettingsView {
        geometry_dash_dir: settings.geometry_dash_dir.clone(),
        geometry_dash_resolved: if found { resolved } else { String::new() },
        geometry_dash_detected: detected,
        geometry_dash_found: found,
        geometry_dash_override_active: override_active,
        default_sheet_concurrency: settings.default_sheet_concurrency,
        theme: settings.theme.as_str().to_string(),
        language: settings.language.clone(),
        game_files_root: layout.root.to_string_lossy().to_string(),
        split_cache_dir: layout.current_split.to_string_lossy().to_string(),
    }
}

pub fn apply_save_request(
    current: &AppSettings,
    request: SaveAppSettingsRequest,
) -> Result<AppSettings, AppError> {
    let mut next = current.clone();

    if request.clear_geometry_dash_dir {
        next.geometry_dash_dir = None;
    } else if let Some(path) = request.geometry_dash_dir {
        let trimmed = path.trim().to_string();
        if trimmed.is_empty() {
            next.geometry_dash_dir = None;
        } else {
            let candidate = PathBuf::from(&trimmed);
            if !looks_like_geometry_dash_dir(&candidate) {
                return Err(AppError::IoError(format!(
                    "Selected folder does not look like a Geometry Dash install (missing Resources): {trimmed}"
                )));
            }
            next.geometry_dash_dir = Some(trimmed);
        }
    }

    if let Some(concurrency) = request.default_sheet_concurrency {
        next.default_sheet_concurrency = concurrency;
    }

    if let Some(theme_raw) = request.theme {
        let Some(theme) = AppTheme::parse(&theme_raw) else {
            return Err(AppError::IoError(format!(
                "Invalid theme '{theme_raw}'. Expected 'dark' or 'light'."
            )));
        };
        next.theme = theme;
    }

    if let Some(language) = request.language {
        let trimmed = language.trim().to_string();
        if !trimmed.is_empty() {
            next.language = trimmed;
        }
    }

    Ok(next.clamp())
}

pub fn resolve_gd_from_settings(settings: &AppSettings) -> Option<PathBuf> {
    resolve_geometry_dash_dir_with_override(settings.geometry_dash_dir.as_deref()).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_roundtrip() {
        assert_eq!(AppTheme::parse("Dark"), Some(AppTheme::Dark));
        assert_eq!(AppTheme::parse("light"), Some(AppTheme::Light));
        assert_eq!(AppTheme::Dark.as_str(), "dark");
    }

    #[test]
    fn clamp_concurrency_bounds() {
        let settings = AppSettings {
            default_sheet_concurrency: 999,
            ..AppSettings::default()
        }
        .clamp();
        assert_eq!(settings.default_sheet_concurrency, 64);
    }
}
