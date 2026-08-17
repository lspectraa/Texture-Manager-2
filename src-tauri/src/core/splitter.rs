use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use image::imageops::rotate270;
use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use plist::{Dictionary, Value};
use rayon::prelude::*;

use crate::core::contracts::SplitterOptions;
use crate::core::discovery::SheetCandidate;
use crate::core::errors::AppError;
use crate::core::image_io::save_dynamic_png_fast;
use crate::core::report::{ReportIssue, ReportLevel};
use crate::core::safe_fs::{is_safe_path_segment, path_from_slashes};

pub struct SplitExecutionResult {
    pub files_processed: usize,
    pub issues: Vec<ReportIssue>,
}

/// Result of splitting a sheet without writing sprite files or plist to disk (porter).
pub struct SplitMemoryResult {
    pub plist_root: Value,
    pub sprites: BTreeMap<String, RgbaImage>,
    pub files_processed: usize,
    pub issues: Vec<ReportIssue>,
}

pub fn split_sheet_candidate_memory<F>(
    candidate: &SheetCandidate,
    options: &SplitterOptions,
    mut on_sprite_done: F,
) -> Result<SplitMemoryResult, AppError>
where
    F: FnMut() + Send,
{
    let mut plist_root = Value::from_file(&candidate.plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let source_image = image::open(&candidate.png_path)
        .map_err(|err| AppError::ParseError(format!("failed to open png: {err}")))?;

    let frames = plist_root
        .as_dictionary_mut()
        .and_then(|root| root.get_mut("frames"))
        .and_then(Value::as_dictionary_mut)
        .ok_or(AppError::ParseError(
            "plist missing top-level `frames` dictionary".to_string(),
        ))?;

    let mut issues: Vec<ReportIssue> = Vec::new();
    let mut sprites: BTreeMap<String, RgbaImage> = BTreeMap::new();
    let mut files_processed = 0_usize;

    for (frame_name, frame_value) in frames.iter_mut() {
        let Some(frame_dict) = frame_value.as_dictionary_mut() else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "frame is not a dictionary; skipping".to_string(),
                file: Some(frame_name.clone()),
            });
            continue;
        };

        match extract_frame_image(&source_image, frame_dict, options) {
            Ok(extracted) => {
                sprites.insert(frame_name.clone(), extracted.to_rgba8());
                files_processed += 1;
                on_sprite_done();
            }
            Err(err) => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: err.to_string(),
                    file: Some(frame_name.clone()),
                });
            }
        }
    }

    let extracted: HashSet<String> = sprites.keys().cloned().collect();
    frames.retain(|name, _| extracted.contains(name));

    Ok(SplitMemoryResult {
        plist_root,
        sprites,
        files_processed,
        issues,
    })
}

pub fn split_sheet_candidate<F>(
    candidate: &SheetCandidate,
    output_dir: &Path,
    options: &SplitterOptions,
    mut on_sprite_done: F,
) -> Result<SplitExecutionResult, AppError>
where
    F: FnMut() + Send,
{
    let mut plist_root = Value::from_file(&candidate.plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let source_image = image::open(&candidate.png_path)
        .map_err(|err| AppError::ParseError(format!("failed to open png: {err}")))?;

    let frames = plist_root
        .as_dictionary_mut()
        .and_then(|root| root.get_mut("frames"))
        .and_then(Value::as_dictionary_mut)
        .ok_or(AppError::ParseError(
            "plist missing top-level `frames` dictionary".to_string(),
        ))?;

    let mut issues: Vec<ReportIssue> = Vec::new();
    let mut files_processed = 0_usize;

    let mut pending: Vec<(PathBuf, DynamicImage, String)> = Vec::new();
    for (frame_name, frame_value) in frames.iter_mut() {
        let Some(frame_dict) = frame_value.as_dictionary_mut() else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "frame is not a dictionary; skipping".to_string(),
                file: Some(frame_name.clone()),
            });
            continue;
        };

        match extract_frame_image(&source_image, frame_dict, options) {
            Ok(extracted) => {
                let sprite_path = build_sprite_output_path(candidate, output_dir, frame_name);
                pending.push((sprite_path, extracted, frame_name.clone()));
            }
            Err(err) => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: err.to_string(),
                    file: Some(frame_name.clone()),
                });
            }
        }
    }

    let extracted: HashSet<String> = pending.iter().map(|(_, _, name)| name.clone()).collect();
    frames.retain(|name, _| extracted.contains(name));

    let write_results: Vec<(String, Result<(), AppError>)> = pending
        .into_par_iter()
        .map(|(sprite_path, extracted, frame_name)| {
            let write = (|| -> Result<(), AppError> {
                if let Some(parent) = sprite_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                save_dynamic_png_fast(&sprite_path, &extracted)?;
                Ok(())
            })();
            (frame_name, write)
        })
        .collect();

    for (frame_name, write) in write_results {
        match write {
            Ok(()) => {
                files_processed += 1;
                on_sprite_done();
            }
            Err(err) => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: err.to_string(),
                    file: Some(frame_name),
                });
            }
        }
    }

    let plist_output_path = output_dir.join(format!("{}.plist", candidate.stem));
    plist_root
        .to_file_xml(plist_output_path)
        .map_err(|err| AppError::IoError(err.to_string()))?;

    Ok(SplitExecutionResult {
        files_processed,
        issues,
    })
}

fn build_sprite_output_path(
    candidate: &SheetCandidate,
    output_dir: &Path,
    frame_name: &str,
) -> std::path::PathBuf {
    let normalized_frame = frame_name.replace('\\', "/");
    let relative_parent = candidate
        .relative_dir
        .to_string_lossy()
        .replace('\\', "/")
        .trim_matches('/')
        .to_string();

    let trimmed = if relative_parent.is_empty() {
        normalized_frame
    } else {
        match normalized_frame.strip_prefix(&format!("{relative_parent}/")) {
            Some(value) => value.to_string(),
            None => normalized_frame,
        }
    };

    if let Ok(relative) = path_from_slashes(&trimmed) {
        return output_dir.join(relative);
    }
    // Fall back to basename only when the frame key is unsafe.
    let basename = trimmed
        .rsplit('/')
        .next()
        .filter(|part| is_safe_path_segment(part))
        .unwrap_or("sprite.png");
    output_dir.join(basename)
}

pub(crate) fn extract_frame_image(
    source_image: &DynamicImage,
    frame_dict: &mut Dictionary,
    _options: &SplitterOptions,
) -> Result<DynamicImage, AppError> {
    let texture_rect_raw = get_string(frame_dict, "textureRect")?;
    let sprite_size_raw = get_string(frame_dict, "spriteSize")?;
    let sprite_offset_raw =
        get_optional_string(frame_dict, "spriteOffset").map(std::string::ToString::to_string);
    let texture_rotated = get_bool(frame_dict, "textureRotated").unwrap_or(false);

    let rect = parse_texture_rect(texture_rect_raw)?;
    let sprite_size = parse_pair(sprite_size_raw)?;

    let crop_width = sprite_size.0.max(1);
    let crop_height = sprite_size.1.max(1);

    let (x, y, width, height) = if texture_rotated {
        (rect.0, rect.1, crop_height, crop_width)
    } else {
        (rect.0, rect.1, crop_width, crop_height)
    };

    let (img_w, img_h) = source_image.dimensions();
    if x >= img_w || y >= img_h {
        return Err(AppError::ParseError(
            "frame crop origin outside source image bounds".to_string(),
        ));
    }

    let safe_width = width.min(img_w.saturating_sub(x)).max(1);
    let safe_height = height.min(img_h.saturating_sub(y)).max(1);

    let mut sprite = source_image.crop_imm(x, y, safe_width, safe_height);

    const LOCKED_PRE_ROTATE: bool = true;
    if LOCKED_PRE_ROTATE && texture_rotated {
        let rotated = rotate270(&sprite.to_rgba8());
        sprite = DynamicImage::ImageRgba8(rotated);
        frame_dict.insert("textureRotated".to_string(), Value::Boolean(false));
    }

    const LOCKED_OFFSET_NULLIFY: bool = true;
    if LOCKED_OFFSET_NULLIFY {
        let offset_raw = sprite_offset_raw.as_deref().unwrap_or("{0,0}");
        let (offset_x_raw, offset_y_raw) = parse_pair_signed(offset_raw)?;
        let offset_x = (offset_x_raw * 2.0).round() as i32;
        let offset_y = (offset_y_raw * 2.0).round() as i32;
        let baked = bake_offset(sprite, offset_x, offset_y);

        let baked_w = baked.width();
        let baked_h = baked.height();
        frame_dict.insert(
            "spriteOffset".to_string(),
            Value::String("{0,0}".to_string()),
        );
        frame_dict.insert(
            "spriteSize".to_string(),
            Value::String(format!("{{{},{} }}", baked_w, baked_h).replace(" ", "")),
        );
        frame_dict.insert(
            "spriteSourceSize".to_string(),
            Value::String(format!("{{{},{} }}", baked_w, baked_h).replace(" ", "")),
        );
        return Ok(DynamicImage::ImageRgba8(baked));
    }

    Ok(sprite)
}

fn bake_offset(image: DynamicImage, offset_x: i32, offset_y: i32) -> RgbaImage {
    let sprite = image.to_rgba8();
    // Zero offset: return pixels unchanged. `overlay` alpha-blends onto a clear canvas and
    // can alter semi-transparent edge texels (breaking sprite-hash cache lookups).
    if offset_x == 0 && offset_y == 0 {
        return sprite;
    }

    let width = sprite.width() + offset_x.unsigned_abs();
    let height = sprite.height() + offset_y.unsigned_abs();

    let mut canvas = RgbaImage::from_pixel(width.max(1), height.max(1), Rgba([0, 0, 0, 0]));

    let paste_x = if offset_x <= 0 {
        0
    } else {
        offset_x.unsigned_abs()
    };
    let paste_y = if offset_y <= 0 {
        offset_y.unsigned_abs()
    } else {
        0
    };

    // Copy (no blend) so RGB/A of the crop stay bit-identical after padding.
    let _ = image::imageops::replace(&mut canvas, &sprite, i64::from(paste_x), i64::from(paste_y));
    canvas
}

fn get_string<'a>(dict: &'a Dictionary, key: &str) -> Result<&'a str, AppError> {
    dict.get(key)
        .and_then(Value::as_string)
        .ok_or_else(|| AppError::ParseError(format!("missing or invalid `{key}`")))
}

fn get_optional_string<'a>(dict: &'a Dictionary, key: &str) -> Option<&'a str> {
    dict.get(key).and_then(Value::as_string)
}

fn get_bool(dict: &Dictionary, key: &str) -> Option<bool> {
    dict.get(key).and_then(Value::as_boolean)
}

fn parse_texture_rect(value: &str) -> Result<(u32, u32, u32, u32), AppError> {
    let numbers = parse_numbers(value)?;
    if numbers.len() != 4 {
        return Err(AppError::ParseError(format!(
            "textureRect expected 4 numbers, got {} in `{value}`",
            numbers.len()
        )));
    }

    Ok((
        numbers[0].ceil().max(0.0) as u32,
        numbers[1].ceil().max(0.0) as u32,
        numbers[2].floor().max(1.0) as u32,
        numbers[3].floor().max(1.0) as u32,
    ))
}

fn parse_pair(value: &str) -> Result<(u32, u32), AppError> {
    let numbers = parse_numbers(value)?;
    if numbers.len() != 2 {
        return Err(AppError::ParseError(format!(
            "pair expected 2 numbers, got {} in `{value}`",
            numbers.len()
        )));
    }

    Ok((
        numbers[0].floor().max(0.0) as u32,
        numbers[1].floor().max(0.0) as u32,
    ))
}

fn parse_pair_signed(value: &str) -> Result<(f32, f32), AppError> {
    let numbers = parse_numbers(value)?;
    if numbers.len() != 2 {
        return Err(AppError::ParseError(format!(
            "pair expected 2 numbers, got {} in `{value}`",
            numbers.len()
        )));
    }

    Ok((numbers[0], numbers[1]))
}

fn parse_numbers(value: &str) -> Result<Vec<f32>, AppError> {
    let mut cleaned = String::with_capacity(value.len());
    for ch in value.chars() {
        if matches!(ch, '{' | '}') {
            continue;
        }
        cleaned.push(ch);
    }

    let mut numbers: Vec<f32> = Vec::new();
    for part in cleaned.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parsed = trimmed
            .parse::<f32>()
            .map_err(|_| AppError::ParseError(format!("invalid numeric value `{trimmed}`")))?;
        numbers.push(parsed);
    }
    Ok(numbers)
}
