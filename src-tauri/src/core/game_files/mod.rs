pub mod sync;

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, RwLock};

use serde::{Deserialize, Serialize};

use crate::core::contracts::SplitterOptions;
use crate::core::discovery::{discover_sheet_pairs, discover_unpaired_png_keys, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::safe_fs::{
    ensure_no_parent_dir_components, ensure_user_absolute_path, is_safe_path_segment,
    join_under_parent, path_from_slashes, png_file_to_data_url, remove_dir_all_under_root,
    shorten_path_for_display,
};
use crate::core::splitter::split_sheet_candidate;

const GAME_FILES_DIR_NAME: &str = "TextureManager2";
const GAME_FILES_SUBDIR: &str = "game-files";
const GEOMETRY_DASH_FOLDER: &str = "Geometry Dash";
const UNRESOLVED_GD_DIR_NAME: &str = "_unresolved_geometry_dash";

/// Clear user-facing error when a tool needs Geometry Dash but it is missing.
pub fn geometry_dash_required_error() -> AppError {
    AppError::IoError(
        "Geometry Dash is not configured. Open Settings and set or detect the install path."
            .to_string(),
    )
}

#[derive(Debug, Clone)]
pub struct GameFilesLayout {
    /// User-owned cache/legacy root (`~/TextureManager2/game-files`).
    pub root: PathBuf,
    /// Geometry Dash install root (Steam `.../common/Geometry Dash`).
    pub geometry_dash_dir: PathBuf,
    /// Vanilla textures: `{GD}/Resources` (also exposed as `current` for UI defaults).
    pub resources: PathBuf,
    /// Geode built-in resources root: `{GD}/geode/resources`.
    pub geode_resources: PathBuf,
    /// Geode unzipped mods: `{GD}/geode/unzipped`.
    pub geode_unzipped: PathBuf,
    /// On-demand split cache under the user data root.
    pub current_split: PathBuf,
    pub legacy: PathBuf,
}

impl GameFilesLayout {
    /// Alias for vanilla Resources — used by Geode Buttons default input.
    pub fn current(&self) -> &Path {
        &self.resources
    }

    pub fn geometry_dash_found(&self) -> bool {
        looks_like_geometry_dash_dir(&self.geometry_dash_dir)
    }

    /// `{GD}/geode/config`
    pub fn geode_config(&self) -> PathBuf {
        self.geometry_dash_dir.join("geode").join("config")
    }

    /// `{GD}/geode/mods`
    pub fn geode_mods(&self) -> PathBuf {
        self.geometry_dash_dir.join("geode").join("mods")
    }

    /// `{GD}/geode/config/geode.texture-loader/packs`
    pub fn texture_loader_packs(&self) -> PathBuf {
        self.geode_config()
            .join("geode.texture-loader")
            .join("packs")
    }

    pub fn to_dto(&self) -> GameFilesLayoutDto {
        let found = self.geometry_dash_found();
        GameFilesLayoutDto {
            root_dir: self.root.to_string_lossy().to_string(),
            current_dir: if found {
                self.resources.to_string_lossy().to_string()
            } else {
                String::new()
            },
            split_dir: self.current_split.to_string_lossy().to_string(),
            legacy_dir: self.legacy.to_string_lossy().to_string(),
            geometry_dash_dir: if found {
                self.geometry_dash_dir.to_string_lossy().to_string()
            } else {
                String::new()
            },
            resources_dir: if found {
                self.resources.to_string_lossy().to_string()
            } else {
                String::new()
            },
            geode_resources_dir: if found {
                self.geode_resources.to_string_lossy().to_string()
            } else {
                String::new()
            },
            geode_unzipped_dir: if found {
                self.geode_unzipped.to_string_lossy().to_string()
            } else {
                String::new()
            },
            geode_config_dir: if found {
                self.geode_config().to_string_lossy().to_string()
            } else {
                String::new()
            },
            geode_mods_dir: if found {
                self.geode_mods().to_string_lossy().to_string()
            } else {
                String::new()
            },
            texture_loader_packs_dir: if found {
                self.texture_loader_packs().to_string_lossy().to_string()
            } else {
                String::new()
            },
            geometry_dash_found: found,
        }
    }

    pub fn legacy_gamesheets_dir(&self, version: &str) -> PathBuf {
        self.legacy.join(normalize_legacy_version(version))
    }
}

#[derive(Clone)]
pub struct GameFilesState(pub Arc<RwLock<GameFilesLayout>>);

impl GameFilesState {
    pub fn new(layout: GameFilesLayout) -> Self {
        Self(Arc::new(RwLock::new(layout)))
    }

    pub fn snapshot(&self) -> GameFilesLayout {
        self.0
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn replace(&self, layout: GameFilesLayout) {
        *self
            .0
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = layout;
    }

    pub fn with_layout<R>(&self, f: impl FnOnce(&GameFilesLayout) -> R) -> R {
        let guard = self
            .0
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        f(&guard)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameFilesLayoutDto {
    pub root_dir: String,
    /// Vanilla Resources directory (latest placeholders for root + icons).
    pub current_dir: String,
    pub split_dir: String,
    pub legacy_dir: String,
    pub geometry_dash_dir: String,
    pub resources_dir: String,
    pub geode_resources_dir: String,
    pub geode_unzipped_dir: String,
    pub geode_config_dir: String,
    pub geode_mods_dir: String,
    pub texture_loader_packs_dir: String,
    pub geometry_dash_found: bool,
}

/// App-data root for caches/settings (`~/TextureManager2/game-files` by default).
///
/// Override with `TM_GAME_FILES_DIR` (absolute path, no `..` components). Intended for tests and
/// advanced installs — relocates settings, split-cache, and legacy trees. Invalid overrides are
/// ignored and the default home-relative path is used.
pub fn resolve_game_files_root() -> PathBuf {
    if let Ok(env_override) = std::env::var("TM_GAME_FILES_DIR") {
        let trimmed = env_override.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if ensure_user_absolute_path(&path).is_ok() {
                return path;
            }
            // Invalid override: fall through to default rather than following traversal tricks.
        }
    }

    if let Ok(home) = std::env::var("USERPROFILE") {
        if !home.trim().is_empty() {
            return PathBuf::from(home)
                .join(GAME_FILES_DIR_NAME)
                .join(GAME_FILES_SUBDIR);
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        if !home.trim().is_empty() {
            return PathBuf::from(home)
                .join(GAME_FILES_DIR_NAME)
                .join(GAME_FILES_SUBDIR);
        }
    }

    PathBuf::from(GAME_FILES_DIR_NAME).join(GAME_FILES_SUBDIR)
}

pub fn normalize_legacy_version(version: &str) -> String {
    version
        .trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_string()
}

pub fn looks_like_geometry_dash_dir(path: &Path) -> bool {
    if path.as_os_str().is_empty() {
        return false;
    }
    if ensure_no_parent_dir_components(path).is_err() {
        return false;
    }
    let is_unresolved = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name == UNRESOLVED_GD_DIR_NAME)
        .unwrap_or(false);
    if is_unresolved {
        return false;
    }

    let resources = path.join("Resources");
    if !resources.is_dir() {
        return false;
    }

    // Binary / engine markers (Steam install root on Windows/macOS/Linux variants).
    let has_binary = path.join("GeometryDash.exe").is_file()
        || path.join("libcocos2d.dll").is_file()
        || path.join("libfmod.dll").is_file()
        || path.join("GeometryDash").is_file()
        || path.join("GeometryDash.x86_64").is_file()
        || path
            .join("Geometry Dash.app")
            .join("Contents")
            .join("MacOS")
            .join("Geometry Dash")
            .is_file();

    // Texture markers — distinguish a real GD Resources tree from any random
    // folder that happens to contain a subdirectory named Resources.
    let has_textures = resources.join("icons").is_dir()
        || resources.join("game_bg_01_001-uhd.png").is_file()
        || resources.join("game_bg_01_001-hd.png").is_file()
        || resources.join("game_bg_01_001.png").is_file()
        || resources.join("GJ_GameSheet-uhd.plist").is_file()
        || resources.join("GJ_GameSheet-hd.plist").is_file()
        || resources.join("GJ_GameSheet.plist").is_file();

    has_binary || has_textures
}

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

fn push_unique(roots: &mut Vec<PathBuf>, path: PathBuf) {
    if path.as_os_str().is_empty() {
        return;
    }
    if !roots.iter().any(|existing| existing == &path) {
        roots.push(path);
    }
}

fn unescape_vdf_path(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            match chars.next() {
                Some('\\') => out.push('\\'),
                Some('n') => out.push('\n'),
                Some('t') => out.push('\t'),
                Some('r') => out.push('\r'),
                Some('"') => out.push('"'),
                Some(other) => {
                    out.push('\\');
                    out.push(other);
                }
                None => out.push('\\'),
            }
        } else {
            out.push(ch);
        }
    }
    out
}

fn parse_steam_library_paths(vdf_text: &str) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    for line in vdf_text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        // Accept `"path" "D:\\SteamLibrary"` and `"path"\t\t"D:\\SteamLibrary"`.
        let Some(after_key) = trimmed
            .strip_prefix("\"path\"")
            .or_else(|| trimmed.strip_prefix("\"Path\""))
        else {
            continue;
        };
        let rest = after_key.trim_start();
        let value = if let Some(quoted) = rest.strip_prefix('"') {
            let mut raw = String::new();
            let mut chars = quoted.chars();
            while let Some(ch) = chars.next() {
                if ch == '\\' {
                    match chars.next() {
                        Some(next) => {
                            raw.push('\\');
                            raw.push(next);
                        }
                        None => raw.push('\\'),
                    }
                } else if ch == '"' {
                    break;
                } else {
                    raw.push(ch);
                }
            }
            unescape_vdf_path(&raw)
        } else {
            rest.trim_matches('"').to_string()
        };

        let cleaned = value.trim();
        if cleaned.is_empty() {
            continue;
        }
        out.push(PathBuf::from(cleaned));
    }
    out
}

/// Read Steam InstallPath via the Windows registry API (no `reg.exe` — that flashes a
/// console window under `windows_subsystem = "windows"`).
#[cfg(windows)]
fn steam_install_from_registry() -> Vec<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let mut out = Vec::new();
    let keys = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Valve\Steam"),
    ];
    for (hive, subkey) in keys {
        let Ok(key) = RegKey::predef(hive).open_subkey(subkey) else {
            continue;
        };
        let Ok(path) = key.get_value::<String, _>("InstallPath") else {
            continue;
        };
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            out.push(PathBuf::from(trimmed));
        }
    }
    out
}

/// Skip optical / empty / network roots — probing them can hang the UI thread for seconds.
#[cfg(windows)]
fn is_fixed_drive_letter(letter: char) -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetDriveTypeW(root_path_name: *const u16) -> u32;
    }

    const DRIVE_FIXED: u32 = 3;
    let root = format!("{letter}:\\");
    let wide: Vec<u16> = OsStr::new(&root)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe { GetDriveTypeW(wide.as_ptr()) == DRIVE_FIXED }
}

#[cfg(not(windows))]
fn is_fixed_drive_letter(_letter: char) -> bool {
    true
}

#[cfg(not(windows))]
fn steam_install_from_registry() -> Vec<PathBuf> {
    Vec::new()
}

fn candidate_steam_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    for env_key in [
        "ProgramFiles(x86)",
        "ProgramFiles",
        "PROGRAMFILES(X86)",
        "PROGRAMFILES",
    ] {
        if let Ok(pf) = std::env::var(env_key) {
            if !pf.trim().is_empty() {
                push_unique(&mut roots, PathBuf::from(pf).join("Steam"));
            }
        }
    }

    push_unique(&mut roots, PathBuf::from(r"C:\Program Files (x86)\Steam"));
    push_unique(&mut roots, PathBuf::from(r"C:\Program Files\Steam"));

    for drive in [b'D', b'E', b'F', b'G'] {
        let letter = drive as char;
        if !is_fixed_drive_letter(letter) {
            continue;
        }
        push_unique(&mut roots, PathBuf::from(format!(r"{letter}:\Steam")));
        push_unique(
            &mut roots,
            PathBuf::from(format!(r"{letter}:\SteamLibrary")),
        );
        push_unique(
            &mut roots,
            PathBuf::from(format!(r"{letter}:\Program Files (x86)\Steam")),
        );
        push_unique(
            &mut roots,
            PathBuf::from(format!(r"{letter}:\Program Files\Steam")),
        );
    }

    if let Some(home) = home_dir() {
        push_unique(&mut roots, home.join("AppData").join("Local").join("Steam"));
        // macOS
        push_unique(
            &mut roots,
            home.join("Library")
                .join("Application Support")
                .join("Steam"),
        );
        // Linux common layouts
        push_unique(&mut roots, home.join(".steam").join("steam"));
        push_unique(&mut roots, home.join(".steam").join("root"));
        push_unique(&mut roots, home.join(".local").join("share").join("Steam"));
        push_unique(
            &mut roots,
            home.join(".var")
                .join("app")
                .join("com.valvesoftware.Steam")
                .join("data")
                .join("Steam"),
        );
    }

    for registry_root in steam_install_from_registry() {
        push_unique(&mut roots, registry_root);
    }

    roots
}

fn steam_library_roots() -> Vec<PathBuf> {
    let mut roots = candidate_steam_roots();

    let mut vdf_paths: Vec<PathBuf> = roots
        .iter()
        .flat_map(|steam| {
            [
                steam.join("steamapps").join("libraryfolders.vdf"),
                steam.join("config").join("libraryfolders.vdf"),
            ]
        })
        .collect();

    if let Some(home) = home_dir() {
        vdf_paths.push(
            home.join("AppData")
                .join("Local")
                .join("Steam")
                .join("steamapps")
                .join("libraryfolders.vdf"),
        );
        vdf_paths.push(
            home.join(".steam")
                .join("steam")
                .join("steamapps")
                .join("libraryfolders.vdf"),
        );
        vdf_paths.push(
            home.join(".local")
                .join("share")
                .join("Steam")
                .join("steamapps")
                .join("libraryfolders.vdf"),
        );
        vdf_paths.push(
            home.join("Library")
                .join("Application Support")
                .join("Steam")
                .join("steamapps")
                .join("libraryfolders.vdf"),
        );
    }

    for vdf_path in vdf_paths {
        if let Ok(text) = fs::read_to_string(&vdf_path) {
            for library_path in parse_steam_library_paths(&text) {
                push_unique(&mut roots, library_path);
            }
        }
    }

    roots
}

fn geometry_dash_detection_cache() -> &'static Mutex<Option<Result<PathBuf, String>>> {
    static CACHE: OnceLock<Mutex<Option<Result<PathBuf, String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

/// Clear cached Steam/GD auto-detect results (e.g. after an explicit redetect).
pub fn invalidate_geometry_dash_detection_cache() {
    let mut guard = geometry_dash_detection_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = None;
}

/// Auto-detect Geometry Dash without user override (still honors `TM_GEOMETRY_DASH_DIR`).
///
/// Results are cached for the process lifetime so Settings / startup IPC does not
/// re-walk Steam libraries on every `get_app_settings` call.
pub fn detect_geometry_dash_dir() -> Result<PathBuf, AppError> {
    {
        let guard = geometry_dash_detection_cache()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(cached) = guard.as_ref() {
            return match cached {
                Ok(path) => Ok(path.clone()),
                Err(message) => Err(AppError::IoError(message.clone())),
            };
        }
    }

    let result = resolve_geometry_dash_dir_with_override(None);
    let mut guard = geometry_dash_detection_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Some(match &result {
        Ok(path) => Ok(path.clone()),
        Err(err) => Err(err.to_string()),
    });
    result
}

pub fn resolve_geometry_dash_dir_with_override(
    settings_override: Option<&str>,
) -> Result<PathBuf, AppError> {
    if let Ok(env_override) = std::env::var("TM_GEOMETRY_DASH_DIR") {
        let trimmed = env_override.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            ensure_user_absolute_path(&path)?;
            if looks_like_geometry_dash_dir(&path) {
                return Ok(path);
            }
            return Err(AppError::IoError(format!(
                "TM_GEOMETRY_DASH_DIR does not look like a Geometry Dash install: {}",
                shorten_path_for_display(&path)
            )));
        }
    }

    if let Some(override_path) = settings_override {
        let trimmed = override_path.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            ensure_user_absolute_path(&path)?;
            if looks_like_geometry_dash_dir(&path) {
                return Ok(path);
            }
            return Err(AppError::IoError(format!(
                "Configured Geometry Dash folder does not look like an install: {}",
                shorten_path_for_display(&path)
            )));
        }
    }

    for steam_root in steam_library_roots() {
        let candidate = steam_root
            .join("steamapps")
            .join("common")
            .join(GEOMETRY_DASH_FOLDER);
        if looks_like_geometry_dash_dir(&candidate) {
            return Ok(candidate);
        }
    }

    Err(AppError::IoError(
        "Geometry Dash installation not found. Set the path in Settings or TM_GEOMETRY_DASH_DIR."
            .to_string(),
    ))
}

pub fn resolve_geometry_dash_dir() -> Result<PathBuf, AppError> {
    let root = resolve_game_files_root();
    let override_path = read_settings_geometry_dash_override(&root);
    resolve_geometry_dash_dir_with_override(override_path.as_deref())
}

fn read_settings_geometry_dash_override(root: &Path) -> Option<String> {
    let text = fs::read_to_string(root.join("settings.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let raw = value.get("geometryDashDir")?.as_str()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn layout_from_parts(root: PathBuf, geometry_dash_dir: PathBuf) -> GameFilesLayout {
    let resources = geometry_dash_dir.join("Resources");
    let geode_resources = geometry_dash_dir.join("geode").join("resources");
    let geode_unzipped = geometry_dash_dir.join("geode").join("unzipped");
    let current_split = root.join("split-cache");
    let legacy = root.join("legacy");

    GameFilesLayout {
        root,
        geometry_dash_dir,
        resources,
        geode_resources,
        geode_unzipped,
        current_split,
        legacy,
    }
}

pub fn build_game_files_layout(geometry_dash_dir: Option<PathBuf>) -> GameFilesLayout {
    let root = resolve_game_files_root();
    let gd = geometry_dash_dir.unwrap_or_else(|| root.join(UNRESOLVED_GD_DIR_NAME));
    layout_from_parts(root, gd)
}

/// Bootstrap app-data dirs and resolve Geometry Dash when available.
///
/// Soft-fail: missing GD does **not** prevent launch. Layout uses `_unresolved_geometry_dash`
/// placeholders; `geometry_dash_found` is false; Settings can set/detect the path later.
/// Tools that need GD should check `geometry_dash_found()` and return clear errors.
pub fn bootstrap_game_files() -> Result<GameFilesLayout, AppError> {
    let root = resolve_game_files_root();
    let current_split = root.join("split-cache");
    let legacy = root.join("legacy");

    fs::create_dir_all(&current_split)?;
    fs::create_dir_all(&legacy)?;
    let _ = fs::create_dir_all(root.join("custom-backgrounds"));

    let override_path = read_settings_geometry_dash_override(&root);
    let geometry_dash_dir = if override_path
        .as_ref()
        .is_some_and(|path| !path.trim().is_empty())
    {
        resolve_geometry_dash_dir_with_override(override_path.as_deref())
            .unwrap_or_else(|_| root.join(UNRESOLVED_GD_DIR_NAME))
    } else {
        // Populate the detection cache so the first Settings IPC does not walk Steam again.
        detect_geometry_dash_dir().unwrap_or_else(|_| root.join(UNRESOLVED_GD_DIR_NAME))
    };

    let layout = layout_from_parts(root, geometry_dash_dir);
    // Soft-fail: sync is best-effort and must not block launch when GD is missing.
    // Auto-update / network sync is deferred — see sync.rs plan note; do not enable here.
    let _ = sync::check_for_updates(&layout);
    Ok(layout)
}

/// Rebuild layout after settings change (keeps cache dirs; refreshes GD paths).
pub fn refresh_game_files_layout(settings_override: Option<&str>) -> GameFilesLayout {
    let root = resolve_game_files_root();
    let _ = fs::create_dir_all(root.join("split-cache"));
    let _ = fs::create_dir_all(root.join("legacy"));
    let _ = fs::create_dir_all(root.join("custom-backgrounds"));
    let geometry_dash_dir = resolve_geometry_dash_dir_with_override(settings_override)
        .unwrap_or_else(|_| root.join(UNRESOLVED_GD_DIR_NAME));
    let layout = layout_from_parts(root, geometry_dash_dir);
    let _ = sync::check_for_updates(&layout);
    layout
}

/// Map an input pack relative directory to the Steam/Geode source directory for latest textures.
///
/// - root / empty → `{GD}/Resources`
/// - `icons` (+ nested) → `{GD}/Resources/icons/...`
/// - `geode.loader` (+ nested) → `{GD}/geode/resources/geode.loader/...`
/// - `{mod}` (+ nested) → `{GD}/geode/unzipped/{mod}/resources/{mod}/...`
pub fn resolve_current_source_dir(layout: &GameFilesLayout, relative_dir: &Path) -> PathBuf {
    let parts: Vec<String> = relative_dir
        .components()
        .filter_map(|component| match component {
            Component::Normal(name) => name.to_str().map(|s| s.to_string()),
            _ => None,
        })
        .collect();

    if parts.is_empty() {
        return layout.resources.clone();
    }

    if parts[0].eq_ignore_ascii_case("icons") {
        let mut path = layout.resources.join("icons");
        for part in parts.iter().skip(1) {
            path.push(part);
        }
        return path;
    }

    if parts[0].eq_ignore_ascii_case("geode.loader") {
        let mut path = layout.geode_resources.join("geode.loader");
        for part in parts.iter().skip(1) {
            path.push(part);
        }
        return path;
    }

    let mod_name = &parts[0];
    let mut path = layout
        .geode_unzipped
        .join(mod_name)
        .join("resources")
        .join(mod_name);
    for part in parts.iter().skip(1) {
        path.push(part);
    }
    path
}

fn resolve_png_beside_plist(plist_path: &Path) -> PathBuf {
    let direct = plist_path.with_extension("png");
    if direct.exists() {
        return direct;
    }
    if let Some(texture_name) = texture_file_name_from_plist(plist_path) {
        if let Some(parent) = plist_path.parent() {
            if let Ok(candidate) = join_under_parent(parent, &texture_name) {
                if candidate.exists() {
                    return candidate;
                }
            }
        }
    }
    direct
}

fn texture_file_name_from_plist(plist_path: &Path) -> Option<String> {
    let root = plist::Value::from_file(plist_path).ok()?;
    let metadata = root
        .as_dictionary()
        .and_then(|d| d.get("metadata"))
        .and_then(|v| v.as_dictionary())?;
    for key in ["realTextureFileName", "textureFileName"] {
        if let Some(name) = metadata.get(key).and_then(|v| v.as_string()) {
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }
    None
}

/// Locate a latest placeholder sheet without touching the sprite-index JSON.
pub fn locate_current_sheet_pair(
    layout: &GameFilesLayout,
    relative_dir: &Path,
    stem: &str,
) -> Result<Option<SheetCandidate>, AppError> {
    let source_dir = resolve_current_source_dir(layout, relative_dir);
    if !source_dir.is_dir() {
        return Ok(None);
    }

    let direct_plist = source_dir.join(format!("{stem}.plist"));
    let plist_path = if direct_plist.exists() {
        direct_plist
    } else {
        let wanted = format!("{stem}.plist");
        match recursive_find_file_named(&source_dir, &wanted) {
            Some(path) => path,
            None => return Ok(None),
        }
    };

    let png_path = resolve_png_beside_plist(&plist_path);
    if !plist_path.is_file() || !png_path.is_file() {
        return Ok(None);
    }
    Ok(Some(SheetCandidate {
        stem: stem.to_string(),
        relative_dir: relative_dir.to_path_buf(),
        plist_path,
        png_path,
    }))
}

/// Find a latest placeholder sheet for an input pack sheet under the Steam/Geode source tree.
pub fn find_current_sheet_for_input(
    layout: &GameFilesLayout,
    relative_dir: &Path,
    stem: &str,
) -> Result<Option<SheetCandidate>, AppError> {
    let Some(candidate) = locate_current_sheet_pair(layout, relative_dir, stem)? else {
        return Ok(None);
    };
    crate::core::sprite_index::try_index_sheet_pair(
        layout,
        relative_dir,
        stem,
        &candidate.plist_path,
        &candidate.png_path,
    );
    Ok(Some(candidate))
}

pub fn discover_current_sheet_pairs(
    layout: &GameFilesLayout,
) -> Result<Vec<SheetCandidate>, AppError> {
    discover_sheet_pairs(&layout.resources)
}

/// Discover local plist/png sheet pairs, then promote unpaired pack PNGs that have a matching
/// plist under the live Geometry Dash / Geode tree (same relative dir + stem).
///
/// The resulting `SheetCandidate` keeps the **pack** PNG and references the **vanilla** plist
/// path (no copy into the pack). When GD is not configured, behavior matches plain
/// [`discover_sheet_pairs`].
pub fn discover_sheet_pairs_with_game_plist_fallback(
    input_dir: &Path,
    layout: &GameFilesLayout,
) -> Result<Vec<SheetCandidate>, AppError> {
    discover_sheet_pairs_with_game_plist_fallback_in(input_dir, layout, Path::new(""))
}

/// Like [`discover_sheet_pairs_with_game_plist_fallback`], but prepends `vanilla_relative_prefix`
/// when looking up vanilla plists (e.g. `icons` when `input_dir` is already the pack's icons folder).
pub fn discover_sheet_pairs_with_game_plist_fallback_in(
    input_dir: &Path,
    layout: &GameFilesLayout,
    vanilla_relative_prefix: &Path,
) -> Result<Vec<SheetCandidate>, AppError> {
    let mut pairs = discover_sheet_pairs(input_dir)?;
    if !layout.geometry_dash_found() {
        return Ok(pairs);
    }

    let paired_pngs: HashSet<PathBuf> = pairs.iter().map(|p| p.png_path.clone()).collect();
    let unpaired = discover_unpaired_png_keys(input_dir, &paired_pngs)?;
    for entry in unpaired {
        let lookup_dir = if vanilla_relative_prefix.as_os_str().is_empty() {
            entry.relative_dir.clone()
        } else if entry.relative_dir.as_os_str().is_empty() {
            vanilla_relative_prefix.to_path_buf()
        } else {
            vanilla_relative_prefix.join(&entry.relative_dir)
        };
        let Some(vanilla) = find_current_sheet_for_input(layout, &lookup_dir, &entry.stem)? else {
            continue;
        };
        if !vanilla.plist_path.is_file() {
            continue;
        }
        pairs.push(SheetCandidate {
            stem: entry.stem,
            relative_dir: entry.relative_dir,
            plist_path: vanilla.plist_path,
            png_path: entry.png_path,
        });
    }

    pairs.sort_by(|left, right| {
        left.relative_dir
            .cmp(&right.relative_dir)
            .then_with(|| left.stem.cmp(&right.stem))
    });
    Ok(pairs)
}

/// True when `plist_path` is not under `input_dir` (e.g. resolved from vanilla Resources).
pub fn sheet_uses_external_plist(input_dir: &Path, pair: &SheetCandidate) -> bool {
    let Ok(input_canon) = input_dir.canonicalize() else {
        return !pair.plist_path.starts_with(input_dir);
    };
    let plist_canon = pair
        .plist_path
        .canonicalize()
        .unwrap_or_else(|_| pair.plist_path.clone());
    !plist_canon.starts_with(&input_canon)
}

pub fn find_current_sheet_for_plist(
    layout: &GameFilesLayout,
    plist_path: &Path,
) -> Result<Option<SheetCandidate>, AppError> {
    let normalized = plist_path
        .canonicalize()
        .unwrap_or_else(|_| plist_path.to_path_buf());
    let stem = normalized
        .file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_string();
    if stem.is_empty() {
        return Ok(None);
    }

    if let Some(parent) = normalized.parent() {
        if let Ok(rel) = parent.strip_prefix(&layout.resources) {
            return find_current_sheet_for_input(layout, rel, &stem);
        }

        let geode_loader_root = layout.geode_resources.join("geode.loader");
        if let Ok(rel) = parent.strip_prefix(&geode_loader_root) {
            let mut relative = PathBuf::from("geode.loader");
            relative.push(rel);
            return find_current_sheet_for_input(layout, &relative, &stem);
        }

        if let Ok(after_unzipped) = parent.strip_prefix(&layout.geode_unzipped) {
            let parts: Vec<String> = after_unzipped
                .components()
                .filter_map(|c| match c {
                    Component::Normal(name) => name.to_str().map(|s| s.to_string()),
                    _ => None,
                })
                .collect();
            // {mod}/resources/{mod}/[nested...]
            if parts.len() >= 3 && parts[1].eq_ignore_ascii_case("resources") {
                let mod_name = &parts[0];
                let mut relative = PathBuf::from(mod_name);
                if parts.len() > 3 {
                    for part in parts.iter().skip(3) {
                        relative.push(part);
                    }
                }
                return find_current_sheet_for_input(layout, &relative, &stem);
            }
        }
    }

    find_current_sheet_for_input(layout, Path::new(""), &stem)
}

pub fn split_output_dir_for(layout: &GameFilesLayout, pair: &SheetCandidate) -> PathBuf {
    // relative_dir comes from discovery under an input root; still reject ParentDir if present.
    let mut dir = layout.current_split.clone();
    for component in pair.relative_dir.components() {
        match component {
            Component::Normal(name) => dir.push(name),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                // Fall back to a flat cache key under the root rather than escaping.
                return layout.current_split.join(&pair.stem);
            }
        }
    }
    dir.join(&pair.stem)
}

fn split_cache_entry_key(pair: &SheetCandidate) -> String {
    let relative = if pair.relative_dir.as_os_str().is_empty() {
        pair.stem.clone()
    } else {
        pair.relative_dir
            .join(&pair.stem)
            .to_string_lossy()
            .replace('\\', "/")
    };
    relative
}

fn split_cache_hashes_path(layout: &GameFilesLayout) -> PathBuf {
    layout.current_split.join("hashes.json")
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
struct SplitCacheHashesFile {
    schema_version: u32,
    #[serde(default)]
    entries: HashMap<String, SplitCacheHashEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct SplitCacheHashEntry {
    plist_sha256: String,
    png_sha256: String,
}

fn split_cache_manifest_lock() -> &'static std::sync::Mutex<()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
}

fn sha256_file(path: &Path) -> Result<String, AppError> {
    use sha2::{Digest, Sha256};
    let bytes = fs::read(path).map_err(|err| {
        AppError::IoError(format!(
            "failed to read `{}` for hashing: {err}",
            path.to_string_lossy()
        ))
    })?;
    let digest = Sha256::digest(&bytes);
    Ok(format!("{digest:x}"))
}

fn hash_sheet_pair(pair: &SheetCandidate) -> Result<SplitCacheHashEntry, AppError> {
    Ok(SplitCacheHashEntry {
        plist_sha256: sha256_file(&pair.plist_path)?,
        png_sha256: sha256_file(&pair.png_path)?,
    })
}

fn load_split_cache_hashes(layout: &GameFilesLayout) -> Result<SplitCacheHashesFile, AppError> {
    let path = split_cache_hashes_path(layout);
    if !path.exists() {
        return Ok(SplitCacheHashesFile {
            schema_version: 1,
            entries: HashMap::new(),
        });
    }
    let text = fs::read_to_string(&path).map_err(|err| {
        AppError::IoError(format!(
            "failed to read split cache hashes `{}`: {err}",
            path.to_string_lossy()
        ))
    })?;
    serde_json::from_str(&text).map_err(|err| {
        AppError::ParseError(format!(
            "failed to parse split cache hashes `{}`: {err}",
            path.to_string_lossy()
        ))
    })
}

fn save_split_cache_hashes(
    layout: &GameFilesLayout,
    file: &SplitCacheHashesFile,
) -> Result<(), AppError> {
    fs::create_dir_all(&layout.current_split)?;
    let path = split_cache_hashes_path(layout);
    let json = serde_json::to_string_pretty(file).map_err(|err| {
        AppError::IoError(format!("failed to serialize split cache hashes: {err}"))
    })?;
    fs::write(&path, json).map_err(|err| {
        AppError::IoError(format!(
            "failed to write split cache hashes `{}`: {err}",
            path.to_string_lossy()
        ))
    })?;
    Ok(())
}

fn split_dir_has_cached_plist(pair: &SheetCandidate, split_dir: &Path) -> bool {
    split_dir.join(format!("{}.plist", pair.stem)).exists()
}

fn clear_split_cache_dir(layout: &GameFilesLayout, split_dir: &Path) -> Result<(), AppError> {
    // Harden against junction/symlink escape: only delete under the split-cache root.
    remove_dir_all_under_root(split_dir, &layout.current_split)
}

/// Returns true when the on-disk split cache matches the hashed source gamesheet pair.
pub fn split_cache_is_valid(
    layout: &GameFilesLayout,
    pair: &SheetCandidate,
    split_dir: &Path,
) -> Result<bool, AppError> {
    if !split_dir_has_cached_plist(pair, split_dir) {
        return Ok(false);
    }
    let current = hash_sheet_pair(pair)?;
    let key = split_cache_entry_key(pair);
    let _guard = split_cache_manifest_lock()
        .lock()
        .map_err(|_| AppError::InvalidOperation("split cache hash lock poisoned"))?;
    let manifest = load_split_cache_hashes(layout)?;
    Ok(manifest.entries.get(&key) == Some(&current))
}

pub fn ensure_sheet_split_cached(
    layout: &GameFilesLayout,
    pair: &SheetCandidate,
    options: &SplitterOptions,
) -> Result<PathBuf, AppError> {
    let split_dir = split_output_dir_for(layout, pair);
    let key = split_cache_entry_key(pair);
    let current_hash = hash_sheet_pair(pair)?;

    {
        let _guard = split_cache_manifest_lock()
            .lock()
            .map_err(|_| AppError::InvalidOperation("split cache hash lock poisoned"))?;
        let manifest = load_split_cache_hashes(layout)?;
        if split_dir_has_cached_plist(pair, &split_dir)
            && manifest.entries.get(&key) == Some(&current_hash)
        {
            return Ok(split_dir);
        }
    }

    // Source changed or first use: wipe stale cache, resplit, then record hashes.
    clear_split_cache_dir(layout, &split_dir)?;
    fs::create_dir_all(&split_dir)?;
    split_sheet_candidate(pair, &split_dir, options, || {})?;

    let _guard = split_cache_manifest_lock()
        .lock()
        .map_err(|_| AppError::InvalidOperation("split cache hash lock poisoned"))?;
    let mut manifest = load_split_cache_hashes(layout)?;
    manifest.schema_version = 1;
    manifest.entries.insert(key, current_hash);
    save_split_cache_hashes(layout, &manifest)?;

    // Best-effort sprite hash index when we touch a sheet under Resources/cache paths.
    crate::core::sprite_index::try_index_sheet_pair(
        layout,
        &pair.relative_dir,
        &pair.stem,
        &pair.plist_path,
        &pair.png_path,
    );

    Ok(split_dir)
}

/// Ensure the Steam/Geode source sheet for this input pair is split into the local cache.
pub fn ensure_input_sheet_latest_split_cached(
    layout: &GameFilesLayout,
    input_pair: &SheetCandidate,
    options: &SplitterOptions,
) -> Result<Option<(SheetCandidate, PathBuf)>, AppError> {
    let Some(source_pair) =
        find_current_sheet_for_input(layout, &input_pair.relative_dir, &input_pair.stem)?
    else {
        return Ok(None);
    };
    let split_dir = ensure_sheet_split_cached(layout, &source_pair, options)?;
    Ok(Some((source_pair, split_dir)))
}

pub fn build_plist_index_under(root: &Path) -> Result<HashMap<String, PathBuf>, AppError> {
    let mut index: HashMap<String, PathBuf> = HashMap::new();
    if !root.is_dir() {
        return Ok(index);
    }
    for plist_path in collect_plists_recursive(root)? {
        let Some(stem) = plist_path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        index.insert(stem.to_ascii_lowercase(), plist_path);
    }
    Ok(index)
}

fn collect_plists_recursive(root: &Path) -> Result<Vec<PathBuf>, AppError> {
    let mut files: Vec<PathBuf> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let is_plist = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("plist"))
                .unwrap_or(false);
            if is_plist {
                files.push(path);
            }
        }
    }
    files.sort();
    Ok(files)
}

fn recursive_find_file_named(root: &Path, wanted_file_name: &str) -> Option<PathBuf> {
    if !is_safe_path_segment(wanted_file_name) {
        return None;
    }
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let matches = path
                .file_name()
                .and_then(|v| v.to_str())
                .map(|v| v.eq_ignore_ascii_case(wanted_file_name))
                .unwrap_or(false);
            if matches {
                return Some(path);
            }
        }
    }
    None
}

/// Resolve a split sprite PNG path under a cached split gamesheet directory.
pub fn resolve_cached_split_sprite(split_dir: &Path, frame_name: &str) -> Option<PathBuf> {
    let normalized = frame_name
        .replace('\\', "/")
        .trim_start_matches("./")
        .trim_start_matches('/')
        .to_string();

    let Ok(relative) = path_from_slashes(&normalized) else {
        return None;
    };
    let direct = split_dir.join(&relative);
    if direct.exists() {
        return Some(direct);
    }

    let mut prefixes: Vec<String> = Vec::new();
    if let Some(dir_name) = split_dir.file_name().and_then(|v| v.to_str()) {
        if !dir_name.is_empty() {
            prefixes.push(format!("{dir_name}/"));
        }
    }
    if let Some(parent_name) = split_dir
        .parent()
        .and_then(|value| value.file_name())
        .and_then(|value| value.to_str())
    {
        if !parent_name.is_empty() {
            prefixes.push(format!("{parent_name}/"));
        }
    }
    prefixes.push("icons/".to_string());
    for prefix in prefixes {
        if let Some(trimmed) = normalized.strip_prefix(&prefix) {
            if let Ok(trimmed_rel) = path_from_slashes(trimmed) {
                let trimmed_path = split_dir.join(trimmed_rel);
                if trimmed_path.exists() {
                    return Some(trimmed_path);
                }
            }
        }
    }

    if let Some(file_name_only) = normalized.rsplit('/').next() {
        if is_safe_path_segment(file_name_only) {
            let direct_filename = split_dir.join(file_name_only);
            if direct_filename.exists() {
                return Some(direct_filename);
            }
            if let Some(found) = recursive_find_file_named(split_dir, file_name_only) {
                return Some(found);
            }
        }
    }

    let parts: Vec<&str> = normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() > 1 {
        for start in 1..parts.len() {
            let remainder = parts[start..].join("/");
            if let Ok(remainder_rel) = path_from_slashes(&remainder) {
                let candidate = split_dir.join(remainder_rel);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

pub fn png_path_to_data_url(path: &Path) -> Result<String, AppError> {
    png_file_to_data_url(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::SystemTime;

    fn temp_game_files_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "tm_game_files_{label}_{}",
            SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ))
    }

    fn test_layout(root: &Path, gd: &Path) -> GameFilesLayout {
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

    #[test]
    fn looks_like_geometry_dash_requires_more_than_resources_dirname() {
        let root = temp_game_files_root("gd_shape");
        let plain = root.join("NotGD");
        let resources = plain.join("Resources");
        fs::create_dir_all(&resources).expect("resources");
        assert!(
            !looks_like_geometry_dash_dir(&plain),
            "empty Resources alone must not count as GD"
        );

        fs::create_dir_all(resources.join("icons")).expect("icons");
        assert!(
            looks_like_geometry_dash_dir(&plain),
            "Resources/icons is a valid texture marker"
        );

        let with_exe = root.join("SteamGD");
        fs::create_dir_all(with_exe.join("Resources")).expect("resources");
        fs::write(with_exe.join("GeometryDash.exe"), b"mz").expect("exe");
        assert!(looks_like_geometry_dash_dir(&with_exe));

        let unresolved = root.join(UNRESOLVED_GD_DIR_NAME);
        fs::create_dir_all(unresolved.join("Resources").join("icons")).expect("unresolved");
        assert!(!looks_like_geometry_dash_dir(&unresolved));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn normalize_legacy_version_strips_prefix_and_whitespace() {
        assert_eq!(normalize_legacy_version(" 2.11 "), "2.11");
        assert_eq!(normalize_legacy_version("v2.205"), "2.205");
    }

    #[test]
    fn resolve_current_source_dir_maps_root_icons_and_mods() {
        let layout = test_layout(Path::new("/cache"), Path::new("/gd"));
        assert_eq!(
            resolve_current_source_dir(&layout, Path::new("")),
            PathBuf::from("/gd/Resources")
        );
        assert_eq!(
            resolve_current_source_dir(&layout, Path::new("icons")),
            PathBuf::from("/gd/Resources/icons")
        );
        assert_eq!(
            resolve_current_source_dir(&layout, Path::new("icons/extra")),
            PathBuf::from("/gd/Resources/icons/extra")
        );
        assert_eq!(
            resolve_current_source_dir(&layout, Path::new("geode.loader")),
            PathBuf::from("/gd/geode/resources/geode.loader")
        );
        assert_eq!(
            resolve_current_source_dir(&layout, Path::new("geode.loader/sub")),
            PathBuf::from("/gd/geode/resources/geode.loader/sub")
        );
        assert_eq!(
            resolve_current_source_dir(&layout, Path::new("my.mod/sub")),
            PathBuf::from("/gd/geode/unzipped/my.mod/resources/my.mod/sub")
        );
    }

    #[test]
    fn split_output_dir_matches_splitter_layout() {
        let layout = test_layout(Path::new("/game-files"), Path::new("/gd"));
        let pair = SheetCandidate {
            stem: "BlankSheet-uhd".to_string(),
            relative_dir: PathBuf::new(),
            plist_path: PathBuf::from("/gd/Resources/BlankSheet-uhd.plist"),
            png_path: PathBuf::from("/gd/Resources/BlankSheet-uhd.png"),
        };
        assert_eq!(
            split_output_dir_for(&layout, &pair),
            PathBuf::from("/game-files/split-cache/BlankSheet-uhd")
        );
    }

    #[test]
    fn parse_steam_library_paths_reads_path_entries() {
        let vdf = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
	}
	"2"
	{
		"Path" "E:\\Games\\SteamLibrary"
	}
}
"#;
        let paths = parse_steam_library_paths(vdf);
        assert!(paths.iter().any(|p| p.ends_with("Steam")));
        assert!(paths.iter().any(|p| p.ends_with("SteamLibrary")));
        assert!(paths.iter().any(|p| {
            p.to_string_lossy().contains("E:") && p.to_string_lossy().contains("SteamLibrary")
        }));
    }

    #[test]
    fn split_cache_uses_hashes_and_rebuilds_on_source_change() {
        use crate::core::contracts::phase_defaults;
        use image::{ImageBuffer, Rgba};
        use plist::{Dictionary, Value};

        let root = temp_game_files_root("split_hash");
        let gd = root.join("gd");
        let resources = gd.join("Resources");
        fs::create_dir_all(&resources).expect("resources");
        let layout = test_layout(&root, &gd);
        fs::create_dir_all(&layout.current_split).expect("split cache");

        let plist_path = resources.join("TinySheet.plist");
        let png_path = resources.join("TinySheet.png");
        let mut frames = Dictionary::new();
        frames.insert("a.png".to_string(), Value::Dictionary(Dictionary::new()));
        let mut root_dict = Dictionary::new();
        root_dict.insert("frames".to_string(), Value::Dictionary(frames));
        let mut metadata = Dictionary::new();
        metadata.insert(
            "textureFileName".to_string(),
            Value::String("TinySheet.png".to_string()),
        );
        metadata.insert("format".to_string(), Value::Integer(2.into()));
        root_dict.insert("metadata".to_string(), Value::Dictionary(metadata));
        Value::Dictionary(root_dict)
            .to_file_xml(&plist_path)
            .expect("write plist");
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_pixel(2, 2, Rgba([255, 0, 0, 255]));
        img.save(&png_path).expect("write png");

        let pair = SheetCandidate {
            stem: "TinySheet".to_string(),
            relative_dir: PathBuf::new(),
            plist_path: plist_path.clone(),
            png_path: png_path.clone(),
        };
        let opts = phase_defaults().splitter;

        // First use: create cache + hash entry.
        let split_dir = ensure_sheet_split_cached(&layout, &pair, &opts).expect("first cache");
        assert!(split_dir.join("TinySheet.plist").exists());
        let hashes_path = layout.current_split.join("hashes.json");
        assert!(hashes_path.exists());
        let first_hash = hash_sheet_pair(&pair).expect("hash");
        assert!(split_cache_is_valid(&layout, &pair, &split_dir).expect("valid"));

        // Unchanged source: reuse cache (hash entry stays the same).
        let split_dir_2 = ensure_sheet_split_cached(&layout, &pair, &opts).expect("reuse");
        assert_eq!(split_dir, split_dir_2);
        let manifest = load_split_cache_hashes(&layout).expect("load");
        assert_eq!(manifest.entries.get("TinySheet"), Some(&first_hash));

        // Change source png: cache should be wiped and rebuilt with new hash.
        let marker = split_dir.join("stale_marker.txt");
        fs::write(&marker, b"stale").expect("marker");
        let img2: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_pixel(2, 2, Rgba([0, 255, 0, 255]));
        img2.save(&png_path).expect("rewrite png");
        assert!(!split_cache_is_valid(&layout, &pair, &split_dir).expect("invalid after change"));

        let split_dir_3 = ensure_sheet_split_cached(&layout, &pair, &opts).expect("rebuild");
        assert_eq!(split_dir, split_dir_3);
        assert!(!marker.exists(), "stale cache files should be deleted");
        assert!(split_dir.join("TinySheet.plist").exists());
        let second_hash = hash_sheet_pair(&pair).expect("hash2");
        assert_ne!(first_hash, second_hash);
        let manifest2 = load_split_cache_hashes(&layout).expect("load2");
        assert_eq!(manifest2.entries.get("TinySheet"), Some(&second_hash));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn build_plist_index_under_indexes_nested_stems() {
        let root = temp_game_files_root("plist_index");
        let icons = root.join("icons");
        fs::create_dir_all(&icons).expect("create icons");
        fs::write(icons.join("player_02-uhd.plist"), b"plist").expect("write plist");
        let index = build_plist_index_under(&root).expect("index");
        assert!(index.contains_key("player_02-uhd"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn resolve_cached_split_sprite_finds_nested_frame() {
        let temp = temp_game_files_root("split_sprite");
        let split_dir = temp.join("BlankSheet-uhd");
        let nested = split_dir.join("geode.loader");
        fs::create_dir_all(&nested).expect("create nested");
        let sprite_path = nested.join("baseCircle_Big_Primary.png");
        fs::write(&sprite_path, b"png").expect("write sprite");
        let resolved =
            resolve_cached_split_sprite(&split_dir, "geode.loader/baseCircle_Big_Primary.png");
        assert_eq!(resolved, Some(sprite_path));
        let _ = fs::remove_dir_all(&temp);
    }

    #[test]
    fn find_current_sheet_for_input_reads_resources_and_mod_paths() {
        let root = temp_game_files_root("steam_resolve");
        let gd = root.join("Geometry Dash");
        let resources = gd.join("Resources");
        let icons = resources.join("icons");
        let mod_res = gd.join("geode").join("resources").join("geode.loader");
        fs::create_dir_all(&icons).expect("resources");
        fs::create_dir_all(&mod_res).expect("geode.loader");
        fs::write(resources.join("BlankSheet-uhd.plist"), b"p").unwrap();
        fs::write(resources.join("BlankSheet-uhd.png"), b"g").unwrap();
        fs::write(icons.join("player_02-uhd.plist"), b"p").unwrap();
        fs::write(icons.join("player_02-uhd.png"), b"g").unwrap();
        fs::write(mod_res.join("BlankSheet-uhd.plist"), b"p").unwrap();
        fs::write(mod_res.join("BlankSheet-uhd.png"), b"g").unwrap();

        let layout = test_layout(&root, &gd);
        let root_sheet =
            find_current_sheet_for_input(&layout, Path::new(""), "BlankSheet-uhd").unwrap();
        assert!(root_sheet
            .unwrap()
            .plist_path
            .ends_with("BlankSheet-uhd.plist"));

        let icon_sheet =
            find_current_sheet_for_input(&layout, Path::new("icons"), "player_02-uhd").unwrap();
        assert!(icon_sheet
            .unwrap()
            .plist_path
            .to_string_lossy()
            .contains("icons"));

        let mod_sheet =
            find_current_sheet_for_input(&layout, Path::new("geode.loader"), "BlankSheet-uhd")
                .unwrap();
        assert!(mod_sheet
            .unwrap()
            .plist_path
            .to_string_lossy()
            .replace('\\', "/")
            .contains("geode/resources/geode.loader"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn discover_sheet_pairs_with_game_plist_fallback_promotes_unpaired_png() {
        let root = temp_game_files_root("plist_fallback");
        let gd = root.join("Geometry Dash");
        let resources = gd.join("Resources");
        let pack = root.join("pack");
        fs::create_dir_all(resources.join("icons")).expect("resources/icons");
        fs::create_dir_all(&pack).expect("pack");
        fs::write(gd.join("GeometryDash.exe"), b"mz").expect("exe");
        fs::write(resources.join("GJ_GameSheet-uhd.plist"), b"plist").expect("vanilla plist");
        fs::write(resources.join("GJ_GameSheet-uhd.png"), b"vanilla-png").expect("vanilla png");
        fs::write(pack.join("GJ_GameSheet-uhd.png"), b"pack-png").expect("pack png");

        let layout = test_layout(&root, &gd);
        assert!(layout.geometry_dash_found());

        let pairs =
            discover_sheet_pairs_with_game_plist_fallback(&pack, &layout).expect("discover");
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].stem, "GJ_GameSheet-uhd");
        assert_eq!(pairs[0].png_path, pack.join("GJ_GameSheet-uhd.png"));
        assert_eq!(
            pairs[0].plist_path,
            resources.join("GJ_GameSheet-uhd.plist")
        );
        assert!(sheet_uses_external_plist(&pack, &pairs[0]));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn discover_sheet_pairs_with_game_plist_fallback_keeps_local_plist() {
        let root = temp_game_files_root("plist_fallback_local");
        let gd = root.join("Geometry Dash");
        let resources = gd.join("Resources");
        let pack = root.join("pack");
        fs::create_dir_all(resources.join("icons")).expect("resources/icons");
        fs::create_dir_all(&pack).expect("pack");
        fs::write(gd.join("GeometryDash.exe"), b"mz").expect("exe");
        fs::write(resources.join("GJ_GameSheet-uhd.plist"), b"vanilla").expect("vanilla plist");
        fs::write(pack.join("GJ_GameSheet-uhd.plist"), b"pack-plist").expect("pack plist");
        fs::write(pack.join("GJ_GameSheet-uhd.png"), b"pack-png").expect("pack png");

        let layout = test_layout(&root, &gd);
        let pairs =
            discover_sheet_pairs_with_game_plist_fallback(&pack, &layout).expect("discover");
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].plist_path, pack.join("GJ_GameSheet-uhd.plist"));
        assert_eq!(pairs[0].png_path, pack.join("GJ_GameSheet-uhd.png"));
        assert!(!sheet_uses_external_plist(&pack, &pairs[0]));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn discover_sheet_pairs_with_game_plist_fallback_skips_when_no_vanilla_plist() {
        let root = temp_game_files_root("plist_fallback_miss");
        let gd = root.join("Geometry Dash");
        let resources = gd.join("Resources");
        let pack = root.join("pack");
        fs::create_dir_all(resources.join("icons")).expect("resources/icons");
        fs::create_dir_all(&pack).expect("pack");
        fs::write(gd.join("GeometryDash.exe"), b"mz").expect("exe");
        fs::write(pack.join("edit_eAlphaBtn_001.png"), b"btn").expect("pack png");

        let layout = test_layout(&root, &gd);
        let pairs =
            discover_sheet_pairs_with_game_plist_fallback(&pack, &layout).expect("discover");
        assert!(pairs.is_empty());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn discover_sheet_pairs_with_game_plist_fallback_skips_when_gd_missing() {
        let root = temp_game_files_root("plist_fallback_no_gd");
        let unresolved = root.join(UNRESOLVED_GD_DIR_NAME);
        let resources = unresolved.join("Resources");
        let pack = root.join("pack");
        fs::create_dir_all(resources.join("icons")).expect("resources/icons");
        fs::create_dir_all(&pack).expect("pack");
        fs::write(resources.join("GJ_GameSheet-uhd.plist"), b"plist").expect("vanilla plist");
        fs::write(pack.join("GJ_GameSheet-uhd.png"), b"pack-png").expect("pack png");

        let layout = test_layout(&root, &unresolved);
        assert!(!layout.geometry_dash_found());
        let pairs =
            discover_sheet_pairs_with_game_plist_fallback(&pack, &layout).expect("discover");
        assert!(pairs.is_empty());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn discover_sheet_pairs_with_game_plist_fallback_in_uses_icons_prefix() {
        let root = temp_game_files_root("plist_fallback_icons");
        let gd = root.join("Geometry Dash");
        let resources = gd.join("Resources");
        let icons_res = resources.join("icons");
        let pack_icons = root.join("pack").join("icons");
        fs::create_dir_all(&icons_res).expect("resources/icons");
        fs::create_dir_all(&pack_icons).expect("pack/icons");
        fs::write(gd.join("GeometryDash.exe"), b"mz").expect("exe");
        fs::write(icons_res.join("player_01-uhd.plist"), b"plist").expect("vanilla plist");
        fs::write(icons_res.join("player_01-uhd.png"), b"vanilla").expect("vanilla png");
        fs::write(pack_icons.join("player_01-uhd.png"), b"pack").expect("pack png");

        let layout = test_layout(&root, &gd);
        let pairs = discover_sheet_pairs_with_game_plist_fallback_in(
            &pack_icons,
            &layout,
            Path::new("icons"),
        )
        .expect("discover");
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].stem, "player_01-uhd");
        assert_eq!(pairs[0].png_path, pack_icons.join("player_01-uhd.png"));
        assert_eq!(pairs[0].plist_path, icons_res.join("player_01-uhd.plist"));

        let _ = fs::remove_dir_all(&root);
    }
}
