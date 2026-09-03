//! Resolve image files that belong next to a plist (gamesheets, particles, icons).

use std::fs;
use std::path::{Path, PathBuf};

use plist::{Dictionary, Value};

use crate::core::safe_fs::{join_under_parent, shorten_path_for_display};

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"];

fn is_nonempty_file(path: &Path) -> bool {
    path.is_file()
        && fs::metadata(path)
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false)
}

/// Find a file in `dir` by exact name, then case-insensitive directory scan.
pub fn find_file_in_dir_case_insensitive(dir: &Path, name: &str) -> Option<PathBuf> {
    if name.is_empty() {
        return None;
    }
    let exact = dir.join(name);
    if is_nonempty_file(&exact) {
        return Some(exact);
    }
    let name_lower = name.to_ascii_lowercase();
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        if file_name.to_string_lossy().to_ascii_lowercase() == name_lower {
            let path = entry.path();
            if is_nonempty_file(&path) {
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

    // First: same basename as the plist with `.png` (icons-hd.plist → icons-hd.png).
    if let Some(found) = resolve_stem_png_beside_plist(plist_path) {
        return Some(found);
    }

    // Geode icon packs usually store the sheet under `icons/{stem}.png`.
    if let Some(found) = resolve_geode_icons_png_beside_plist(plist_path) {
        return Some(found);
    }

    let root_dict = plist_root
        .cloned()
        .or_else(|| load_plist_root(plist_path));

    let mut candidates: Vec<String> = Vec::new();
    for stem in plist_stem_candidates(plist_path) {
        for ext in IMAGE_EXTENSIONS {
            if ext.eq_ignore_ascii_case("png") {
                continue;
            }
            push_candidate(&mut candidates, &format!("{stem}.{ext}"));
        }
    }
    if let Some(dict) = root_dict.as_ref() {
        candidates.extend(texture_names_from_plist_root(dict));
    }

    for name in candidates {
        if let Some(found) = find_file_in_dir_case_insensitive(parent, &name) {
            return Some(found);
        }
        if let Ok(scoped) = join_under_parent(parent, &name) {
            if is_nonempty_file(&scoped) {
                return Some(scoped);
            }
        }
    }

    find_image_by_stem_scan(parent, &plist_stem_candidates(plist_path)).or_else(|| {
        #[cfg(not(target_os = "android"))]
        {
            find_single_image_fallback(parent, plist_path)
        }
        #[cfg(target_os = "android")]
        {
            None
        }
    })
}

/// User-facing report when [`resolve_image_beside_plist`] returns `None`.
pub fn diagnose_missing_atlas_image(
    plist_path: &Path,
    plist_root: Option<&Dictionary>,
) -> String {
    let mut lines: Vec<String> = Vec::new();
    lines.push(format!("Plist: {}", shorten_path_for_display(plist_path)));

    let Some(parent) = plist_path.parent() else {
        lines.push("The plist path has no parent folder.".to_string());
        return lines.join("\n");
    };

    if !parent.exists() {
        lines.push(format!(
            "Folder does not exist: {}",
            shorten_path_for_display(parent)
        ));
        #[cfg(target_os = "android")]
        lines.push(
            "On Android, pick the plist again so the app can import it, or grant All files access."
                .to_string(),
        );
        return lines.join("\n");
    }

    match fs::read_dir(parent) {
        Err(err) => {
            lines.push(format!(
                "Cannot read folder `{}`: {err}",
                shorten_path_for_display(parent)
            ));
            #[cfg(target_os = "android")]
            lines.push(
                "If the PNG is on device storage, it may not have been copied into the app import folder."
                    .to_string(),
            );
        }
        Ok(entries) => {
            let mut names: Vec<String> = entries
                .flatten()
                .filter(|entry| is_nonempty_file(&entry.path()))
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect();
            names.sort();
            if names.is_empty() {
                lines.push(format!(
                    "Folder is empty: {}",
                    shorten_path_for_display(parent)
                ));
            } else {
                let image_count = names.iter().filter(|name| is_image_filename(name)).count();
                let preview = names.iter().take(16).cloned().collect::<Vec<_>>().join(", ");
                let suffix = if names.len() > 16 {
                    format!(" (+{} more)", names.len() - 16)
                } else {
                    String::new()
                };
                lines.push(format!(
                    "Files in folder ({} total, {} images): {preview}{suffix}",
                    names.len(),
                    image_count,
                ));
                if image_count == 0 {
                    lines.push(
                        "No image files (.png, .jpg, …) were found next to the plist.".to_string(),
                    );
                    #[cfg(target_os = "android")]
                    lines.push(
                        "Grant All files access for Texture Manager in Settings, then pick the plist again so the PNG can be copied from device storage."
                            .to_string(),
                    );
                }
            }
        }
    }

    let mut stem_png_tried: Vec<String> = Vec::new();
    if let Some(name) = plist_path
        .with_extension("png")
        .file_name()
        .and_then(|value| value.to_str())
    {
        stem_png_tried.push(name.to_string());
    }
    for stem in plist_stem_candidates(plist_path) {
        stem_png_tried.push(format!("{stem}.png"));
    }
    stem_png_tried.sort();
    stem_png_tried.dedup();
    lines.push(format!(
        "PNG names tried first (plist stem + .png): {}",
        stem_png_tried.join(", ")
    ));

    let root_dict = plist_root
        .cloned()
        .or_else(|| load_plist_root(plist_path));
    if let Some(dict) = root_dict.as_ref() {
        let metadata_names = texture_names_from_plist_root(dict);
        if metadata_names.is_empty() {
            lines.push("Plist metadata: no textureFileName / realTextureFileName.".to_string());
        } else {
            lines.push(format!(
                "Plist metadata texture names also tried: {}",
                metadata_names.join(", ")
            ));
        }
    } else {
        lines.push("Plist metadata: could not parse plist XML.".to_string());
    }

    lines.join("\n")
}

fn is_image_filename(name: &str) -> bool {
    let Some((_stem, ext)) = name.rsplit_once('.') else {
        return false;
    };
    IMAGE_EXTENSIONS
        .iter()
        .any(|candidate| ext.eq_ignore_ascii_case(candidate))
}

/// `{plist_stem}.png` beside the plist (case-insensitive), including Android import stems.
fn resolve_stem_png_beside_plist(plist_path: &Path) -> Option<PathBuf> {
    let parent = plist_path.parent()?;
    let stem_png = plist_path.with_extension("png");
    if is_nonempty_file(&stem_png) {
        return Some(stem_png);
    }
    if let Some(name) = stem_png.file_name().and_then(|value| value.to_str()) {
        if let Some(found) = find_file_in_dir_case_insensitive(parent, name) {
            return Some(found);
        }
    }
    for stem in plist_stem_candidates(plist_path) {
        let name = format!("{stem}.png");
        if let Some(found) = find_file_in_dir_case_insensitive(parent, &name) {
            return Some(found);
        }
        let candidate = parent.join(&name);
        if is_nonempty_file(&candidate) {
            return Some(candidate);
        }
    }
    None
}

/// Geode layout: `{plist_parent}/icons/{stem}.png`.
fn resolve_geode_icons_png_beside_plist(plist_path: &Path) -> Option<PathBuf> {
    let parent = plist_path.parent()?;
    for stem in plist_stem_candidates(plist_path) {
        let relative = format!("icons/{stem}.png");
        if let Ok(scoped) = join_under_parent(parent, &relative) {
            if is_nonempty_file(&scoped) {
                return Some(scoped);
            }
        }
        let icons_dir = parent.join("icons");
        if let Some(found) = find_file_in_dir_case_insensitive(&icons_dir, &format!("{stem}.png")) {
            return Some(found);
        }
    }
    None
}

/// Plist file stems to try when resolving sibling images (`stem.png`, metadata names, etc.).
fn plist_stem_candidates(plist_path: &Path) -> Vec<String> {
    let stem = plist_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let mut stems = vec![stem.clone()];
    // Legacy Android flat import: `imports/1712345678901-player_01-hd.plist`
    if let Some((prefix, rest)) = stem.split_once('-') {
        if !rest.is_empty() && prefix.chars().all(|c| c.is_ascii_digit()) {
            push_candidate_as_stem(&mut stems, rest);
        }
    }
    stems
}

fn push_candidate_as_stem(stems: &mut Vec<String>, stem: &str) {
    if stem.is_empty() {
        return;
    }
    if stems.iter().any(|existing| existing == stem) {
        return;
    }
    stems.push(stem.to_string());
}

fn find_image_by_stem_scan(parent: &Path, stems: &[String]) -> Option<PathBuf> {
    if stems.is_empty() {
        return None;
    }
    let entries: Vec<_> = fs::read_dir(parent)
        .ok()?
        .flatten()
        .filter(|entry| is_nonempty_file(&entry.path()))
        .collect();
    for stem in stems {
        for entry in &entries {
            let path = entry.path();
            let name = entry.file_name();
            let name = name.to_string_lossy();
            let (file_stem, ext) = name.rsplit_once('.')?;
            if !IMAGE_EXTENSIONS
                .iter()
                .any(|candidate| ext.eq_ignore_ascii_case(candidate))
            {
                continue;
            }
            if file_stem.eq_ignore_ascii_case(stem) {
                return Some(path);
            }
        }
    }
    None
}

fn is_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            IMAGE_EXTENSIONS
                .iter()
                .any(|candidate| ext.eq_ignore_ascii_case(candidate))
        })
}

/// When a plist folder contains exactly one image sibling, treat it as the atlas.
fn find_single_image_fallback(parent: &Path, plist_path: &Path) -> Option<PathBuf> {
    let images: Vec<PathBuf> = fs::read_dir(parent)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| is_nonempty_file(path) && path != plist_path && is_image_path(path))
        .collect();
    if images.len() == 1 {
        Some(images[0].clone())
    } else {
        None
    }
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
    fn resolve_stem_png_is_first_before_metadata_texture_name() {
        let dir = std::env::temp_dir().join(format!(
            "tm-plist-assets-stem-png-first-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        let plist_path = dir.join("icons-hd.plist");
        fs::write(
            &plist_path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>metadata</key>
  <dict>
    <key>realTextureFileName</key>
    <string>other-atlas.png</string>
  </dict>
</dict></plist>"#,
        )
        .expect("plist");
        fs::write(dir.join("icons-hd.png"), b"stem-png").expect("stem png");

        let resolved = resolve_stem_png_beside_plist(&plist_path).expect("resolved");
        assert_eq!(resolved, dir.join("icons-hd.png"));
        let _ = fs::remove_dir_all(&dir);
    }

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

    #[test]
    fn resolve_stem_strips_android_flat_import_timestamp_prefix() {
        let dir = std::env::temp_dir().join(format!(
            "tm-plist-assets-android-flat-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        let plist_path = dir.join("1712345678901-player_01-hd.plist");
        fs::write(&plist_path, "<?xml version=\"1.0\"?><plist/>").expect("plist");
        fs::write(dir.join("player_01-hd.png"), b"icon-png").expect("png");

        let resolved = resolve_image_beside_plist(&plist_path, None).expect("resolved");
        assert_eq!(resolved, dir.join("player_01-hd.png"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_single_image_fallback_when_only_one_sibling_image() {
        let dir = std::env::temp_dir().join(format!(
            "tm-plist-assets-single-image-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        let plist_path = dir.join("icons-hd.plist");
        fs::write(
            &plist_path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>metadata</key>
  <dict>
    <key>realTextureFileName</key>
    <string>atlas-custom.png</string>
  </dict>
</dict></plist>"#,
        )
        .expect("plist");
        fs::write(dir.join("GSheet-hd.png"), b"only-image").expect("png");

        let resolved = resolve_image_beside_plist(&plist_path, None).expect("resolved");
        assert_eq!(resolved, dir.join("GSheet-hd.png"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn diagnose_lists_folder_files_and_stem_png_tried() {
        let dir = std::env::temp_dir().join(format!(
            "tm-plist-assets-diagnose-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");
        let plist_path = dir.join("icons-hd.plist");
        fs::write(&plist_path, "<?xml version=\"1.0\"?><plist/>").expect("plist");
        fs::write(dir.join("readme.txt"), b"notes").expect("txt");

        let report = diagnose_missing_atlas_image(&plist_path, None);
        assert!(report.contains("icons-hd.plist"));
        assert!(report.contains("icons-hd.png"));
        assert!(report.contains("readme.txt"));
        assert!(report.contains("No image files"));
        let _ = fs::remove_dir_all(&dir);
    }
}
