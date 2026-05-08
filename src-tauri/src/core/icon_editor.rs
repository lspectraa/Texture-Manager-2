use std::collections::BTreeMap;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use image::imageops::rotate90;
use image::{DynamicImage, ImageFormat, RgbaImage};
use plist::{Dictionary, Value};
use serde::{Deserialize, Serialize};

use crate::core::contracts::MergerOptions;
use crate::core::errors::AppError;
use crate::core::image_io::save_dynamic_png_fast;
use crate::core::merger::merge_plist_from_memory;

#[derive(Debug, Clone, Serialize)]
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
        let texture_rect = texture_rect_for_read(&texture_rect_raw, texture_rotated);

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
) -> Result<(), AppError> {
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
        let read_texture_rect = texture_rect_for_read(&texture_rect, texture_rotated);

        let (resolved_texture_rect, used_swapped_size) = resolve_texture_rect_for_atlas(
            &frame_name,
            read_texture_rect,
            atlas_rgba.width(),
            atlas_rgba.height(),
        )?;

        let sprite = if resolved_texture_rect.width == 0 || resolved_texture_rect.height == 0 {
            transparent_1x1_sprite()
        } else {
            let raw_crop = image::imageops::crop_imm(
                &atlas_rgba,
                resolved_texture_rect.x,
                resolved_texture_rect.y,
                resolved_texture_rect.width,
                resolved_texture_rect.height,
            )
            .to_image();
            if texture_rotated {
                image::imageops::rotate270(&raw_crop)
            } else {
                raw_crop
            }
        };
        let final_sprite =
            if sprite.width() != sprite_size.width || sprite.height() != sprite_size.height {
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
            } else {
                sprite
            };

        if used_swapped_size {
            corrected_texture_rects.insert(frame_name.clone(), resolved_texture_rect.clone());
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

pub fn icon_editor_import_frame(
    plist_path: &Path,
    frame_name: &str,
    texture_path: &Path,
) -> Result<(), AppError> {
    let plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let root_dict = plist_root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames = frames_dictionary(root_dict)?;
    let frame_dict = frames
        .get(frame_name)
        .and_then(Value::as_dictionary)
        .ok_or_else(|| AppError::ParseError(format!("frame `{frame_name}` not found in plist")))?;
    let texture_rect = parse_texture_rect(get_required_string(frame_dict, "textureRect")?)?;
    let sprite_size = parse_pair_u32(get_required_string(frame_dict, "spriteSize")?)?;
    let texture_rotated = frame_dict
        .get("textureRotated")
        .and_then(Value::as_boolean)
        .unwrap_or(false);
    let atlas_path = resolve_atlas_path(plist_path, root_dict)?;

    let imported = image::open(texture_path)
        .map_err(|err| AppError::ParseError(format!("failed to open imported png: {err}")))?
        .to_rgba8();
    if imported.width() != sprite_size.width || imported.height() != sprite_size.height {
        return Err(AppError::InvalidOperation(
            "imported texture dimensions must match spriteSize",
        ));
    }

    let blit_sprite: RgbaImage = if texture_rotated {
        rotate90(&imported)
    } else {
        imported
    };
    let mut atlas = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();
    let read_texture_rect = texture_rect_for_read(&texture_rect, texture_rotated);
    let (resolved_texture_rect, _used_swapped_size) = resolve_texture_rect_for_atlas(
        frame_name,
        read_texture_rect,
        atlas.width(),
        atlas.height(),
    )?;

    if blit_sprite.width() != resolved_texture_rect.width
        || blit_sprite.height() != resolved_texture_rect.height
    {
        return Err(AppError::InvalidOperation(
            "imported texture dimensions do not match frame textureRect",
        ));
    }

    for y in 0..blit_sprite.height() {
        for x in 0..blit_sprite.width() {
            let pixel = blit_sprite.get_pixel(x, y);
            atlas.put_pixel(
                resolved_texture_rect.x + x,
                resolved_texture_rect.y + y,
                *pixel,
            );
        }
    }

    save_dynamic_png_fast(&atlas_path, &image::DynamicImage::ImageRgba8(atlas))
}

pub fn icon_editor_add_frame(
    plist_path: &Path,
    frame_name: &str,
    texture_path: &Path,
) -> Result<(), AppError> {
    if frame_name.trim().is_empty() {
        return Err(AppError::InvalidOperation("new frame name cannot be empty"));
    }

    let mut plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let atlas_path = {
        let root_dict = plist_root
            .as_dictionary()
            .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
        resolve_atlas_path(plist_path, root_dict)?
    };
    let root_dict = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    {
        let frames = frames_dictionary_mut(root_dict)?;
        if frames.contains_key(frame_name) {
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

    let atlas_old = image::open(&atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();
    let old_width = atlas_old.width().max(1);
    let old_height = atlas_old.height().max(1);
    let new_width = old_width.max(sprite_width);
    let new_height = old_height.saturating_add(sprite_height);
    let mut atlas_new =
        image::RgbaImage::from_pixel(new_width, new_height, image::Rgba([0, 0, 0, 0]));

    for y in 0..old_height {
        for x in 0..old_width {
            atlas_new.put_pixel(x, y, *atlas_old.get_pixel(x, y));
        }
    }
    for y in 0..sprite_height {
        for x in 0..sprite_width {
            atlas_new.put_pixel(x, old_height + y, *sprite.get_pixel(x, y));
        }
    }

    let mut frame_dict = Dictionary::new();
    frame_dict.insert("aliases".to_string(), Value::Array(Vec::new()));
    frame_dict.insert(
        "spriteOffset".to_string(),
        Value::String("{0.000,0.000}".to_string()),
    );
    frame_dict.insert(
        "spriteSize".to_string(),
        Value::String(format!("{{{},{} }}", sprite_width, sprite_height).replace(" ", "")),
    );
    frame_dict.insert(
        "spriteSourceSize".to_string(),
        Value::String(format!("{{{},{} }}", sprite_width, sprite_height).replace(" ", "")),
    );
    frame_dict.insert("textureRotated".to_string(), Value::Boolean(false));
    frame_dict.insert(
        "textureRect".to_string(),
        Value::String(
            format!(
                "{{{{{},{}}},{{{},{} }}}}",
                0, old_height, sprite_width, sprite_height
            )
            .replace(" ", ""),
        ),
    );
    {
        let frames = frames_dictionary_mut(root_dict)?;
        frames.insert(frame_name.to_string(), Value::Dictionary(frame_dict));
    }
    upsert_metadata_size(root_dict, new_width, new_height)?;

    save_dynamic_png_fast(&atlas_path, &image::DynamicImage::ImageRgba8(atlas_new))?;
    write_plist_atomically(plist_path, &plist_root)
}

pub fn icon_editor_extract_frames(
    plist_path: &Path,
) -> Result<Vec<IconEditorExtractedFrame>, AppError> {
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
        let read_texture_rect = texture_rect_for_read(&texture_rect, texture_rotated);

        let (resolved_texture_rect, _used_swapped_size) = resolve_texture_rect_for_atlas(
            &frame_name,
            read_texture_rect,
            atlas_rgba.width(),
            atlas_rgba.height(),
        )?;

        let sprite = if resolved_texture_rect.width == 0 || resolved_texture_rect.height == 0 {
            transparent_1x1_sprite()
        } else {
            let raw_crop = image::imageops::crop_imm(
                &atlas_rgba,
                resolved_texture_rect.x,
                resolved_texture_rect.y,
                resolved_texture_rect.width,
                resolved_texture_rect.height,
            )
            .to_image();

            if texture_rotated {
                image::imageops::rotate270(&raw_crop)
            } else {
                raw_crop
            }
        };

        let final_sprite =
            if sprite.width() != sprite_size.width || sprite.height() != sprite_size.height {
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
            } else {
                sprite
            };

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

pub fn icon_editor_rename_sheet(
    plist_path: &Path,
    new_stem: &str,
) -> Result<IconEditorRenameResult, AppError> {
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

    let mut plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let atlas_path = {
        let root_dict = plist_root
            .as_dictionary()
            .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
        resolve_atlas_path(plist_path, root_dict)?
    };
    let parent_dir = plist_path
        .parent()
        .ok_or(AppError::InvalidPath("plist path has no parent directory"))?;

    let renamed_plist_path = parent_dir.join(format!("{new_stem}.plist"));
    let renamed_atlas_path = atlas_path.with_file_name(format!("{new_stem}.png"));

    if renamed_plist_path != plist_path && renamed_plist_path.exists() {
        return Err(AppError::InvalidOperation(
            "target plist name already exists in destination directory",
        ));
    }
    if renamed_atlas_path != atlas_path && renamed_atlas_path.exists() {
        return Err(AppError::InvalidOperation(
            "target png name already exists in destination directory",
        ));
    }

    if atlas_path != renamed_atlas_path {
        fs::rename(&atlas_path, &renamed_atlas_path)?;
    }
    if plist_path != renamed_plist_path {
        fs::rename(plist_path, &renamed_plist_path)?;
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
        let renamed_file_name = renamed_atlas_path
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

    let renamed_atlas_rgba = image::open(&renamed_atlas_path)
        .map_err(|err| AppError::ParseError(format!("failed to open atlas png: {err}")))?
        .to_rgba8();
    let sprites = collect_sheet_sprites_for_remerge(&plist_root, &renamed_atlas_rgba)?;
    let merger_options = MergerOptions {
        include_outside_plist_files: false,
        dimensions: None,
        sheet_concurrency: 1,
    };
    let sheet_label = renamed_plist_path.to_string_lossy().to_string();
    let mut on_sprite_loaded = |_label: String| {};
    let (merged_atlas, _w, _h, _count, _issues) = merge_plist_from_memory(
        &mut plist_root,
        &sprites,
        sheet_label.as_str(),
        &merger_options,
        &mut on_sprite_loaded,
    )?;
    save_dynamic_png_fast(&renamed_atlas_path, &DynamicImage::ImageRgba8(merged_atlas))?;

    write_plist_atomically(&renamed_plist_path, &plist_root)?;
    Ok(IconEditorRenameResult {
        plist_path: renamed_plist_path.to_string_lossy().to_string(),
        atlas_path: renamed_atlas_path.to_string_lossy().to_string(),
    })
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
        let candidate = plist_parent.join(file_name);
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

fn texture_rect_for_read(rect: &IconEditorRect, texture_rotated: bool) -> IconEditorRect {
    if !texture_rotated {
        return rect.clone();
    }
    IconEditorRect {
        x: rect.x,
        y: rect.y,
        width: rect.height,
        height: rect.width,
    }
}

fn rect_fits_atlas_bounds(rect: &IconEditorRect, atlas_width: u32, atlas_height: u32) -> bool {
    rect.x.saturating_add(rect.width) <= atlas_width
        && rect.y.saturating_add(rect.height) <= atlas_height
}

fn resolve_texture_rect_for_atlas(
    frame_name: &str,
    rect: IconEditorRect,
    atlas_width: u32,
    atlas_height: u32,
) -> Result<(IconEditorRect, bool), AppError> {
    if rect_fits_atlas_bounds(&rect, atlas_width, atlas_height) {
        return Ok((rect, false));
    }

    let swapped = IconEditorRect {
        x: rect.x,
        y: rect.y,
        width: rect.height,
        height: rect.width,
    };
    if rect_fits_atlas_bounds(&swapped, atlas_width, atlas_height) {
        return Ok((swapped, true));
    }

    Err(AppError::ParseError(format!(
        "frame `{frame_name}` textureRect is outside atlas bounds"
    )))
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
        let read_texture_rect = texture_rect_for_read(&texture_rect, texture_rotated);

        let (resolved_texture_rect, _used_swapped_size) = resolve_texture_rect_for_atlas(
            &frame_name,
            read_texture_rect,
            atlas_rgba.width(),
            atlas_rgba.height(),
        )?;

        let sprite = if resolved_texture_rect.width == 0 || resolved_texture_rect.height == 0 {
            transparent_1x1_sprite()
        } else {
            let raw_crop = image::imageops::crop_imm(
                atlas_rgba,
                resolved_texture_rect.x,
                resolved_texture_rect.y,
                resolved_texture_rect.width,
                resolved_texture_rect.height,
            )
            .to_image();
            if texture_rotated {
                image::imageops::rotate270(&raw_crop)
            } else {
                raw_crop
            }
        };

        let final_sprite =
            if sprite.width() != sprite_size.width || sprite.height() != sprite_size.height {
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
            } else {
                sprite
            };

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
