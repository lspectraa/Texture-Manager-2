use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::core::errors::AppError;
use crate::core::porter::porter_stem_eligible;

/// True when `path` is under `input_root` and either:
/// - the first path segment after `input_root` is one of the tool output buckets
///   (`Split`, `Merged`, `Ported`, `GeneratedGlow`, `ConvertedToLatestVersion`), or
/// - any nested segment is `GeneratedGlow` (for icon glow output inside `icons/GeneratedGlow`).
pub fn path_is_under_reserved_output_subtree(input_root: &Path, path: &Path) -> bool {
    let Ok(rel) = path.strip_prefix(input_root) else {
        return false;
    };
    let components: Vec<&OsStr> = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(name) => Some(name),
            _ => None,
        })
        .collect();
    let Some(first) = components.first().copied() else {
        return false;
    };
    if reserved_output_dir_name(first) {
        return true;
    }
    components
        .iter()
        .copied()
        .any(|name| name.to_string_lossy().eq_ignore_ascii_case("GeneratedGlow"))
}

fn reserved_output_dir_name(name: &OsStr) -> bool {
    let s = name.to_string_lossy();
    s.eq_ignore_ascii_case("Split")
        || s.eq_ignore_ascii_case("Merged")
        || s.eq_ignore_ascii_case("Ported")
        || s.eq_ignore_ascii_case("GeneratedGlow")
        || s.eq_ignore_ascii_case("ConvertedToLatestVersion")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SheetCandidate {
    pub stem: String,
    pub relative_dir: PathBuf,
    pub plist_path: PathBuf,
    pub png_path: PathBuf,
}

pub fn discover_sheet_pairs(input_dir: &Path) -> Result<Vec<SheetCandidate>, AppError> {
    let files = collect_files_recursive(input_dir)?;
    let mut plists: HashMap<PathBuf, PathBuf> = HashMap::new();
    let mut pngs: HashMap<PathBuf, PathBuf> = HashMap::new();

    for file in files {
        let Some(stem) = file.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let Some(ext) = file.extension().and_then(|value| value.to_str()) else {
            continue;
        };

        let relative_file = file
            .strip_prefix(input_dir)
            .map_err(|_| AppError::InvalidOperation("failed to compute relative file path"))?
            .to_path_buf();
        let parent = relative_file.parent().map(Path::to_path_buf).unwrap_or_default();
        let key = parent.join(stem);

        match ext.to_ascii_lowercase().as_str() {
            "plist" => {
                plists.insert(key, file.clone());
            }
            "png" => {
                pngs.insert(key, file.clone());
            }
            _ => {}
        }
    }

    let mut pairs: Vec<SheetCandidate> = Vec::new();
    for (key, plist_path) in plists {
        if let Some(png_path) = pngs.get(&key) {
            let stem = key
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or(AppError::InvalidOperation("invalid sheet key stem"))?
                .to_string();
            let relative_dir = key.parent().map(Path::to_path_buf).unwrap_or_default();
            pairs.push(SheetCandidate {
                stem,
                relative_dir,
                plist_path,
                png_path: png_path.clone(),
            });
        }
    }

    pairs.sort_by(|left, right| left.stem.cmp(&right.stem));
    Ok(pairs)
}

/// `.png` files under `input_dir` that are not the sheet image for any discovered plist/png pair
/// (same relative folder + stem as a paired plist).
pub fn discover_standalone_pngs(
    input_dir: &Path,
    paired_png_paths: &HashSet<PathBuf>,
) -> Result<Vec<PathBuf>, AppError> {
    let files = collect_files_recursive(input_dir)?;
    let mut out: Vec<PathBuf> = Vec::new();
    for file in files {
        if !file.is_file() {
            continue;
        }
        let is_png = file
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("png"))
            .unwrap_or(false);
        if !is_png || paired_png_paths.contains(&file) {
            continue;
        }
        let Some(stem) = file.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !porter_stem_eligible(stem) {
            continue;
        }
        out.push(file);
    }
    out.sort();
    Ok(out)
}

/// `.fnt` files under `input_dir` whose stem ends with `-hd` or `-uhd` (classic porter eligibility).
pub fn discover_standalone_fnts(input_dir: &Path) -> Result<Vec<PathBuf>, AppError> {
    let files = collect_files_recursive(input_dir)?;
    let mut out: Vec<PathBuf> = Vec::new();
    for file in files {
        let is_fnt = file
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("fnt"))
            .unwrap_or(false);
        if !is_fnt {
            continue;
        }
        let Some(stem) = file.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !porter_stem_eligible(stem) {
            continue;
        }
        out.push(file);
    }
    out.sort();
    Ok(out)
}

pub fn discover_merge_source_dirs(input_dir: &Path) -> Result<Vec<PathBuf>, AppError> {
    let all_dirs = collect_dirs_recursive(input_dir)?;
    let mut dirs: Vec<PathBuf> = all_dirs
        .into_iter()
        .filter(|dir| directory_has_direct_plist_file(dir))
        .collect();

    dirs.sort();
    Ok(dirs)
}

fn collect_files_recursive(root: &Path) -> Result<Vec<PathBuf>, AppError> {
    let mut files: Vec<PathBuf> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    let mut seen_dirs: HashSet<PathBuf> = HashSet::new();

    while let Some(dir) = stack.pop() {
        if !seen_dirs.insert(dir.clone()) {
            continue;
        }

        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                if !path_is_under_reserved_output_subtree(root, &path) {
                    stack.push(path);
                }
            } else {
                files.push(path);
            }
        }
    }

    Ok(files)
}

fn collect_dirs_recursive(root: &Path) -> Result<Vec<PathBuf>, AppError> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    let mut seen_dirs: HashSet<PathBuf> = HashSet::new();

    while let Some(dir) = stack.pop() {
        if !seen_dirs.insert(dir.clone()) {
            continue;
        }
        dirs.push(dir.clone());

        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                if !path_is_under_reserved_output_subtree(root, &path) {
                    stack.push(path);
                }
            }
        }
    }

    Ok(dirs)
}

fn directory_has_direct_plist_file(directory: &Path) -> bool {
    let Ok(read_dir) = fs::read_dir(directory) else {
        return false;
    };

    read_dir
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .any(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case("plist"))
                    .unwrap_or(false)
        })
}

#[cfg(test)]
mod reserved_path_tests {
    use std::path::Path;

    use super::path_is_under_reserved_output_subtree;

    #[test]
    fn split_merged_ported_direct_children_are_reserved() {
        let root = Path::new("C:/proj/textures");
        assert!(path_is_under_reserved_output_subtree(
            root,
            Path::new("C:/proj/textures/Split/Icons")
        ));
        assert!(path_is_under_reserved_output_subtree(
            root,
            Path::new("C:/proj/textures/merged/out")
        ));
        assert!(path_is_under_reserved_output_subtree(
            root,
            Path::new("C:/proj/textures/PORTED/foo.plist")
        ));
        assert!(path_is_under_reserved_output_subtree(
            root,
            Path::new("C:/proj/textures/GeneratedGlow/icon.plist")
        ));
        assert!(path_is_under_reserved_output_subtree(
            root,
            Path::new("C:/proj/textures/ConvertedToLatestVersion/sheet.plist")
        ));
    }

    #[test]
    fn nested_non_reserved_paths_not_flagged() {
        let root = Path::new("C:/proj/textures");
        assert!(!path_is_under_reserved_output_subtree(
            root,
            Path::new("C:/proj/textures/mods/pack/Icons")
        ));
        assert!(path_is_under_reserved_output_subtree(
            root,
            Path::new("C:/proj/textures/icons/GeneratedGlow/player_01.plist")
        ));
    }
}
