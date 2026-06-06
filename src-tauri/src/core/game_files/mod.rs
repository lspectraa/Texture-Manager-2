pub mod sync;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde::Serialize;

use crate::core::contracts::SplitterOptions;
use crate::core::discovery::{discover_sheet_pairs, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::splitter::split_sheet_candidate;

const GAME_FILES_DIR_NAME: &str = "TextureManager2";
const GAME_FILES_SUBDIR: &str = "game-files";

#[derive(Debug, Clone)]
pub struct GameFilesLayout {
    pub root: PathBuf,
    pub current: PathBuf,
    pub current_split: PathBuf,
    pub legacy: PathBuf,
}

#[derive(Clone)]
pub struct GameFilesState(pub Arc<GameFilesLayout>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameFilesLayoutDto {
    pub root_dir: String,
    pub current_dir: String,
    pub split_dir: String,
    pub legacy_dir: String,
}

impl GameFilesLayout {
    pub fn to_dto(&self) -> GameFilesLayoutDto {
        GameFilesLayoutDto {
            root_dir: self.root.to_string_lossy().to_string(),
            current_dir: self.current.to_string_lossy().to_string(),
            split_dir: self.current_split.to_string_lossy().to_string(),
            legacy_dir: self.legacy.to_string_lossy().to_string(),
        }
    }

    pub fn legacy_gamesheets_dir(&self, version: &str) -> PathBuf {
        self.legacy.join(normalize_legacy_version(version))
    }
}

pub fn resolve_game_files_root() -> PathBuf {
    if let Ok(env_override) = std::env::var("TM_GAME_FILES_DIR") {
        let trimmed = env_override.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
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
    version.trim().trim_start_matches('v').trim_start_matches('V').to_string()
}

pub fn bootstrap_game_files() -> Result<GameFilesLayout, AppError> {
    let root = resolve_game_files_root();
    let current = root.join("current");
    let current_split = current.join("split");
    let legacy = root.join("legacy");

    fs::create_dir_all(&current)?;
    fs::create_dir_all(&current_split)?;
    fs::create_dir_all(&legacy)?;

    maybe_seed_current_from_env(&current)?;

    let layout = GameFilesLayout {
        root,
        current,
        current_split,
        legacy,
    };
    sync::check_for_updates(&layout)?;
    Ok(layout)
}

fn maybe_seed_current_from_env(current: &Path) -> Result<(), AppError> {
    let Ok(seed_from) = std::env::var("TM_SEED_GAME_FILES_FROM") else {
        return Ok(());
    };
    if seed_from.trim().is_empty() {
        return Ok(());
    }
    let seed_path = PathBuf::from(seed_from.trim());
    if !seed_path.exists() || !seed_path.is_dir() {
        return Ok(());
    }
    if !discover_sheet_pairs(current)?.is_empty() {
        return Ok(());
    }
    copy_dir_recursive(&seed_path, current)?;
    Ok(())
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), AppError> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

pub fn discover_current_sheet_pairs(layout: &GameFilesLayout) -> Result<Vec<SheetCandidate>, AppError> {
    discover_sheet_pairs(&layout.current)
}

pub fn find_current_sheet_for_plist(
    layout: &GameFilesLayout,
    plist_path: &Path,
) -> Result<Option<SheetCandidate>, AppError> {
    let pairs = discover_sheet_pairs(&layout.current)?;
    let normalized = plist_path
        .canonicalize()
        .unwrap_or_else(|_| plist_path.to_path_buf());
    Ok(pairs.into_iter().find(|pair| {
        pair.plist_path
            .canonicalize()
            .unwrap_or_else(|_| pair.plist_path.clone())
            == normalized
    }))
}

pub fn split_output_dir_for(layout: &GameFilesLayout, pair: &SheetCandidate) -> PathBuf {
    layout
        .current_split
        .join(&pair.relative_dir)
        .join(&pair.stem)
}

pub fn split_cache_is_valid(pair: &SheetCandidate, split_dir: &Path) -> bool {
    let split_plist = split_dir.join(format!("{}.plist", pair.stem));
    if !split_plist.exists() {
        return false;
    }
    let Ok(source_mtime) = fs::metadata(&pair.plist_path).and_then(|m| m.modified()) else {
        return false;
    };
    let Ok(split_mtime) = fs::metadata(&split_plist).and_then(|m| m.modified()) else {
        return false;
    };
    split_mtime >= source_mtime
}

pub fn ensure_sheet_split_cached(
    layout: &GameFilesLayout,
    pair: &SheetCandidate,
    options: &SplitterOptions,
) -> Result<PathBuf, AppError> {
    let split_dir = split_output_dir_for(layout, pair);
    if split_cache_is_valid(pair, &split_dir) {
        return Ok(split_dir);
    }

    fs::create_dir_all(&split_dir)?;
    split_sheet_candidate(pair, &split_dir, options, || {})?;
    Ok(split_dir)
}

pub fn build_plist_index_under(root: &Path) -> Result<HashMap<String, PathBuf>, AppError> {
    let mut index: HashMap<String, PathBuf> = HashMap::new();
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
        for entry in fs::read_dir(&dir)? {
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

fn path_from_slashes(value: &str) -> PathBuf {
    value.split('/').fold(PathBuf::new(), |mut acc, part| {
        if !part.is_empty() {
            acc.push(part);
        }
        acc
    })
}

fn recursive_find_file_named(root: &Path, wanted_file_name: &str) -> Option<PathBuf> {
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

    let direct = split_dir.join(path_from_slashes(&normalized));
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
            let trimmed_path = split_dir.join(path_from_slashes(trimmed));
            if trimmed_path.exists() {
                return Some(trimmed_path);
            }
        }
    }

    if let Some(file_name_only) = normalized.rsplit('/').next() {
        let direct_filename = split_dir.join(file_name_only);
        if direct_filename.exists() {
            return Some(direct_filename);
        }
        if let Some(found) = recursive_find_file_named(split_dir, file_name_only) {
            return Some(found);
        }
    }

    let parts: Vec<&str> = normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() > 1 {
        for start in 1..parts.len() {
            let remainder = parts[start..].join("/");
            let candidate = split_dir.join(path_from_slashes(&remainder));
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

pub fn png_path_to_data_url(path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(path)?;
    let encoded = BASE64_STANDARD.encode(bytes);
    Ok(format!("data:image/png;base64,{encoded}"))
}

pub fn ensure_current_library_split_cached(
    layout: &GameFilesLayout,
    options: &SplitterOptions,
) -> Result<(), AppError> {
    let pairs = discover_current_sheet_pairs(layout)?;
    for pair in pairs {
        ensure_sheet_split_cached(layout, &pair, options)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};

    fn temp_game_files_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "tm_game_files_{label}_{}",
            SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ))
    }

    #[test]
    fn normalize_legacy_version_strips_prefix_and_whitespace() {
        assert_eq!(normalize_legacy_version(" 2.11 "), "2.11");
        assert_eq!(normalize_legacy_version("v2.205"), "2.205");
    }

    #[test]
    fn split_output_dir_matches_splitter_layout() {
        let layout = GameFilesLayout {
            root: PathBuf::from("/game-files"),
            current: PathBuf::from("/game-files/current"),
            current_split: PathBuf::from("/game-files/current/split"),
            legacy: PathBuf::from("/game-files/legacy"),
        };
        let pair = SheetCandidate {
            stem: "BlankSheet-uhd".to_string(),
            relative_dir: PathBuf::new(),
            plist_path: PathBuf::from("/game-files/current/BlankSheet-uhd.plist"),
            png_path: PathBuf::from("/game-files/current/BlankSheet-uhd.png"),
        };
        assert_eq!(
            split_output_dir_for(&layout, &pair),
            PathBuf::from("/game-files/current/split/BlankSheet-uhd")
        );
    }

    #[test]
    fn bootstrap_creates_expected_directories() {
        let root = temp_game_files_root("bootstrap");
        std::env::set_var("TM_GAME_FILES_DIR", root.to_string_lossy().to_string());
        let layout = bootstrap_game_files().expect("bootstrap");
        assert!(layout.current.is_dir());
        assert!(layout.current_split.is_dir());
        assert!(layout.legacy.is_dir());
        assert!(root.join("manifest.local.json").exists());
        std::env::remove_var("TM_GAME_FILES_DIR");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn split_cache_validity_tracks_source_mtime() {
        let root = temp_game_files_root("split_validity");
        let current = root.join("current");
        let split_dir = current.join("split").join("BlankSheet-uhd");
        fs::create_dir_all(&split_dir).expect("create split dir");
        let plist_path = current.join("BlankSheet-uhd.plist");
        let split_plist = split_dir.join("BlankSheet-uhd.plist");
        fs::write(&plist_path, b"source").expect("write source plist");
        fs::write(&split_plist, b"split").expect("write split plist");
        let pair = SheetCandidate {
            stem: "BlankSheet-uhd".to_string(),
            relative_dir: PathBuf::new(),
            plist_path: plist_path.clone(),
            png_path: current.join("BlankSheet-uhd.png"),
        };
        assert!(split_cache_is_valid(&pair, &split_dir));
        std::thread::sleep(Duration::from_millis(20));
        fs::write(&plist_path, b"source-updated").expect("touch source");
        assert!(!split_cache_is_valid(&pair, &split_dir));
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
        let resolved = resolve_cached_split_sprite(
            &split_dir,
            "geode.loader/baseCircle_Big_Primary.png",
        );
        assert_eq!(resolved, Some(sprite_path));
        let _ = fs::remove_dir_all(&temp);
    }
}
