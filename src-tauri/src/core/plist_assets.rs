//! Resolve image files that belong next to a plist (gamesheets, particles, icons).

use std::fs;
use std::path::{Path, PathBuf};

use plist::{Dictionary, Value};

use crate::core::safe_fs::join_under_parent;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"];

/// Find a file in `dir` by exact name, then case-insensitive directory scan.
pub fn find_file_in_dir_case_insensitive(dir: &Path, name: &str) -> Option<PathBuf> {
    if name.is_empty() {
        return None;
    }
    let exact = dir.join(name);
    if exact.is_file() {
        return Some(exact);
    }
    let name_lower = name.to_ascii_lowercase();
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        if file_name.to_string_lossy().to_ascii_lowercase() == name_lower {
            let path = entry.path();
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn push_texture_name(names: &mut Vec<String>, name: &str) {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return;
    }
    if names.iter().any(|existing| existing == trimmed) {
        return;
    }
    names.push(trimmed.to_string());
}

fn texture_names_from_metadata(metadata: &Dictionary) -> Vec<String> {
    let mut names = Vec::new();
    for key in ["realTextureFileName", "textureFileName"] {
        let Some(name) = metadata.get(key).and_then(Value::as_string) else {
            continue;
        };
        push_texture_name(&mut names, name);
        let base = Path::new(name)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(name);
        if base != name {
            push_texture_name(&mut names, base);
        }
    }
    names
}

fn texture_names_from_plist_root(root_dict: &Dictionary) -> Vec<String> {
    let mut names = Vec::new();
    for key in ["realTextureFileName", "textureFileName"] {
        let Some(name) = root_dict.get(key).and_then(Value::as_string) else {
            continue;
        };
        push_texture_name(&mut names, name);
        let base = Path::new(name)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(name);
        if base != name {
            push_texture_name(&mut names, base);
        }
    }
    if let Some(metadata) = root_dict.get("metadata").and_then(Value::as_dictionary) {
        for name in texture_names_from_metadata(metadata) {
            push_texture_name(&mut names, &name);
        }
    }
    names
}

fn load_plist_root(plist_path: &Path) -> Option<Dictionary> {
    Value::from_file(plist_path)
        .ok()
        .and_then(|value| value.into_dictionary())
}

fn push_candidate(candidates: &mut Vec<String>, name: &str) {
    if name.is_empty() {
        return;
    }
    if candidates.iter().any(|existing| existing == name) {
        return;
    }
    candidates.push(name.to_string());
}

/// Resolve an on-disk image beside a plist using stem match, metadata texture names,
/// and case-insensitive sibling lookup.
pub fn resolve_image_beside_plist(
    plist_path: &Path,
    plist_root: Option<&Dictionary>,
) -> Option<PathBuf> {
    let parent = plist_path.parent()?;
    let stem = plist_path.file_stem()?.to_str()?;

    let root_dict = plist_root
        .cloned()
        .or_else(|| load_plist_root(plist_path));

    let mut candidates: Vec<String> = Vec::new();
    for ext in IMAGE_EXTENSIONS {
        push_candidate(&mut candidates, &format!("{stem}.{ext}"));
    }
    if let Some(dict) = root_dict.as_ref() {
        candidates.extend(texture_names_from_plist_root(dict));
    }

    for name in candidates {
        if let Some(found) = find_file_in_dir_case_insensitive(parent, &name) {
            return Some(found);
        }
        if let Ok(scoped) = join_under_parent(parent, &name) {
            if scoped.is_file() {
                return Some(scoped);
            }
        }
    }

    None
}

/// Gamesheet PNG beside a plist (same resolution rules, PNG-first stem).
pub fn resolve_png_beside_plist(
    plist_path: &Path,
    plist_root: Option<&Dictionary>,
) -> PathBuf {
    if let Some(path) = resolve_image_beside_plist(plist_path, plist_root) {
        return path;
    }
    plist_path.with_extension("png")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn resolve_prefers_stem_png_over_root_texture_name() {
        let dir = std::env::temp_dir().join(format!(
            "tm-plist-assets-stem-prefer-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        let plist_path = dir.join("effect.plist");
        fs::write(
            &plist_path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>textureFileName</key>
  <string>Square2.png</string>
</dict></plist>"#,
        )
        .expect("plist");
        fs::write(dir.join("effect.png"), b"stem-png").expect("stem png");
        fs::write(dir.join("Square2.png"), b"named-png").expect("named png");

        let resolved = resolve_image_beside_plist(&plist_path, None).expect("resolved");
        assert_eq!(resolved, dir.join("effect.png"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_falls_back_to_root_texture_file_name() {
        let dir = std::env::temp_dir().join(format!(
            "tm-plist-assets-root-fallback-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        let plist_path = dir.join("dragEffect.plist");
        fs::write(
            &plist_path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>textureFileName</key>
  <string>Square2.png</string>
</dict></plist>"#,
        )
        .expect("plist");
        fs::write(dir.join("square2.png"), b"particle-png").expect("named png");

        let resolved = resolve_image_beside_plist(&plist_path, None).expect("resolved");
        assert_eq!(
            resolved
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase(),
            "square2.png"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_falls_back_to_metadata_texture_name() {
        let dir = std::env::temp_dir().join(format!(
            "tm-plist-assets-meta-fallback-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        let plist_path = dir.join("custom-icon.plist");
        fs::write(
            &plist_path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>metadata</key>
  <dict>
    <key>realTextureFileName</key>
    <string>atlas.png</string>
  </dict>
</dict></plist>"#,
        )
        .expect("plist");
        fs::write(dir.join("atlas.png"), b"atlas-png").expect("atlas png");

        let resolved = resolve_image_beside_plist(&plist_path, None).expect("resolved");
        assert_eq!(resolved, dir.join("atlas.png"));
        let _ = fs::remove_dir_all(&dir);
    }
}
