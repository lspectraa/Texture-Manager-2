use std::collections::BTreeMap;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use image::{DynamicImage, ImageFormat, RgbaImage};
use plist::{Dictionary, Value};
use serde::{Deserialize, Serialize};

use crate::core::contracts::MergerOptions;
use crate::core::errors::AppError;
use crate::core::image_io::save_dynamic_png_fast;
use crate::core::merger::merge_plist_from_memory;
use crate::core::safe_fs::{
    ensure_existing_user_file, ensure_readable_image_file, ensure_user_absolute_path,
    is_safe_path_segment, join_under_parent, png_file_to_data_url, save_png_data_url,
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconEditorSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconEditorPoint {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconEditorRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconEditorFrameInfo {
    pub name: String,
    pub texture_rect: IconEditorRect,
    pub sprite_size: IconEditorSize,
    pub sprite_source_size: IconEditorSize,
    pub sprite_offset: IconEditorPoint,
    pub texture_rotated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconEditorSheetInfo {
    pub plist_path: String,
    pub atlas_path: String,
    pub atlas_size: IconEditorSize,
    pub frames: Vec<IconEditorFrameInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconEditorFrameUpdate {
    pub name: String,
    pub sprite_offset: IconEditorPoint,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconEditorFrameTextureUpdate {
    pub name: String,
    pub png_data_url: String,
    pub sprite_size: IconEditorSize,
    pub sprite_source_size: IconEditorSize,
    pub sprite_offset: IconEditorPoint,
    pub texture_rotated: bool,
    #[serde(default)]
    pub is_new_frame: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconEditorRenameResult {
    pub plist_path: String,
    pub atlas_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconEditorExtractedFrame {
    pub name: String,
    pub png_data_url: String,
}

pub fn icon_editor_sheet_info(plist_path: &Path) -> Result<IconEditorSheetInfo, AppError> {
    ensure_existing_user_file(plist_path)?;
    let plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames_dict = frames_dictionary(root_dict)?;
    if frames_dict.is_empty() {
        return Err(AppError::InvalidOperation(
            "icon editor supports only gamesheet plists with frame entries",
        ));
    }
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;
    let atlas_image = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?;
    let atlas_size = IconEditorSize {
        width: atlas_image.width(),
        height: atlas_image.height(),
    };

    let mut frames: Vec<IconEditorFrameInfo> = Vec::with_capacity(frames_dict.len());
    for (name, value) in frames_dict {
        let frame_dict = value
            .as_dictionary()
            .ok_or_else(|| AppError::ParseError(format!("frame `{name}` is not a dictionary")))?;
        let texture_rect_raw = parse_texture_rect(get_required_string(frame_dict, "textureRect")?)?;
        let sprite_size = parse_pair_u32(get_required_string(frame_dict, "spriteSize")?)?;
        let sprite_source_size = parse_pair_u32(
            get_optional_string(frame_dict, "spriteSourceSize")
                .unwrap_or(get_required_string(frame_dict, "spriteSize")?),
        )?;
        let sprite_offset =
            parse_pair_f32(get_optional_string(frame_dict, "spriteOffset").unwrap_or("{0,0}"))?;
        let texture_rotated = frame_dict
            .get("textureRotated")
            .and_then(Value::as_boolean)
            .unwrap_or(false);
        let texture_rect =
            atlas_crop_rect_for_frame(&texture_rect_raw, sprite_size, texture_rotated);

        frames.push(IconEditorFrameInfo {
            name: name.clone(),
            texture_rect,
            sprite_size,
            sprite_source_size,
            sprite_offset,
            texture_rotated,
        });
    }
    frames.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(IconEditorSheetInfo {
        plist_path: plist_path.to_string_lossy().to_string(),
        atlas_path: atlas_path.to_string_lossy().to_string(),
        atlas_size,
        frames,
    })
}

/// Only plist keys that look like the gamesheet "extra" slot are eligible for removal via save.
fn is_removable_extra_frame_key(name: &str) -> bool {
    let base = name.trim();
    let stem = base.strip_suffix(".png").unwrap_or(base);
    stem.to_ascii_lowercase().ends_with("_extra_001")
}

pub fn icon_editor_save_plist(
    plist_path: &Path,
    updates: &[IconEditorFrameUpdate],
    removed_frame_names: &[String],
    frame_texture_updates: &[IconEditorFrameTextureUpdate],
) -> Result<(), AppError> {
    ensure_existing_user_file(plist_path)?;
    let mut plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;

    if !removed_frame_names.is_empty() {
        let root_dict_mut = plist_root
            .as_dictionary_mut()
            .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
        let frames_mut = frames_dictionary_mut(root_dict_mut)?;
        for raw in removed_frame_names {
            let name = raw.trim();
            if name.is_empty() || !is_removable_extra_frame_key(name) {
                continue;
            }
            frames_mut.remove(name);
        }
    }

    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;
    let atlas_rgba = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();

    let frames = frames_dictionary(root_dict)?;
    let mut frame_names: Vec<String> = frames.keys().cloned().collect();
    frame_names.sort();

    let mut sprites: BTreeMap<String, RgbaImage> = BTreeMap::new();
    let mut trim_by_name: BTreeMap<String, TrimInsets> = BTreeMap::new();
    let mut corrected_texture_rects: BTreeMap<String, IconEditorRect> = BTreeMap::new();
    for frame_name in frame_names {
        let frame_dict = frames
            .get(&frame_name)
            .and_then(Value::as_dictionary)
            .ok_or_else(|| {
                AppError::ParseError(format!("frame `{frame_name}` is not a dictionary"))
            })?;
        let texture_rect = parse_texture_rect(get_required_string(frame_dict, "textureRect")?)?;
        let sprite_size = parse_pair_u32(get_required_string(frame_dict, "spriteSize")?)?;
        let texture_rotated = frame_dict
            .get("textureRotated")
            .and_then(Value::as_boolean)
            .unwrap_or(false);
        let atlas_crop =
            atlas_crop_rect_for_frame(&texture_rect, sprite_size, texture_rotated);
        let final_sprite =
            extract_frame_sprite_from_atlas(&atlas_rgba, &texture_rect, sprite_size, texture_rotated)?;

        if texture_rect.width != atlas_crop.width || texture_rect.height != atlas_crop.height {
            corrected_texture_rects.insert(frame_name.clone(), atlas_crop);
        }
        trim_by_name.insert(frame_name.clone(), trim_transparent_insets(&final_sprite));
        sprites.insert(frame_name, final_sprite);
    }

    let root_dict_mut = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames_mut = frames_dictionary_mut(root_dict_mut)?;

    for (frame_name, corrected) in corrected_texture_rects {
        if let Some(frame_dict) = frames_mut
            .get_mut(&frame_name)
            .and_then(Value::as_dictionary_mut)
        {
            frame_dict.insert(
                "textureRect".to_string(),
                Value::String(format_texture_rect(&corrected)),
            );
        }
    }

    if !frame_texture_updates.is_empty() {
        apply_frame_texture_updates(frames_mut, &mut sprites, &mut trim_by_name, frame_texture_updates)?;
    }

    for update in updates {
        let Some(frame_dict) = frames_mut
            .get_mut(&update.name)
            .and_then(Value::as_dictionary_mut)
        else {
            continue;
        };
        let trim = trim_by_name
            .get(&update.name)
            .cloned()
            .unwrap_or(TrimInsets {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            });
        // UI edits are post-merge offsets (plist + trim adjustment). Convert back so merge
        // reapplies trim adjustment and lands on the edited value.
        let pre_merge_offset = IconEditorPoint {
            x: update.sprite_offset.x - (trim.left as f32 / 2.0) + (trim.right as f32 / 2.0),
            y: update.sprite_offset.y + (trim.top as f32 / 2.0) - (trim.bottom as f32 / 2.0),
        };
        frame_dict.insert(
            "spriteOffset".to_string(),
            Value::String(format_pair_f32(&pre_merge_offset)),
        );
    }

    if frame_texture_updates.is_empty() {
        let merger_options = MergerOptions {
            include_outside_plist_files: false,
            dimensions: None,
            sheet_concurrency: 1,
        };
        let sheet_label = plist_path.to_string_lossy().to_string();
        let mut on_sprite_loaded = |_label: String| {};
        let (merged_atlas, _w, _h, _count, _issues) = merge_plist_from_memory(
            &mut plist_root,
            &sprites,
            sheet_label.as_str(),
            &merger_options,
            &mut on_sprite_loaded,
        )?;
        save_dynamic_png_fast(&atlas_path, &DynamicImage::ImageRgba8(merged_atlas))?;
    } else {
        let texture_rotated_snapshot = {
            let root_dict = plist_root
                .as_dictionary()
                .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
            let frames = frames_dictionary(root_dict)?;
            snapshot_texture_rotated_flags(frames)
        };
        finalize_merged_atlas_preserving_texture_rotated(
            plist_path,
            &mut plist_root,
            &sprites,
            &texture_rotated_snapshot,
        )?;
    }

    write_plist_atomically(plist_path, &plist_root)
}

pub fn icon_editor_import_frame(
    plist_path: &Path,
    frame_name: &str,
    texture_path: &Path,
) -> Result<(), AppError> {
    ensure_existing_user_file(plist_path)?;
    ensure_readable_image_file(texture_path)?;
    let mut plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames = frames_dictionary(root_dict)?;
    let actual_frame_key = find_frame_key(frames, frame_name).ok_or_else(|| {
        AppError::ParseError(format!("frame `{frame_name}` not found in plist"))
    })?;
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;

    let imported = image::open(texture_path)
        .map_err(|err| AppError::ParseError(format!("failed to open imported png: {err}")))?
        .to_rgba8();
    let atlas_rgba = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();
    let mut sprites = collect_sheet_sprites_for_remerge(&plist_root, &atlas_rgba)?;
    sprites.insert(actual_frame_key, imported);

    remerge_and_write_sheet(plist_path, &mut plist_root, &sprites)
}

#[derive(Debug, Clone, Copy)]
pub enum IconEditorRotateDirection {
    Clockwise,
    CounterClockwise,
}

fn parse_rotate_direction(value: &str) -> Result<IconEditorRotateDirection, AppError> {
    match value.trim().to_ascii_lowercase().as_str() {
        "clockwise" | "cw" => Ok(IconEditorRotateDirection::Clockwise),
        "counterclockwise" | "counter-clockwise" | "counter_clockwise" | "ccw" => {
            Ok(IconEditorRotateDirection::CounterClockwise)
        }
        _ => Err(AppError::ParseError(format!(
            "unsupported rotate direction `{value}`"
        ))),
    }
}

/// Rotates a frame 90° and remerges the atlas. Updates sprite size/offset metadata while
/// preserving each frame's existing `textureRotated` flag.
pub fn icon_editor_rotate_frame(
    plist_path: &Path,
    frame_name: &str,
    direction: &str,
) -> Result<(), AppError> {
    ensure_existing_user_file(plist_path)?;
    let direction = parse_rotate_direction(direction)?;
    let mut plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames = frames_dictionary(root_dict)?;
    let actual_frame_key = find_frame_key(frames, frame_name).ok_or_else(|| {
        AppError::ParseError(format!("frame `{frame_name}` not found in plist"))
    })?;
    let texture_rotated_snapshot = snapshot_texture_rotated_flags(frames);

    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;
    let atlas_rgba = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();
    let mut sprites = collect_sheet_sprites_for_remerge(&plist_root, &atlas_rgba)?;

    let Some(sprite) = sprites.get(&actual_frame_key).cloned() else {
        return Err(AppError::ParseError(format!(
            "sprite `{actual_frame_key}` missing from atlas"
        )));
    };
    sprites.insert(
        actual_frame_key.clone(),
        rotate_sprite_image(sprite, direction),
    );

    {
        let root_dict_mut = plist_root
            .as_dictionary_mut()
            .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
        let frames_mut = frames_dictionary_mut(root_dict_mut)?;
        let frame_dict = frames_mut
            .get_mut(&actual_frame_key)
            .and_then(Value::as_dictionary_mut)
            .ok_or_else(|| {
                AppError::ParseError(format!("frame `{actual_frame_key}` is not a dictionary"))
            })?;
        apply_rotation_metadata_to_frame(frame_dict, direction)?;
    }

    merge_sheet_to_atlas(plist_path, &mut plist_root, &sprites)?;

    {
        let root_dict_mut = plist_root
            .as_dictionary_mut()
            .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
        let frames_mut = frames_dictionary_mut(root_dict_mut)?;
        restore_texture_rotated_flags(frames_mut, &texture_rotated_snapshot);
    }

    let mut merged_atlas = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames = frames_dictionary(root_dict)?;
    for (frame_key, texture_rotated) in &texture_rotated_snapshot {
        if !texture_rotated {
            continue;
        }
        let Some(frame_dict) = frames.get(frame_key).and_then(Value::as_dictionary) else {
            continue;
        };
        reencode_texture_rotated_frame_in_atlas(&mut merged_atlas, frame_dict)?;
    }

    save_dynamic_png_fast(&atlas_path, &DynamicImage::ImageRgba8(merged_atlas))?;
    write_plist_atomically(plist_path, &plist_root)
}

pub fn icon_editor_add_frame(
    plist_path: &Path,
    frame_name: &str,
    texture_path: &Path,
) -> Result<(), AppError> {
    if frame_name.trim().is_empty() {
        return Err(AppError::InvalidOperation("new frame name cannot be empty"));
    }
    ensure_existing_user_file(plist_path)?;
    ensure_readable_image_file(texture_path)?;

    let mut plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;
    {
        let frames = frames_dictionary(root_dict)?;
        if find_frame_key(frames, frame_name).is_some() {
            return Err(AppError::InvalidOperation(
                "frame already exists in gamesheet plist",
            ));
        }
    }

    let sprite = image::open(texture_path)
        .map_err(|err| AppError::ParseError(format!("failed to open imported png: {err}")))?
        .to_rgba8();
    let sprite_width = sprite.width().max(1);
    let sprite_height = sprite.height().max(1);
    let atlas_rgba = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();
    let mut sprites = collect_sheet_sprites_for_remerge(&plist_root, &atlas_rgba)?;

    let plist_key = ensure_png_frame_key(frame_name);
    let mut frame_dict = Dictionary::new();
    frame_dict.insert("aliases".to_string(), Value::Array(Vec::new()));
    frame_dict.insert(
        "spriteOffset".to_string(),
        Value::String("{0.000,0.000}".to_string()),
    );
    let size_text = format!("{{{},{} }}", sprite_width, sprite_height).replace(" ", "");
    frame_dict.insert("spriteSize".to_string(), Value::String(size_text.clone()));
    frame_dict.insert("spriteSourceSize".to_string(), Value::String(size_text));
    frame_dict.insert("textureRotated".to_string(), Value::Boolean(false));
    frame_dict.insert(
        "textureRect".to_string(),
        Value::String(format_texture_rect(&IconEditorRect {
            x: 0,
            y: 0,
            width: sprite_width,
            height: sprite_height,
        })),
    );
    {
        let root_dict_mut = plist_root
            .as_dictionary_mut()
            .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
        let frames = frames_dictionary_mut(root_dict_mut)?;
        frames.insert(plist_key.clone(), Value::Dictionary(frame_dict));
    }
    sprites.insert(plist_key, sprite);

    remerge_and_write_sheet(plist_path, &mut plist_root, &sprites)
}

pub fn icon_editor_extract_frames(
    plist_path: &Path,
) -> Result<Vec<IconEditorExtractedFrame>, AppError> {
    ensure_existing_user_file(plist_path)?;
    let plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames_dict = frames_dictionary(root_dict)?;
    if frames_dict.is_empty() {
        return Err(AppError::InvalidOperation(
            "icon editor supports only gamesheet plists with frame entries",
        ));
    }
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;
    let atlas_image = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?;
    let atlas_rgba = atlas_image.to_rgba8();

    let mut names: Vec<String> = frames_dict.keys().cloned().collect();
    names.sort();

    let mut extracted: Vec<IconEditorExtractedFrame> = Vec::with_capacity(names.len());
    for frame_name in names {
        let frame_dict = frames_dict
            .get(&frame_name)
            .and_then(Value::as_dictionary)
            .ok_or_else(|| {
                AppError::ParseError(format!("frame `{frame_name}` is not a dictionary"))
            })?;
        let texture_rect = parse_texture_rect(get_required_string(frame_dict, "textureRect")?)?;
        let sprite_size = parse_pair_u32(get_required_string(frame_dict, "spriteSize")?)?;
        let texture_rotated = frame_dict
            .get("textureRotated")
            .and_then(Value::as_boolean)
            .unwrap_or(false);
        let final_sprite =
            extract_frame_sprite_from_atlas(&atlas_rgba, &texture_rect, sprite_size, texture_rotated)?;

        let mut cursor = Cursor::new(Vec::<u8>::new());
        DynamicImage::ImageRgba8(final_sprite)
            .write_to(&mut cursor, ImageFormat::Png)
            .map_err(|err| AppError::IoError(err.to_string()))?;
        let encoded = BASE64_STANDARD.encode(cursor.into_inner());
        extracted.push(IconEditorExtractedFrame {
            name: frame_name,
            png_data_url: format!("data:image/png;base64,{encoded}"),
        });
    }

    Ok(extracted)
}

/// PNG data URL for webview previews of user-picked files outside the asset protocol scope.
pub fn icon_editor_png_data_url(texture_path: &Path) -> Result<String, AppError> {
    ensure_readable_image_file(texture_path)?;
    png_file_to_data_url(texture_path)
}

/// Persist a PNG data URL to disk with path / size / magic validation.
pub fn icon_editor_save_png_data_url(
    output_path: &Path,
    png_data_url: &str,
) -> Result<(), AppError> {
    ensure_user_absolute_path(output_path)?;
    save_png_data_url(output_path, png_data_url)
}

fn validate_sheet_stem(new_stem: &str) -> Result<(), AppError> {
    let trimmed = new_stem.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidOperation("new sheet name cannot be empty"));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err(AppError::InvalidOperation(
            "new sheet name cannot contain separators",
        ));
    }
    if !is_safe_path_segment(trimmed) {
        return Err(AppError::InvalidOperation(
            "new sheet name is not a valid single path segment",
        ));
    }
    // Reject Windows device / reserved names (CON, PRN, AUX, NUL, COM1, LPT1, …).
    let stem_for_reserved = trimmed
        .split_once('.')
        .map(|(before, _)| before)
        .unwrap_or(trimmed);
    let upper = stem_for_reserved.to_ascii_uppercase();
    let reserved = matches!(
        upper.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    );
    if reserved {
        return Err(AppError::InvalidOperation(
            "new sheet name cannot use a reserved system name",
        ));
    }
    Ok(())
}

fn sheet_stem_from_plist_path(plist_path: &Path) -> Result<String, AppError> {
    plist_path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .ok_or(AppError::InvalidPath("plist file name is invalid"))
}

fn resolve_sheet_paths_for_stem(
    plist_path: &Path,
    stem: &str,
) -> Result<(PathBuf, PathBuf), AppError> {
    let plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;
    let parent_dir = plist_path
        .parent()
        .ok_or(AppError::InvalidPath("plist path has no parent directory"))?;
    let target_plist_path = parent_dir.join(format!("{stem}.plist"));
    let target_atlas_path = atlas_path.with_file_name(format!("{stem}.png"));
    Ok((target_plist_path, target_atlas_path))
}

fn move_sheet_files_to_stem(
    plist_path: &Path,
    new_stem: &str,
) -> Result<(PathBuf, PathBuf), AppError> {
    ensure_existing_user_file(plist_path)?;
    if !plist_path.exists() {
        return Err(AppError::InvalidPath("plist file does not exist"));
    }

    let (new_plist_path, new_atlas_path) = resolve_sheet_paths_for_stem(plist_path, new_stem)?;
    let plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;

    if plist_path != new_plist_path.as_path() {
        if new_plist_path.exists() {
            return Err(AppError::InvalidOperation(
                "target plist name already exists in destination directory",
            ));
        }
        fs::rename(plist_path, &new_plist_path)?;
    }
    if atlas_path != new_atlas_path && atlas_path.exists() {
        if new_atlas_path.exists() {
            return Err(AppError::InvalidOperation(
                "target png name already exists in destination directory",
            ));
        }
        fs::rename(&atlas_path, &new_atlas_path)?;
    }

    Ok((new_plist_path, new_atlas_path))
}

fn finalize_sheet_stem_in_plist(
    plist_path: &Path,
    old_stem: &str,
    new_stem: &str,
) -> Result<(), AppError> {
    if old_stem == new_stem {
        return Ok(());
    }

    let mut plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let atlas_path = {
        let root_dict = plist_root
            .as_dictionary()
            .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
        resolve_atlas_path(plist_path, root_dict)?
    };

    let old_sprite_stem = strip_graphics_tier_suffix(old_stem);
    let new_sprite_stem = strip_graphics_tier_suffix(new_stem);
    rename_plist_sheet_identifiers(
        &mut plist_root,
        old_stem,
        new_stem,
        old_sprite_stem.as_str(),
        new_sprite_stem.as_str(),
    )?;

    let root_dict = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    if !root_dict.contains_key("metadata") {
        root_dict.insert("metadata".to_string(), Value::Dictionary(Dictionary::new()));
    }
    if let Some(metadata) = root_dict
        .get_mut("metadata")
        .and_then(Value::as_dictionary_mut)
    {
        let renamed_file_name = atlas_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("icons.png")
            .to_string();
        let renamed_metadata_file_name = format!("icons/{renamed_file_name}");
        metadata.insert(
            "textureFileName".to_string(),
            Value::String(renamed_metadata_file_name.clone()),
        );
        metadata.insert(
            "realTextureFileName".to_string(),
            Value::String(renamed_metadata_file_name),
        );
    }

    let atlas_rgba = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();
    let sprites = collect_sheet_sprites_for_remerge(&plist_root, &atlas_rgba)?;
    let merger_options = MergerOptions {
        include_outside_plist_files: false,
        dimensions: None,
        sheet_concurrency: 1,
    };
    let sheet_label = plist_path.to_string_lossy().to_string();
    let mut on_sprite_loaded = |_label: String| {};
    let (merged_atlas, _w, _h, _count, _issues) = merge_plist_from_memory(
        &mut plist_root,
        &sprites,
        sheet_label.as_str(),
        &merger_options,
        &mut on_sprite_loaded,
    )?;
    save_dynamic_png_fast(&atlas_path, &DynamicImage::ImageRgba8(merged_atlas))?;
    write_plist_atomically(plist_path, &plist_root)
}

pub fn icon_editor_rename_sheet(
    plist_path: &Path,
    new_stem: &str,
) -> Result<IconEditorRenameResult, AppError> {
    ensure_existing_user_file(plist_path)?;
    validate_sheet_stem(new_stem)?;
    let old_stem = sheet_stem_from_plist_path(plist_path)?;

    let (renamed_plist_path, renamed_atlas_path) =
        move_sheet_files_to_stem(plist_path, new_stem)?;
    finalize_sheet_stem_in_plist(&renamed_plist_path, &old_stem, new_stem)?;

    Ok(IconEditorRenameResult {
        plist_path: renamed_plist_path.to_string_lossy().to_string(),
        atlas_path: renamed_atlas_path.to_string_lossy().to_string(),
    })
}

pub fn icon_editor_swap_rename_sheet(
    plist_path: &Path,
    new_stem: &str,
) -> Result<IconEditorRenameResult, AppError> {
    ensure_existing_user_file(plist_path)?;
    validate_sheet_stem(new_stem)?;
    let old_stem = sheet_stem_from_plist_path(plist_path)?;
    if old_stem == new_stem {
        return Err(AppError::InvalidOperation(
            "new sheet name must differ from current name",
        ));
    }

    let parent_dir = plist_path
        .parent()
        .ok_or(AppError::InvalidPath("plist path has no parent directory"))?;
    let other_plist_path = parent_dir.join(format!("{new_stem}.plist"));
    if !other_plist_path.exists() {
        return Err(AppError::InvalidOperation(
            "target sheet does not exist for name swap",
        ));
    }

    let temp_stem = format!(
        "__tm_swap_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0)
    );

    let (temp_plist_path, _) = move_sheet_files_to_stem(plist_path, &temp_stem)?;
    move_sheet_files_to_stem(&other_plist_path, &old_stem)?;
    let (final_plist_path, final_atlas_path) =
        move_sheet_files_to_stem(&temp_plist_path, new_stem)?;

    finalize_sheet_stem_in_plist(&final_plist_path, &old_stem, new_stem)?;
    let swapped_away_plist_path = parent_dir.join(format!("{old_stem}.plist"));
    finalize_sheet_stem_in_plist(&swapped_away_plist_path, new_stem, &old_stem)?;

    Ok(IconEditorRenameResult {
        plist_path: final_plist_path.to_string_lossy().to_string(),
        atlas_path: final_atlas_path.to_string_lossy().to_string(),
    })
}

pub fn icon_editor_copy_sheet(
    plist_path: &Path,
    new_stem: &str,
    updates: &[IconEditorFrameUpdate],
    removed_frame_names: &[String],
    frame_texture_updates: &[IconEditorFrameTextureUpdate],
) -> Result<IconEditorRenameResult, AppError> {
    ensure_existing_user_file(plist_path)?;
    if new_stem.trim().is_empty() {
        return Err(AppError::InvalidOperation("new sheet name cannot be empty"));
    }
    if new_stem.contains('/') || new_stem.contains('\\') {
        return Err(AppError::InvalidOperation(
            "new sheet name cannot contain separators",
        ));
    }

    let old_stem = plist_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or(AppError::InvalidPath("plist file name is invalid"))?
        .to_string();
    if old_stem == new_stem {
        return Err(AppError::InvalidOperation(
            "copy name must differ from the current sheet name",
        ));
    }

    let mut plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;

    if !removed_frame_names.is_empty() {
        let root_dict_mut = plist_root
            .as_dictionary_mut()
            .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
        let frames_mut = frames_dictionary_mut(root_dict_mut)?;
        for raw in removed_frame_names {
            let name = raw.trim();
            if name.is_empty() || !is_removable_extra_frame_key(name) {
                continue;
            }
            frames_mut.remove(name);
        }
    }

    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;
    let atlas_rgba = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();

    let frames = frames_dictionary(root_dict)?;
    let mut frame_names: Vec<String> = frames.keys().cloned().collect();
    frame_names.sort();

    let mut sprites: BTreeMap<String, RgbaImage> = BTreeMap::new();
    let mut trim_by_name: BTreeMap<String, TrimInsets> = BTreeMap::new();
    let mut corrected_texture_rects: BTreeMap<String, IconEditorRect> = BTreeMap::new();
    for frame_name in frame_names {
        let frame_dict = frames
            .get(&frame_name)
            .and_then(Value::as_dictionary)
            .ok_or_else(|| {
                AppError::ParseError(format!("frame `{frame_name}` is not a dictionary"))
            })?;
        let texture_rect = parse_texture_rect(get_required_string(frame_dict, "textureRect")?)?;
        let sprite_size = parse_pair_u32(get_required_string(frame_dict, "spriteSize")?)?;
        let texture_rotated = frame_dict
            .get("textureRotated")
            .and_then(Value::as_boolean)
            .unwrap_or(false);
        let atlas_crop =
            atlas_crop_rect_for_frame(&texture_rect, sprite_size, texture_rotated);
        let final_sprite =
            extract_frame_sprite_from_atlas(&atlas_rgba, &texture_rect, sprite_size, texture_rotated)?;

        if texture_rect.width != atlas_crop.width || texture_rect.height != atlas_crop.height {
            corrected_texture_rects.insert(frame_name.clone(), atlas_crop);
        }
        trim_by_name.insert(frame_name.clone(), trim_transparent_insets(&final_sprite));
        sprites.insert(frame_name, final_sprite);
    }

    let root_dict_mut = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames_mut = frames_dictionary_mut(root_dict_mut)?;

    for (frame_name, corrected) in corrected_texture_rects {
        if let Some(frame_dict) = frames_mut
            .get_mut(&frame_name)
            .and_then(Value::as_dictionary_mut)
        {
            frame_dict.insert(
                "textureRect".to_string(),
                Value::String(format_texture_rect(&corrected)),
            );
        }
    }

    if !frame_texture_updates.is_empty() {
        apply_frame_texture_updates(frames_mut, &mut sprites, &mut trim_by_name, frame_texture_updates)?;
    }

    for update in updates {
        let Some(frame_dict) = frames_mut
            .get_mut(&update.name)
            .and_then(Value::as_dictionary_mut)
        else {
            continue;
        };
        let trim = trim_by_name
            .get(&update.name)
            .cloned()
            .unwrap_or(TrimInsets {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            });
        let pre_merge_offset = IconEditorPoint {
            x: update.sprite_offset.x - (trim.left as f32 / 2.0) + (trim.right as f32 / 2.0),
            y: update.sprite_offset.y + (trim.top as f32 / 2.0) - (trim.bottom as f32 / 2.0),
        };
        frame_dict.insert(
            "spriteOffset".to_string(),
            Value::String(format_pair_f32(&pre_merge_offset)),
        );
    }

    let old_sprite_stem = strip_graphics_tier_suffix(&old_stem);
    let new_sprite_stem = strip_graphics_tier_suffix(new_stem);
    rename_plist_sheet_identifiers(
        &mut plist_root,
        &old_stem,
        new_stem,
        old_sprite_stem.as_str(),
        new_sprite_stem.as_str(),
    )?;

    let parent_dir = plist_path
        .parent()
        .ok_or(AppError::InvalidPath("plist path has no parent directory"))?;
    let copied_plist_path = parent_dir.join(format!("{new_stem}.plist"));
    let copied_atlas_path = atlas_path.with_file_name(format!("{new_stem}.png"));

    if copied_plist_path.exists() {
        return Err(AppError::InvalidOperation(
            "target plist name already exists in destination directory",
        ));
    }
    if copied_atlas_path.exists() {
        return Err(AppError::InvalidOperation(
            "target png name already exists in destination directory",
        ));
    }

    let root_dict_mut = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    if !root_dict_mut.contains_key("metadata") {
        root_dict_mut.insert("metadata".to_string(), Value::Dictionary(Dictionary::new()));
    }
    if let Some(metadata) = root_dict_mut
        .get_mut("metadata")
        .and_then(Value::as_dictionary_mut)
    {
        let copied_file_name = copied_atlas_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("icons.png")
            .to_string();
        let copied_metadata_file_name = format!("icons/{copied_file_name}");
        metadata.insert(
            "textureFileName".to_string(),
            Value::String(copied_metadata_file_name.clone()),
        );
        metadata.insert(
            "realTextureFileName".to_string(),
            Value::String(copied_metadata_file_name),
        );
    }

    let remerge_sprites = if frame_texture_updates.is_empty() {
        collect_sheet_sprites_for_remerge(&plist_root, &atlas_rgba)?
    } else {
        sprites
    };
    if !frame_texture_updates.is_empty() {
        let texture_rotated_snapshot = {
            let root_dict = plist_root
                .as_dictionary()
                .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
            let frames = frames_dictionary(root_dict)?;
            snapshot_texture_rotated_flags(frames)
        };
        finalize_merged_atlas_preserving_texture_rotated(
            &copied_plist_path,
            &mut plist_root,
            &remerge_sprites,
            &texture_rotated_snapshot,
        )?;
    } else {
        let merger_options = MergerOptions {
            include_outside_plist_files: false,
            dimensions: None,
            sheet_concurrency: 1,
        };
        let sheet_label = copied_plist_path.to_string_lossy().to_string();
        let mut on_sprite_loaded = |_label: String| {};
        let (merged_atlas, _w, _h, _count, _issues) = merge_plist_from_memory(
            &mut plist_root,
            &remerge_sprites,
            sheet_label.as_str(),
            &merger_options,
            &mut on_sprite_loaded,
        )?;
        save_dynamic_png_fast(&copied_atlas_path, &DynamicImage::ImageRgba8(merged_atlas))?;
    }
    write_plist_atomically(&copied_plist_path, &plist_root)?;

    Ok(IconEditorRenameResult {
        plist_path: copied_plist_path.to_string_lossy().to_string(),
        atlas_path: copied_atlas_path.to_string_lossy().to_string(),
    })
}

fn frame_key_stem(name: &str) -> &str {
    name.trim().strip_suffix(".png").unwrap_or(name.trim())
}

fn ensure_png_frame_key(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.ends_with(".png") {
        trimmed.to_string()
    } else {
        format!("{trimmed}.png")
    }
}

fn find_frame_key(frames: &Dictionary, name: &str) -> Option<String> {
    let stem = frame_key_stem(name);
    frames
        .keys()
        .find(|key| frame_key_stem(key).eq_ignore_ascii_case(stem))
        .cloned()
}

fn frames_dictionary(root_dict: &Dictionary) -> Result<&Dictionary, AppError> {
    root_dict
        .get("frames")
        .and_then(Value::as_dictionary)
        .ok_or_else(|| {
            AppError::ParseError("plist missing top-level `frames` dictionary".to_string())
        })
}

fn frames_dictionary_mut(root_dict: &mut Dictionary) -> Result<&mut Dictionary, AppError> {
    root_dict
        .get_mut("frames")
        .and_then(Value::as_dictionary_mut)
        .ok_or_else(|| {
            AppError::ParseError("plist missing top-level `frames` dictionary".to_string())
        })
}

fn resolve_atlas_path(plist_path: &Path, root_dict: &Dictionary) -> Result<PathBuf, AppError> {
    let plist_parent = plist_path
        .parent()
        .ok_or(AppError::InvalidPath("plist path has no parent directory"))?;

    let metadata = root_dict.get("metadata").and_then(Value::as_dictionary);
    for key in ["realTextureFileName", "textureFileName"] {
        let Some(file_name) = metadata
            .and_then(|dict| dict.get(key))
            .and_then(Value::as_string)
        else {
            continue;
        };
        let Ok(candidate) = join_under_parent(plist_parent, file_name) else {
            continue;
        };
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    let stem = plist_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or(AppError::InvalidPath("plist file name is invalid"))?;
    Ok(plist_parent.join(format!("{stem}.png")))
}

fn write_plist_atomically(path: &Path, value: &Value) -> Result<(), AppError> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(AppError::InvalidPath("invalid plist file name"))?;
    let temp_path = path.with_file_name(format!("{file_name}.tmp"));

    value
        .to_file_xml(&temp_path)
        .map_err(|err| AppError::IoError(err.to_string()))?;
    fs::rename(temp_path, path)?;
    Ok(())
}

fn upsert_metadata_size(
    root_dict: &mut Dictionary,
    width: u32,
    height: u32,
) -> Result<(), AppError> {
    if !root_dict.contains_key("metadata") {
        root_dict.insert("metadata".to_string(), Value::Dictionary(Dictionary::new()));
    }
    let metadata = root_dict
        .get_mut("metadata")
        .and_then(Value::as_dictionary_mut)
        .ok_or_else(|| AppError::ParseError("metadata section must be dictionary".to_string()))?;
    metadata.insert(
        "size".to_string(),
        Value::String(format!("{{{},{} }}", width.max(1), height.max(1)).replace(" ", "")),
    );
    Ok(())
}

fn get_required_string<'a>(dict: &'a Dictionary, key: &str) -> Result<&'a str, AppError> {
    dict.get(key)
        .and_then(Value::as_string)
        .ok_or_else(|| AppError::ParseError(format!("missing or invalid `{key}`")))
}

fn get_optional_string<'a>(dict: &'a Dictionary, key: &str) -> Option<&'a str> {
    dict.get(key).and_then(Value::as_string)
}

fn parse_pair_u32(raw: &str) -> Result<IconEditorSize, AppError> {
    let parts = parse_numeric_list(raw)?;
    if parts.len() != 2 {
        return Err(AppError::ParseError(format!(
            "expected 2 numbers in pair `{raw}`"
        )));
    }
    let width = number_to_u32(parts[0])?;
    let height = number_to_u32(parts[1])?;
    Ok(IconEditorSize { width, height })
}

fn parse_pair_f32(raw: &str) -> Result<IconEditorPoint, AppError> {
    let parts = parse_numeric_list(raw)?;
    if parts.len() != 2 {
        return Err(AppError::ParseError(format!(
            "expected 2 numbers in pair `{raw}`"
        )));
    }
    Ok(IconEditorPoint {
        x: parts[0],
        y: parts[1],
    })
}

fn parse_texture_rect(raw: &str) -> Result<IconEditorRect, AppError> {
    let parts = parse_numeric_list(raw)?;
    if parts.len() != 4 {
        return Err(AppError::ParseError(format!(
            "textureRect expected 4 numbers in `{raw}`"
        )));
    }
    Ok(IconEditorRect {
        x: number_to_u32(parts[0])?,
        y: number_to_u32(parts[1])?,
        width: number_to_u32(parts[2])?,
        height: number_to_u32(parts[3])?,
    })
}

/// Atlas crop rectangle for a frame, matching splitter `extract_frame_image` logic:
/// origin from `textureRect`, dimensions from `spriteSize` (swapped when rotated).
fn atlas_crop_rect_for_frame(
    texture_rect: &IconEditorRect,
    sprite_size: IconEditorSize,
    texture_rotated: bool,
) -> IconEditorRect {
    let crop_width = sprite_size.width.max(1);
    let crop_height = sprite_size.height.max(1);
    let (width, height) = if texture_rotated {
        (crop_height, crop_width)
    } else {
        (crop_width, crop_height)
    };
    IconEditorRect {
        x: texture_rect.x,
        y: texture_rect.y,
        width,
        height,
    }
}

fn fit_sprite_to_size(sprite: RgbaImage, sprite_size: IconEditorSize) -> RgbaImage {
    if sprite.width() == sprite_size.width && sprite.height() == sprite_size.height {
        return sprite;
    }
    let mut resized = RgbaImage::from_pixel(
        sprite_size.width.max(1),
        sprite_size.height.max(1),
        image::Rgba([0, 0, 0, 0]),
    );
    let copy_w = sprite.width().min(resized.width());
    let copy_h = sprite.height().min(resized.height());
    for y in 0..copy_h {
        for x in 0..copy_w {
            resized.put_pixel(x, y, *sprite.get_pixel(x, y));
        }
    }
    resized
}

fn extract_frame_sprite_from_atlas(
    atlas_rgba: &RgbaImage,
    texture_rect: &IconEditorRect,
    sprite_size: IconEditorSize,
    texture_rotated: bool,
) -> Result<RgbaImage, AppError> {
    let crop_rect = atlas_crop_rect_for_frame(texture_rect, sprite_size, texture_rotated);
    let atlas_width = atlas_rgba.width();
    let atlas_height = atlas_rgba.height();

    if crop_rect.x >= atlas_width || crop_rect.y >= atlas_height {
        return Ok(transparent_1x1_sprite());
    }

    let safe_width = crop_rect
        .width
        .min(atlas_width.saturating_sub(crop_rect.x))
        .max(1);
    let safe_height = crop_rect
        .height
        .min(atlas_height.saturating_sub(crop_rect.y))
        .max(1);

    let raw_crop = image::imageops::crop_imm(
        atlas_rgba,
        crop_rect.x,
        crop_rect.y,
        safe_width,
        safe_height,
    )
    .to_image();

    let sprite = if texture_rotated {
        image::imageops::rotate270(&raw_crop)
    } else {
        raw_crop
    };

    Ok(fit_sprite_to_size(sprite, sprite_size))
}

fn clear_atlas_rect(atlas: &mut RgbaImage, rect: &IconEditorRect) {
    if rect.width == 0 || rect.height == 0 {
        return;
    }
    let max_x = rect.x.saturating_add(rect.width).min(atlas.width());
    let max_y = rect.y.saturating_add(rect.height).min(atlas.height());
    for y in rect.y..max_y {
        for x in rect.x..max_x {
            atlas.put_pixel(x, y, image::Rgba([0, 0, 0, 0]));
        }
    }
}

fn remerge_and_write_sheet(
    plist_path: &Path,
    plist_root: &mut Value,
    sprites: &BTreeMap<String, RgbaImage>,
) -> Result<(), AppError> {
    merge_sheet_to_atlas(plist_path, plist_root, sprites)?;
    write_plist_atomically(plist_path, plist_root)
}

fn merge_sheet_to_atlas(
    plist_path: &Path,
    plist_root: &mut Value,
    sprites: &BTreeMap<String, RgbaImage>,
) -> Result<(), AppError> {
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;
    let merger_options = MergerOptions {
        include_outside_plist_files: false,
        dimensions: None,
        sheet_concurrency: 1,
    };
    let sheet_label = plist_path.to_string_lossy().to_string();
    let mut on_sprite_loaded = |_label: String| {};
    let (merged_atlas, _w, _h, _count, _issues) = merge_plist_from_memory(
        plist_root,
        sprites,
        sheet_label.as_str(),
        &merger_options,
        &mut on_sprite_loaded,
    )?;
    save_dynamic_png_fast(&atlas_path, &DynamicImage::ImageRgba8(merged_atlas))
}

fn rotate_sprite_image(sprite: RgbaImage, direction: IconEditorRotateDirection) -> RgbaImage {
    match direction {
        IconEditorRotateDirection::Clockwise => image::imageops::rotate90(&sprite),
        IconEditorRotateDirection::CounterClockwise => image::imageops::rotate270(&sprite),
    }
}

fn swap_icon_editor_size(size: IconEditorSize) -> IconEditorSize {
    IconEditorSize {
        width: size.height,
        height: size.width,
    }
}

fn rotate_sprite_offset(
    offset: IconEditorPoint,
    direction: IconEditorRotateDirection,
) -> IconEditorPoint {
    match direction {
        IconEditorRotateDirection::Clockwise => IconEditorPoint {
            x: offset.y,
            y: -offset.x,
        },
        IconEditorRotateDirection::CounterClockwise => IconEditorPoint {
            x: -offset.y,
            y: offset.x,
        },
    }
}

fn snapshot_texture_rotated_flags(frames: &Dictionary) -> BTreeMap<String, bool> {
    frames
        .iter()
        .map(|(name, value)| {
            let rotated = value
                .as_dictionary()
                .and_then(|dict| dict.get("textureRotated"))
                .and_then(Value::as_boolean)
                .unwrap_or(false);
            (name.clone(), rotated)
        })
        .collect()
}

fn restore_texture_rotated_flags(frames: &mut Dictionary, snapshot: &BTreeMap<String, bool>) {
    for (name, rotated) in snapshot {
        if let Some(frame_dict) = frames.get_mut(name).and_then(Value::as_dictionary_mut) {
            frame_dict.insert("textureRotated".to_string(), Value::Boolean(*rotated));
        }
    }
}

fn decode_png_data_url(png_data_url: &str) -> Result<RgbaImage, AppError> {
    let encoded = png_data_url
        .split_once(',')
        .map(|(_, data)| data)
        .ok_or_else(|| AppError::ParseError("invalid png data url".to_string()))?;
    let bytes = BASE64_STANDARD
        .decode(encoded)
        .map_err(|err| AppError::ParseError(format!("failed to decode png data: {err}")))?;
    image::load_from_memory(&bytes)
        .map_err(|err| AppError::ParseError(format!("failed to decode png image: {err}")))
        .map(|image| image.to_rgba8())
}

fn write_frame_texture_metadata(
    frame_dict: &mut Dictionary,
    update: &IconEditorFrameTextureUpdate,
) -> Result<(), AppError> {
    let size_text = format!(
        "{{{},{} }}",
        update.sprite_size.width, update.sprite_size.height
    )
    .replace(" ", "");
    let source_text = format!(
        "{{{},{} }}",
        update.sprite_source_size.width, update.sprite_source_size.height
    )
    .replace(" ", "");
    frame_dict.insert("spriteSize".to_string(), Value::String(size_text));
    frame_dict.insert("spriteSourceSize".to_string(), Value::String(source_text));
    frame_dict.insert(
        "spriteOffset".to_string(),
        Value::String(format_pair_f32(&update.sprite_offset)),
    );
    frame_dict.insert(
        "textureRotated".to_string(),
        Value::Boolean(update.texture_rotated),
    );
    if update.is_new_frame {
        frame_dict.insert("aliases".to_string(), Value::Array(Vec::new()));
        frame_dict.insert(
            "textureRect".to_string(),
            Value::String(format_texture_rect(&IconEditorRect {
                x: 0,
                y: 0,
                width: update.sprite_size.width,
                height: update.sprite_size.height,
            })),
        );
    }
    Ok(())
}

fn apply_frame_texture_updates(
    frames_mut: &mut Dictionary,
    sprites: &mut BTreeMap<String, RgbaImage>,
    trim_by_name: &mut BTreeMap<String, TrimInsets>,
    updates: &[IconEditorFrameTextureUpdate],
) -> Result<(), AppError> {
    for update in updates {
        let rgba = decode_png_data_url(&update.png_data_url)?;
        let plist_key = if update.is_new_frame {
            let plist_key = ensure_png_frame_key(&update.name);
            if find_frame_key(frames_mut, &plist_key).is_some() {
                return Err(AppError::InvalidOperation(
                    "frame already exists in gamesheet plist",
                ));
            }
            let mut frame_dict = Dictionary::new();
            write_frame_texture_metadata(&mut frame_dict, update)?;
            frames_mut.insert(plist_key.clone(), Value::Dictionary(frame_dict));
            plist_key
        } else {
            let key = find_frame_key(frames_mut, &update.name).ok_or_else(|| {
                AppError::ParseError(format!("frame `{}` not found in plist", update.name))
            })?;
            let frame_dict = frames_mut
                .get_mut(&key)
                .and_then(Value::as_dictionary_mut)
                .ok_or_else(|| {
                    AppError::ParseError(format!("frame `{key}` is not a dictionary"))
                })?;
            write_frame_texture_metadata(frame_dict, update)?;
            key
        };
        trim_by_name.insert(plist_key.clone(), trim_transparent_insets(&rgba));
        sprites.insert(plist_key, rgba);
    }
    Ok(())
}

fn finalize_merged_atlas_preserving_texture_rotated(
    plist_path: &Path,
    plist_root: &mut Value,
    sprites: &BTreeMap<String, RgbaImage>,
    texture_rotated_snapshot: &BTreeMap<String, bool>,
) -> Result<(), AppError> {
    merge_sheet_to_atlas(plist_path, plist_root, sprites)?;

    {
        let root_dict_mut = plist_root
            .as_dictionary_mut()
            .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
        let frames_mut = frames_dictionary_mut(root_dict_mut)?;
        restore_texture_rotated_flags(frames_mut, texture_rotated_snapshot);
    }

    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;
    let mut merged_atlas = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();
    let frames = frames_dictionary(root_dict)?;
    for (frame_key, texture_rotated) in texture_rotated_snapshot {
        if !texture_rotated {
            continue;
        }
        let Some(frame_dict) = frames.get(frame_key).and_then(Value::as_dictionary) else {
            continue;
        };
        reencode_texture_rotated_frame_in_atlas(&mut merged_atlas, frame_dict)?;
    }

    save_dynamic_png_fast(&atlas_path, &DynamicImage::ImageRgba8(merged_atlas))
}

fn apply_rotation_metadata_to_frame(
    frame_dict: &mut Dictionary,
    direction: IconEditorRotateDirection,
) -> Result<(), AppError> {
    let sprite_size = parse_pair_u32(get_required_string(frame_dict, "spriteSize")?)?;
    let new_size = swap_icon_editor_size(sprite_size);
    let size_text = format!("{{{},{} }}", new_size.width, new_size.height).replace(" ", "");
    frame_dict.insert("spriteSize".to_string(), Value::String(size_text.clone()));

    if get_optional_string(frame_dict, "spriteSourceSize").is_some() {
        let source_size = parse_pair_u32(get_required_string(frame_dict, "spriteSourceSize")?)?;
        let new_source = swap_icon_editor_size(source_size);
        frame_dict.insert(
            "spriteSourceSize".to_string(),
            Value::String(
                format!("{{{},{} }}", new_source.width, new_source.height).replace(" ", ""),
            ),
        );
    } else {
        frame_dict.insert("spriteSourceSize".to_string(), Value::String(size_text));
    }

    let offset = parse_pair_f32(
        get_optional_string(frame_dict, "spriteOffset").unwrap_or("{0,0}"),
    )?;
    let rotated_offset = rotate_sprite_offset(offset, direction);
    frame_dict.insert(
        "spriteOffset".to_string(),
        Value::String(format_pair_f32(&rotated_offset)),
    );

    Ok(())
}

fn reencode_texture_rotated_frame_in_atlas(
    atlas: &mut RgbaImage,
    frame_dict: &Dictionary,
) -> Result<(), AppError> {
    let texture_rect = parse_texture_rect(get_required_string(frame_dict, "textureRect")?)?;
    let sprite_size = parse_pair_u32(get_required_string(frame_dict, "spriteSize")?)?;

    if texture_rect.x >= atlas.width() || texture_rect.y >= atlas.height() {
        return Ok(());
    }

    let safe_width = sprite_size
        .width
        .min(atlas.width().saturating_sub(texture_rect.x))
        .max(1);
    let safe_height = sprite_size
        .height
        .min(atlas.height().saturating_sub(texture_rect.y))
        .max(1);
    let upright = image::imageops::crop_imm(
        atlas,
        texture_rect.x,
        texture_rect.y,
        safe_width,
        safe_height,
    )
    .to_image();
    let stored = image::imageops::rotate270(&upright);
    let atlas_crop = atlas_crop_rect_for_frame(&texture_rect, sprite_size, true);
    clear_atlas_rect(atlas, &atlas_crop);
    image::imageops::overlay(
        atlas,
        &stored,
        i64::from(atlas_crop.x),
        i64::from(atlas_crop.y),
    );
    Ok(())
}

fn number_to_u32(value: f32) -> Result<u32, AppError> {
    if !value.is_finite() || value < 0.0 {
        return Err(AppError::ParseError(format!(
            "expected non-negative finite number, got `{value}`"
        )));
    }
    Ok(value.round() as u32)
}

fn parse_numeric_list(raw: &str) -> Result<Vec<f32>, AppError> {
    let cleaned = raw.trim().replace(['{', '}'], " ");
    let mut out: Vec<f32> = Vec::new();
    for chunk in cleaned.split(',') {
        let token = chunk.trim();
        if token.is_empty() {
            continue;
        }
        let parsed = token
            .parse::<f32>()
            .map_err(|_| AppError::ParseError(format!("invalid number `{token}` in `{raw}`")))?;
        out.push(parsed);
    }
    Ok(out)
}

#[derive(Debug, Clone)]
struct TrimInsets {
    left: u32,
    top: u32,
    right: u32,
    bottom: u32,
}

fn trim_transparent_insets(image: &RgbaImage) -> TrimInsets {
    let width = image.width();
    let height = image.height();
    if width == 0 || height == 0 {
        return TrimInsets {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
    }

    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0_u32;
    let mut max_y = 0_u32;
    let mut found = false;
    for y in 0..height {
        for x in 0..width {
            if image.get_pixel(x, y).0[3] == 0 {
                continue;
            }
            found = true;
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
    }

    if !found {
        return TrimInsets {
            left: 0,
            top: 0,
            right: width.saturating_sub(1),
            bottom: height.saturating_sub(1),
        };
    }

    TrimInsets {
        left: min_x,
        top: min_y,
        right: width.saturating_sub(max_x + 1),
        bottom: height.saturating_sub(max_y + 1),
    }
}

fn format_pair_f32(value: &IconEditorPoint) -> String {
    format!("{{{:.1},{:.1}}}", value.x, value.y)
}

fn format_texture_rect(rect: &IconEditorRect) -> String {
    format!(
        "{{{{{},{}}},{{{},{} }}}}",
        rect.x, rect.y, rect.width, rect.height
    )
    .replace(" ", "")
}

fn transparent_1x1_sprite() -> RgbaImage {
    RgbaImage::from_pixel(1, 1, image::Rgba([0, 0, 0, 0]))
}

fn collect_sheet_sprites_for_remerge(
    plist_root: &Value,
    atlas_rgba: &RgbaImage,
) -> Result<BTreeMap<String, RgbaImage>, AppError> {
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames = frames_dictionary(root_dict)?;
    let mut frame_names: Vec<String> = frames.keys().cloned().collect();
    frame_names.sort();

    let mut sprites: BTreeMap<String, RgbaImage> = BTreeMap::new();
    for frame_name in frame_names {
        let frame_dict = frames
            .get(&frame_name)
            .and_then(Value::as_dictionary)
            .ok_or_else(|| {
                AppError::ParseError(format!("frame `{frame_name}` is not a dictionary"))
            })?;
        let texture_rect = parse_texture_rect(get_required_string(frame_dict, "textureRect")?)?;
        let sprite_size = parse_pair_u32(get_required_string(frame_dict, "spriteSize")?)?;
        let texture_rotated = frame_dict
            .get("textureRotated")
            .and_then(Value::as_boolean)
            .unwrap_or(false);
        let final_sprite =
            extract_frame_sprite_from_atlas(&atlas_rgba, &texture_rect, sprite_size, texture_rotated)?;

        sprites.insert(frame_name, final_sprite);
    }

    Ok(sprites)
}

fn rename_plist_sheet_identifiers(
    plist_root: &mut Value,
    old_stem: &str,
    new_stem: &str,
    old_sprite_stem: &str,
    new_sprite_stem: &str,
) -> Result<(), AppError> {
    if old_stem == new_stem && old_sprite_stem == new_sprite_stem {
        return Ok(());
    }

    let root = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;

    if let Some(Value::Dictionary(frames)) = root.get_mut("frames") {
        let old_keys: Vec<String> = frames.keys().cloned().collect();
        let mut renamed_frames = Dictionary::new();
        for old_key in old_keys {
            let new_key = apply_rename_replacements(
                &old_key,
                old_stem,
                new_stem,
                old_sprite_stem,
                new_sprite_stem,
            );
            if let Some(frame_value) = frames.remove(&old_key) {
                renamed_frames.insert(new_key, frame_value);
            }
        }
        *frames = renamed_frames;
    }

    rename_all_string_values(
        plist_root,
        old_stem,
        new_stem,
        old_sprite_stem,
        new_sprite_stem,
    );
    Ok(())
}

fn rename_all_string_values(
    value: &mut Value,
    old_stem: &str,
    new_stem: &str,
    old_sprite_stem: &str,
    new_sprite_stem: &str,
) {
    match value {
        Value::String(text) => {
            *text = apply_rename_replacements(
                text.as_str(),
                old_stem,
                new_stem,
                old_sprite_stem,
                new_sprite_stem,
            );
        }
        Value::Dictionary(dict) => {
            for (_, child) in dict.iter_mut() {
                rename_all_string_values(
                    child,
                    old_stem,
                    new_stem,
                    old_sprite_stem,
                    new_sprite_stem,
                );
            }
        }
        Value::Array(items) => {
            for child in items.iter_mut() {
                rename_all_string_values(
                    child,
                    old_stem,
                    new_stem,
                    old_sprite_stem,
                    new_sprite_stem,
                );
            }
        }
        _ => {}
    }
}

fn apply_rename_replacements(
    text: &str,
    old_stem: &str,
    new_stem: &str,
    old_sprite_stem: &str,
    new_sprite_stem: &str,
) -> String {
    let mut output = text.to_string();
    if old_stem != new_stem && !old_stem.is_empty() {
        output = output.replace(old_stem, new_stem);
    }
    if old_sprite_stem != new_sprite_stem && !old_sprite_stem.is_empty() {
        output = output.replace(old_sprite_stem, new_sprite_stem);
    }
    output
}

fn strip_graphics_tier_suffix(stem: &str) -> String {
    if let Some(value) = stem.strip_suffix("-uhd") {
        return value.to_string();
    }
    if let Some(value) = stem.strip_suffix("-hd") {
        return value.to_string();
    }
    stem.to_string()
}
