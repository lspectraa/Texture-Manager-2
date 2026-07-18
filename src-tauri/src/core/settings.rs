use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::core::errors::AppError;
use crate::core::game_files::{
    detect_geometry_dash_dir, looks_like_geometry_dash_dir, resolve_game_files_root, GameFilesLayout,
};
use crate::core::safe_fs::{
    ensure_user_absolute_path, is_safe_path_segment, png_file_to_data_url, shorten_path_for_display,
};

const SETTINGS_FILE_NAME: &str = "settings.json";
const DEFAULT_SHEET_CONCURRENCY: u32 = 5;
const DEFAULT_LANGUAGE: &str = "en";
/// Keep in sync with frontend `AppLanguage` / `APP_LANGUAGES`.
const SUPPORTED_LANGUAGES: &[&str] = &["en", "es", "ru"];
/// Default: pick a discovered `game_bg_*` once per frontend session.
const DEFAULT_APP_BACKGROUND: &str = "random";
const DEFAULT_APP_BACKGROUND_OPACITY: f32 = 0.75;
const MIN_APP_BACKGROUND_OPACITY: f32 = 0.1;
const MAX_APP_BACKGROUND_OPACITY: f32 = 1.0;
/// `0` = first-run onboarding incomplete; `1` = current onboarding flow completed.
const DEFAULT_ONBOARDING_VERSION: u32 = 0;
const GAME_BG_PREFIX: &str = "game_bg_";
const GAME_BG_UHD_SUFFIX: &str = "_001-uhd.png";

fn is_supported_language(value: &str) -> bool {
    SUPPORTED_LANGUAGES
        .iter()
        .any(|code| code.eq_ignore_ascii_case(value))
}

/// Normalize a stored language: blank/unknown → English; supported codes lowercased.
fn normalize_language(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return default_language();
    }
    let primary = trimmed
        .split(['-', '_'])
        .next()
        .unwrap_or(trimmed)
        .to_ascii_lowercase();
    if is_supported_language(&primary) {
        primary
    } else {
        default_language()
    }
}

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
    /// `"random"` (default) or a `game_bg_*_001-uhd.png` filename under GD Resources.
    #[serde(default = "default_app_background")]
    pub app_background: String,
    #[serde(default = "default_app_background_opacity")]
    pub app_background_opacity: f32,
    /// Completed first-run onboarding revision. `0` means incomplete.
    #[serde(default = "default_onboarding_version")]
    pub onboarding_version: u32,
}

fn default_sheet_concurrency() -> u32 {
    DEFAULT_SHEET_CONCURRENCY
}

fn default_language() -> String {
    DEFAULT_LANGUAGE.to_string()
}

fn default_app_background() -> String {
    DEFAULT_APP_BACKGROUND.to_string()
}

fn default_app_background_opacity() -> f32 {
    DEFAULT_APP_BACKGROUND_OPACITY
}

fn default_onboarding_version() -> u32 {
    DEFAULT_ONBOARDING_VERSION
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            geometry_dash_dir: None,
            default_sheet_concurrency: DEFAULT_SHEET_CONCURRENCY,
            theme: AppTheme::Dark,
            language: default_language(),
            app_background: default_app_background(),
            app_background_opacity: default_app_background_opacity(),
            onboarding_version: default_onboarding_version(),
        }
    }
}

impl AppSettings {
    pub fn clamp(mut self) -> Self {
        self.default_sheet_concurrency = self.default_sheet_concurrency.clamp(1, 64);
        self.language = normalize_language(&self.language);
        let trimmed_bg = self.app_background.trim().to_string();
        if trimmed_bg.is_empty() {
            self.app_background = default_app_background();
        } else {
            self.app_background = trimmed_bg;
        }
        if !self.app_background_opacity.is_finite() {
            self.app_background_opacity = default_app_background_opacity();
        }
        self.app_background_opacity = self
            .app_background_opacity
            .clamp(MIN_APP_BACKGROUND_OPACITY, MAX_APP_BACKGROUND_OPACITY);
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
pub struct AppBackgroundOption {
    pub id: String,
    pub label: String,
    pub path: String,
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
    pub app_background: String,
    pub app_background_opacity: f32,
    pub onboarding_version: u32,
    pub available_app_backgrounds: Vec<AppBackgroundOption>,
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
    /// `"random"` or a discovered `game_bg_*_001-uhd.png` filename.
    #[serde(default)]
    pub app_background: Option<String>,
    #[serde(default)]
    pub app_background_opacity: Option<f32>,
    #[serde(default)]
    pub onboarding_version: Option<u32>,
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

/// Discover Geometry Dash `game_bg_{n}_001-uhd.png` files under Resources.
/// Soft-fails to an empty list when the folder is missing or unreadable.
pub fn discover_app_backgrounds(resources_dir: &Path) -> Vec<AppBackgroundOption> {
    let Ok(entries) = fs::read_dir(resources_dir) else {
        return Vec::new();
    };

    let mut options = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !is_game_bg_uhd_filename(name) {
            continue;
        }
        let label = game_bg_label(name).unwrap_or_else(|| name.to_string());
        options.push(AppBackgroundOption {
            id: name.to_string(),
            label,
            path: path.to_string_lossy().to_string(),
        });
    }

    options.sort_by(|a, b| a.id.cmp(&b.id));
    options
}

/// Read only a background that is present in the validated discovery list.
pub fn app_background_png_data_url(resources_dir: &Path, id: &str) -> Result<String, AppError> {
    let normalized = normalize_app_background_setting(id)?;
    if normalized == DEFAULT_APP_BACKGROUND {
        return Err(AppError::IoError(
            "Random is not a concrete app background.".to_string(),
        ));
    }
    let option = discover_app_backgrounds(resources_dir)
        .into_iter()
        .find(|option| option.id == normalized)
        .ok_or_else(|| {
            AppError::IoError(format!(
                "App background '{normalized}' was not found in Geometry Dash Resources."
            ))
        })?;
    png_file_to_data_url(Path::new(&option.path))
}

fn is_game_bg_uhd_filename(name: &str) -> bool {
    if !is_safe_path_segment(name) {
        return false;
    }
    let lower = name.to_ascii_lowercase();
    lower.starts_with(GAME_BG_PREFIX) && lower.ends_with(GAME_BG_UHD_SUFFIX)
}

fn game_bg_label(filename: &str) -> Option<String> {
    let lower = filename.to_ascii_lowercase();
    let stem = lower.strip_suffix(GAME_BG_UHD_SUFFIX)?;
    let num = stem.strip_prefix(GAME_BG_PREFIX)?;
    if num.is_empty() || !num.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(format!("Background {num}"))
}

fn normalize_app_background_setting(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.eq_ignore_ascii_case(DEFAULT_APP_BACKGROUND) {
        return Ok(DEFAULT_APP_BACKGROUND.to_string());
    }
    if !is_game_bg_uhd_filename(trimmed) {
        return Err(AppError::IoError(format!(
            "Invalid app background '{trimmed}'. Expected 'random' or a game_bg_*_001-uhd.png filename."
        )));
    }
    Ok(trimmed.to_string())
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
    let available_app_backgrounds = if found {
        discover_app_backgrounds(&layout.resources)
    } else {
        Vec::new()
    };

    AppSettingsView {
        geometry_dash_dir: settings.geometry_dash_dir.clone(),
        geometry_dash_resolved: if found { resolved } else { String::new() },
        geometry_dash_detected: detected,
        geometry_dash_found: found,
        geometry_dash_override_active: override_active,
        default_sheet_concurrency: settings.default_sheet_concurrency,
        theme: settings.theme.as_str().to_string(),
        language: settings.language.clone(),
        app_background: settings.app_background.clone(),
        app_background_opacity: settings.app_background_opacity,
        onboarding_version: settings.onboarding_version,
        available_app_backgrounds,
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
            ensure_user_absolute_path(&candidate)?;
            if !looks_like_geometry_dash_dir(&candidate) {
                return Err(AppError::IoError(format!(
                    "Selected folder does not look like a Geometry Dash install (missing Resources): {}",
                    shorten_path_for_display(&candidate)
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
        let trimmed = language.trim();
        if trimmed.is_empty() {
            return Err(AppError::IoError(
                "Invalid language ''. Expected 'en', 'es', or 'ru'.".to_string(),
            ));
        }
        let primary = trimmed
            .split(['-', '_'])
            .next()
            .unwrap_or(trimmed)
            .to_ascii_lowercase();
        if !is_supported_language(&primary) {
            return Err(AppError::IoError(format!(
                "Invalid language '{trimmed}'. Expected 'en', 'es', or 'ru'."
            )));
        }
        next.language = primary;
    }

    if let Some(app_background) = request.app_background {
        next.app_background = normalize_app_background_setting(&app_background)?;
    }

    if let Some(app_background_opacity) = request.app_background_opacity {
        next.app_background_opacity = app_background_opacity;
    }

    if let Some(onboarding_version) = request.onboarding_version {
        next.onboarding_version = onboarding_version;
    }

    Ok(next.clamp())
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

    #[test]
    fn default_app_background_is_random() {
        assert_eq!(AppSettings::default().app_background, "random");
        assert_eq!(
            AppSettings::default().app_background_opacity,
            DEFAULT_APP_BACKGROUND_OPACITY
        );
    }

    #[test]
    fn old_settings_default_background_opacity() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"appBackground":"random"}"#).expect("deserialize");
        assert_eq!(
            settings.app_background_opacity,
            DEFAULT_APP_BACKGROUND_OPACITY
        );
    }

    #[test]
    fn old_settings_default_onboarding_incomplete() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"theme":"dark","language":"en"}"#).expect("deserialize");
        assert_eq!(settings.onboarding_version, 0);
    }

    #[test]
    fn apply_save_request_sets_onboarding_version() {
        let current = AppSettings::default();
        assert_eq!(current.onboarding_version, 0);
        let next = apply_save_request(
            &current,
            SaveAppSettingsRequest {
                geometry_dash_dir: None,
                clear_geometry_dash_dir: false,
                default_sheet_concurrency: None,
                theme: Some("light".to_string()),
                language: Some("en".to_string()),
                app_background: None,
                app_background_opacity: None,
                onboarding_version: Some(1),
            },
        )
        .expect("apply save");
        assert_eq!(next.onboarding_version, 1);
        assert_eq!(next.theme, AppTheme::Light);
        assert_eq!(next.language, "en");
    }

    #[test]
    fn clamp_migrates_blank_and_unknown_language_to_english() {
        let blank = AppSettings {
            language: "   ".to_string(),
            ..AppSettings::default()
        }
        .clamp();
        assert_eq!(blank.language, "en");

        let unknown = AppSettings {
            language: "de".to_string(),
            ..AppSettings::default()
        }
        .clamp();
        assert_eq!(unknown.language, "en");

        let locale_tag = AppSettings {
            language: "es-MX".to_string(),
            ..AppSettings::default()
        }
        .clamp();
        assert_eq!(locale_tag.language, "es");
    }

    #[test]
    fn language_roundtrip_en_es_ru() {
        for code in ["en", "es", "ru", "ES", "ru-RU"] {
            let next = apply_save_request(
                &AppSettings::default(),
                SaveAppSettingsRequest {
                    geometry_dash_dir: None,
                    clear_geometry_dash_dir: false,
                    default_sheet_concurrency: None,
                    theme: None,
                    language: Some(code.to_string()),
                    app_background: None,
                    app_background_opacity: None,
                    onboarding_version: None,
                },
            )
            .expect("apply language");
            let expected = code
                .split(['-', '_'])
                .next()
                .unwrap()
                .to_ascii_lowercase();
            assert_eq!(next.language, expected);
        }
    }

    #[test]
    fn apply_save_request_rejects_unsupported_language() {
        let err = apply_save_request(
            &AppSettings::default(),
            SaveAppSettingsRequest {
                geometry_dash_dir: None,
                clear_geometry_dash_dir: false,
                default_sheet_concurrency: None,
                theme: None,
                language: Some("de".to_string()),
                app_background: None,
                app_background_opacity: None,
                onboarding_version: None,
            },
        )
        .expect_err("unsupported language");
        match err {
            AppError::IoError(message) => {
                assert!(message.contains("Invalid language"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn game_bg_filename_detection() {
        assert!(is_game_bg_uhd_filename("game_bg_01_001-uhd.png"));
        assert!(is_game_bg_uhd_filename("game_bg_59_001-uhd.png"));
        assert!(!is_game_bg_uhd_filename("game_bg_01_001-hd.png"));
        assert!(!is_game_bg_uhd_filename("../game_bg_01_001-uhd.png"));
    }

    #[test]
    fn discover_app_backgrounds_from_dir() {
        let dir = std::env::temp_dir().join(format!(
            "tm2-bg-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&dir).expect("temp dir");
        fs::write(dir.join("game_bg_02_001-uhd.png"), b"not-a-real-png").expect("write");
        fs::write(dir.join("game_bg_01_001-uhd.png"), b"not-a-real-png").expect("write");
        fs::write(dir.join("other.png"), b"x").expect("write");

        let options = discover_app_backgrounds(&dir);
        let _ = fs::remove_dir_all(&dir);

        assert_eq!(options.len(), 2);
        assert_eq!(options[0].id, "game_bg_01_001-uhd.png");
        assert_eq!(options[0].label, "Background 01");
        assert_eq!(options[1].id, "game_bg_02_001-uhd.png");
    }
}
