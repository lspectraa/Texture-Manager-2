use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;

use image::imageops::overlay;
use image::{Rgba, RgbaImage};
use plist::{Dictionary, Value};

use crate::core::contracts::{DimensionOverride, MergerOptions};
use crate::core::errors::AppError;
use crate::core::image_io::save_rgba_png_fast;
use crate::core::report::{ReportIssue, ReportLevel};
use crate::core::safe_fs::{is_safe_path_segment, path_from_slashes};

/// Transparent gutter between packed sprite rects so bilinear filtering does not sample
/// neighboring frames. Uses a **shared** seam: each slot is `w + gap` × `h + gap` and the
/// sprite is drawn at the slot origin, so horizontally/vertically adjacent sprites have
/// exactly `gap` atlas pixels between their opaque bounds (not `2 * gap` from per-side padding).
const PACK_SPRITE_INTER_GAP_PX: u32 = 1;

struct SpritePlacement {
    name: String,
    image: RgbaImage,
    width: u32,
    height: u32,
    x: u32,
    y: u32,
}

pub(crate) fn direct_plist_files(source_dir: &Path) -> Result<Vec<PathBuf>, AppError> {
    direct_plist_files_inner(source_dir)
}

/// Merge one gamesheet plist under `source_dir` into `destination_dir` (one unit of work for parallel merger).
pub fn merge_one_plist_file<F>(
    source_dir: &Path,
    destination_dir: &Path,
    plist_file: &Path,
    options: &MergerOptions,
    on_sprite_loaded: &mut F,
) -> Result<(usize, Vec<ReportIssue>), AppError>
where
    F: FnMut(String) + Send,
{
    merge_single_plist(
        source_dir,
        destination_dir,
        plist_file,
        options,
        on_sprite_loaded,
    )
}

fn merge_single_plist<F>(
    source_dir: &Path,
    destination_dir: &Path,
    plist_file: &Path,
    options: &MergerOptions,
    on_sprite_loaded: &mut F,
) -> Result<(usize, Vec<ReportIssue>), AppError>
where
    F: FnMut(String) + Send,
{
    let mut plist_root = Value::from_file(plist_file)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;

    let root_dict = plist_root.as_dictionary_mut().ok_or(AppError::ParseError(
        "plist root must be a dictionary".to_string(),
    ))?;
    let frames = root_dict
        .get_mut("frames")
        .and_then(Value::as_dictionary_mut)
        .ok_or(AppError::ParseError(
            "plist missing top-level `frames` dictionary".to_string(),
        ))?;

    let mut issues: Vec<ReportIssue> = Vec::new();
    let mut placements: Vec<SpritePlacement> = Vec::new();
    let gamesheet_label = plist_file
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("gamesheet")
        .to_string();
    let mut frame_names: Vec<String> = frames.keys().cloned().collect();
    frame_names.sort();

    for frame_name in frame_names {
        let Some(frame_value) = frames.get_mut(&frame_name) else {
            continue;
        };
        let Some(frame_dict) = frame_value.as_dictionary_mut() else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "frame entry is not a dictionary; skipping".to_string(),
                file: Some(frame_name.clone()),
            });
            continue;
        };

        let sprite_path = resolve_sprite_path(source_dir, &frame_name);
        if sprite_path.is_none() {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "sprite file not found; skipping".to_string(),
                file: Some(frame_name.clone()),
            });
            continue;
        }
        let sprite_path = sprite_path.expect("checked is_some above");

        let sprite = image::open(&sprite_path)
            .map_err(|err| AppError::ParseError(format!("failed to open sprite: {err}")))?;
        let mut rgba = sprite.to_rgba8();

        const LOCKED_ALPHA_TRIM: bool = true;
        if LOCKED_ALPHA_TRIM {
            rgba = apply_alpha_trim_to_frame_dict(frame_dict, rgba);
        }

        let width = rgba.width().max(1);
        let height = rgba.height().max(1);

        frame_dict.insert("textureRotated".to_string(), Value::Boolean(false));
        frame_dict.insert(
            "spriteSize".to_string(),
            Value::String(format!("{{{},{} }}", width, height).replace(" ", "")),
        );
        frame_dict.insert(
            "spriteSourceSize".to_string(),
            Value::String(format!("{{{},{} }}", width, height).replace(" ", "")),
        );

        placements.push(SpritePlacement {
            name: frame_name,
            image: rgba,
            width,
            height,
            x: 0,
            y: 0,
        });
        on_sprite_loaded(gamesheet_label.clone());
    }

    let target_width = resolve_target_width(&placements, options.dimensions.as_ref());
    let (packed_width, packed_height) = pack_sprites_maxrects(&mut placements, target_width);
    let mut atlas = RgbaImage::from_pixel(
        packed_width.max(1),
        packed_height.max(1),
        Rgba([0, 0, 0, 0]),
    );

    for placement in &placements {
        let draw_x = placement.x;
        let draw_y = placement.y;
        overlay(
            &mut atlas,
            &placement.image,
            i64::from(draw_x),
            i64::from(draw_y),
        );

        if let Some(frame_value) = frames.get_mut(&placement.name) {
            if let Some(frame_dict) = frame_value.as_dictionary_mut() {
                frame_dict.insert(
                    "textureRect".to_string(),
                    Value::String(
                        format!(
                            "{{{{{},{}}},{{{},{} }}}}",
                            draw_x, draw_y, placement.width, placement.height
                        )
                        .replace(" ", ""),
                    ),
                );
            }
        }
    }

    if !root_dict.contains_key("metadata") {
        root_dict.insert("metadata".to_string(), Value::Dictionary(Dictionary::new()));
    }
    let metadata = root_dict.get_mut("metadata").ok_or(AppError::ParseError(
        "failed to create metadata section".to_string(),
    ))?;
    let metadata_dict = metadata.as_dictionary_mut().ok_or(AppError::ParseError(
        "metadata section must be dictionary".to_string(),
    ))?;
    metadata_dict.insert(
        "size".to_string(),
        Value::String(
            format!("{{{},{} }}", packed_width.max(1), packed_height.max(1)).replace(" ", ""),
        ),
    );

    fs::create_dir_all(destination_dir)?;
    let output_base_name = plist_file
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or(AppError::InvalidOperation("invalid plist file name"))?;
    let output_png = destination_dir.join(format!("{output_base_name}.png"));
    let output_plist = destination_dir.join(format!("{output_base_name}.plist"));

    thread::scope(|s| {
        let png_path = &output_png;
        let plist_path = &output_plist;
        let rgba = &atlas;
        let png_handle = s.spawn(|| save_rgba_png_fast(png_path, rgba));
        plist_root
            .to_file_xml(plist_path)
            .map_err(|err| AppError::IoError(err.to_string()))?;
        match png_handle.join() {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(AppError::IoError("png write thread panicked".to_string())),
        }
    })?;

    Ok((placements.len(), issues))
}

/// Same packing as [`merge_single_plist`], but sprites are supplied in memory (porter).
pub fn merge_plist_from_memory<F>(
    plist_root: &mut Value,
    sprites: &BTreeMap<String, RgbaImage>,
    gamesheet_label: &str,
    options: &MergerOptions,
    on_sprite_loaded: &mut F,
) -> Result<(RgbaImage, u32, u32, usize, Vec<ReportIssue>), AppError>
where
    F: FnMut(String) + Send,
{
    let root_dict = plist_root.as_dictionary_mut().ok_or(AppError::ParseError(
        "plist root must be a dictionary".to_string(),
    ))?;
    let frames = root_dict
        .get_mut("frames")
        .and_then(Value::as_dictionary_mut)
        .ok_or(AppError::ParseError(
            "plist missing top-level `frames` dictionary".to_string(),
        ))?;

    let mut issues: Vec<ReportIssue> = Vec::new();
    let mut placements: Vec<SpritePlacement> = Vec::new();
    let mut frame_names: Vec<String> = frames.keys().cloned().collect();
    frame_names.sort();

    for frame_name in frame_names {
        let Some(frame_value) = frames.get_mut(&frame_name) else {
            continue;
        };
        let Some(frame_dict) = frame_value.as_dictionary_mut() else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "frame entry is not a dictionary; skipping".to_string(),
                file: Some(frame_name.clone()),
            });
            continue;
        };

        let Some(mut rgba) = sprites.get(&frame_name).cloned() else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "sprite not present after in-memory split; skipping".to_string(),
                file: Some(frame_name.clone()),
            });
            continue;
        };

        const LOCKED_ALPHA_TRIM: bool = true;
        if LOCKED_ALPHA_TRIM {
            rgba = apply_alpha_trim_to_frame_dict(frame_dict, rgba);
        }

        let width = rgba.width().max(1);
        let height = rgba.height().max(1);

        frame_dict.insert("textureRotated".to_string(), Value::Boolean(false));
        frame_dict.insert(
            "spriteSize".to_string(),
            Value::String(format!("{{{},{} }}", width, height).replace(" ", "")),
        );
        frame_dict.insert(
            "spriteSourceSize".to_string(),
            Value::String(format!("{{{},{} }}", width, height).replace(" ", "")),
        );

        placements.push(SpritePlacement {
            name: frame_name,
            image: rgba,
            width,
            height,
            x: 0,
            y: 0,
        });
        on_sprite_loaded(gamesheet_label.to_string());
    }

    let target_width = resolve_target_width(&placements, options.dimensions.as_ref());
    let (packed_width, packed_height) = pack_sprites_maxrects(&mut placements, target_width);
    let mut atlas = RgbaImage::from_pixel(
        packed_width.max(1),
        packed_height.max(1),
        Rgba([0, 0, 0, 0]),
    );

    for placement in &placements {
        let draw_x = placement.x;
        let draw_y = placement.y;
        overlay(
            &mut atlas,
            &placement.image,
            i64::from(draw_x),
            i64::from(draw_y),
        );

        if let Some(frame_value) = frames.get_mut(&placement.name) {
            if let Some(frame_dict) = frame_value.as_dictionary_mut() {
                frame_dict.insert(
                    "textureRect".to_string(),
                    Value::String(
                        format!(
                            "{{{{{},{}}},{{{},{} }}}}",
                            draw_x, draw_y, placement.width, placement.height
                        )
                        .replace(" ", ""),
                    ),
                );
            }
        }
    }

    if !root_dict.contains_key("metadata") {
        root_dict.insert("metadata".to_string(), Value::Dictionary(Dictionary::new()));
    }
    let metadata = root_dict.get_mut("metadata").ok_or(AppError::ParseError(
        "failed to create metadata section".to_string(),
    ))?;
    let metadata_dict = metadata.as_dictionary_mut().ok_or(AppError::ParseError(
        "metadata section must be dictionary".to_string(),
    ))?;
    metadata_dict.insert(
        "size".to_string(),
        Value::String(
            format!("{{{},{} }}", packed_width.max(1), packed_height.max(1)).replace(" ", ""),
        ),
    );

    Ok((
        atlas,
        packed_width.max(1),
        packed_height.max(1),
        placements.len(),
        issues,
    ))
}

fn direct_plist_files_inner(source_dir: &Path) -> Result<Vec<PathBuf>, AppError> {
    let mut files: Vec<PathBuf> = fs::read_dir(source_dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case("plist"))
                    .unwrap_or(false)
        })
        .collect();
    files.sort();
    Ok(files)
}

fn resolve_target_width(
    placements: &[SpritePlacement],
    dimensions: Option<&DimensionOverride>,
) -> u32 {
    if let Some(value) = dimensions {
        return value.width.max(2);
    }

    if placements.is_empty() {
        return 2;
    }

    let total_area: u64 = placements
        .iter()
        .map(|placement| {
            let sw = placement.width.saturating_add(PACK_SPRITE_INTER_GAP_PX);
            let sh = placement.height.saturating_add(PACK_SPRITE_INTER_GAP_PX);
            u64::from(sw) * u64::from(sh)
        })
        .sum();
    let largest_slot_width = placements
        .iter()
        .map(|placement| placement.width.saturating_add(PACK_SPRITE_INTER_GAP_PX))
        .max()
        .unwrap_or(1);

    let sqrt_area = (total_area as f64).sqrt().ceil() as u32;
    let estimated = sqrt_area.saturating_add(2);
    estimated.max(largest_slot_width.saturating_add(2))
}

/// MaxRects bin packing (Jukka Jylhä): Best Area Fit + split-free-node + prune.
/// Each slot is `w + gap` × `h + gap` with `(x,y)` the top-left where the sprite is drawn;
/// the extra `gap` column/row is the shared transparent seam to the next rect. Atlas outer
/// margin: 1px; atlas size = max edges + 1.
fn pack_sprites_maxrects(placements: &mut [SpritePlacement], target_width: u32) -> (u32, u32) {
    placements.sort_by(|left, right| {
        let left_area = u64::from(left.width) * u64::from(left.height);
        let right_area = u64::from(right.width) * u64::from(right.height);
        right_area
            .cmp(&left_area)
            .then_with(|| right.height.cmp(&left.height))
            .then_with(|| right.width.cmp(&left.width))
    });

    let min_width = placements
        .iter()
        .map(|placement| placement.width.saturating_add(PACK_SPRITE_INTER_GAP_PX))
        .max()
        .unwrap_or(1)
        .saturating_add(2);
    let packing_width = target_width.max(min_width);

    if placements.is_empty() {
        return (2, 2);
    }

    let inner_w = packing_width.saturating_sub(2).max(1);
    const INITIAL_FREE_HEIGHT: u32 = 16_777_216;

    let mut free_rects: Vec<FreeRect> = vec![FreeRect {
        x: 1,
        y: 1,
        w: inner_w,
        h: INITIAL_FREE_HEIGHT,
    }];

    let mut max_right = 1_u32;
    let mut max_bottom = 1_u32;

    for placement in placements.iter_mut() {
        let pw = placement.width.saturating_add(PACK_SPRITE_INTER_GAP_PX);
        let ph = placement.height.saturating_add(PACK_SPRITE_INTER_GAP_PX);

        let mut expansions = 0_u32;
        let (px, py) = loop {
            if let Some(pos) = find_position_best_area_fit(&free_rects, pw, ph) {
                break pos;
            }
            expansions += 1;
            assert!(
                expansions < 10_000,
                "maxrects: could not place sprite {}x{} in bin width {}",
                pw,
                ph,
                packing_width
            );
            let y_band = max_bottom.max(1);
            free_rects.push(FreeRect {
                x: 1,
                y: y_band,
                w: inner_w,
                h: INITIAL_FREE_HEIGHT,
            });
        };

        placement.x = px;
        placement.y = py;

        max_right = max_right.max(px.saturating_add(pw));
        max_bottom = max_bottom.max(py.saturating_add(ph));

        let used = FreeRect {
            x: px,
            y: py,
            w: pw,
            h: ph,
        };

        maxrects_place_rect(&mut free_rects, used);
    }

    (
        max_right.saturating_add(1).max(2),
        max_bottom.saturating_add(1).max(2),
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct FreeRect {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

fn maxrects_place_rect(free_rects: &mut Vec<FreeRect>, used: FreeRect) {
    let mut next: Vec<FreeRect> = Vec::new();
    for free in free_rects.drain(..) {
        if !free_rect_intersects(free, used) {
            next.push(free);
            continue;
        }
        maxrects_split_free_node(free, used, &mut next);
    }
    *free_rects = next;
    prune_free_list(free_rects);
}

fn free_rect_intersects(a: FreeRect, b: FreeRect) -> bool {
    !(a.x >= b.x.saturating_add(b.w)
        || b.x >= a.x.saturating_add(a.w)
        || a.y >= b.y.saturating_add(b.h)
        || b.y >= a.y.saturating_add(a.h))
}

fn find_position_best_area_fit(
    free_rects: &[FreeRect],
    width: u32,
    height: u32,
) -> Option<(u32, u32)> {
    let mut best_area_fit: u64 = u64::MAX;
    let mut best_short_side: u32 = u32::MAX;
    let mut best_x = 0_u32;
    let mut best_y = 0_u32;
    let mut found = false;

    for free in free_rects {
        if free.w < width || free.h < height {
            continue;
        }
        let free_area = u64::from(free.w) * u64::from(free.h);
        let rect_area = u64::from(width) * u64::from(height);
        let area_fit = free_area.saturating_sub(rect_area);
        let short_side = (free.w - width).min(free.h - height);
        if area_fit < best_area_fit || (area_fit == best_area_fit && short_side < best_short_side) {
            best_area_fit = area_fit;
            best_short_side = short_side;
            best_x = free.x;
            best_y = free.y;
            found = true;
        }
    }

    if found {
        Some((best_x, best_y))
    } else {
        None
    }
}

/// Split `free` around `used` when they overlap; append new free rects to `out`.
fn maxrects_split_free_node(free: FreeRect, used: FreeRect, out: &mut Vec<FreeRect>) {
    if used.x < free.x.saturating_add(free.w) && used.x.saturating_add(used.w) > free.x {
        if used.y > free.y && used.y < free.y.saturating_add(free.h) {
            let mut new_node = free;
            new_node.h = used.y.saturating_sub(new_node.y);
            if new_node.h > 0 {
                out.push(new_node);
            }
        }
        if used.y.saturating_add(used.h) < free.y.saturating_add(free.h) {
            let mut new_node = free;
            new_node.y = used.y.saturating_add(used.h);
            new_node.h = free.y.saturating_add(free.h).saturating_sub(new_node.y);
            if new_node.h > 0 {
                out.push(new_node);
            }
        }
    }

    if used.y < free.y.saturating_add(free.h) && used.y.saturating_add(used.h) > free.y {
        if used.x > free.x && used.x < free.x.saturating_add(free.w) {
            let mut new_node = free;
            new_node.w = used.x.saturating_sub(new_node.x);
            if new_node.w > 0 {
                out.push(new_node);
            }
        }
        if used.x.saturating_add(used.w) < free.x.saturating_add(free.w) {
            let mut new_node = free;
            new_node.x = used.x.saturating_add(used.w);
            new_node.w = free.x.saturating_add(free.w).saturating_sub(new_node.x);
            if new_node.w > 0 {
                out.push(new_node);
            }
        }
    }
}

fn prune_free_list(free_rects: &mut Vec<FreeRect>) {
    let snapshot = free_rects.clone();
    free_rects.retain(|&rect| {
        !snapshot
            .iter()
            .any(|&other| other != rect && rect_contained_in(rect, other))
    });
}

fn rect_contained_in(inner: FreeRect, outer: FreeRect) -> bool {
    inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x.saturating_add(inner.w) <= outer.x.saturating_add(outer.w)
        && inner.y.saturating_add(inner.h) <= outer.y.saturating_add(outer.h)
}

struct TrimResult {
    image: RgbaImage,
    left: u32,
    top: u32,
    right: u32,
    bottom: u32,
}

/// Trim fully transparent rows/columns and fold the insets into `spriteOffset`
/// (same adjustment the merger applies when packing).
pub(crate) fn apply_alpha_trim_to_frame_dict(
    frame_dict: &mut Dictionary,
    rgba: RgbaImage,
) -> RgbaImage {
    let trimmed = trim_transparent_edges(&rgba);
    let original_offset = get_pair_signed(frame_dict, "spriteOffset").unwrap_or((0.0, 0.0));
    let adjusted_offset = (
        original_offset.0 + (trimmed.left as f32 / 2.0) - (trimmed.right as f32 / 2.0),
        original_offset.1 - (trimmed.top as f32 / 2.0) + (trimmed.bottom as f32 / 2.0),
    );
    frame_dict.insert(
        "spriteOffset".to_string(),
        Value::String(format!(
            "{{{:.3},{:.3}}}",
            adjusted_offset.0, adjusted_offset.1
        )),
    );
    trimmed.image
}

/// Public trim used by the sprite hash index (same opaque-crop rules as merge).
pub fn trim_transparent_rgba(image: &RgbaImage) -> RgbaImage {
    trim_transparent_edges(image).image
}

fn trim_transparent_edges(image: &RgbaImage) -> TrimResult {
    let width = image.width();
    let height = image.height();
    if width == 0 || height == 0 {
        return TrimResult {
            image: RgbaImage::from_pixel(1, 1, Rgba([0, 0, 0, 0])),
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
            let alpha = image.get_pixel(x, y).0[3];
            if alpha == 0 {
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
        return TrimResult {
            image: RgbaImage::from_pixel(1, 1, Rgba([0, 0, 0, 0])),
            left: 0,
            top: 0,
            right: width.saturating_sub(1),
            bottom: height.saturating_sub(1),
        };
    }

    let trimmed_width = max_x.saturating_sub(min_x) + 1;
    let trimmed_height = max_y.saturating_sub(min_y) + 1;
    let cropped =
        image::imageops::crop_imm(image, min_x, min_y, trimmed_width, trimmed_height).to_image();
    TrimResult {
        image: cropped,
        left: min_x,
        top: min_y,
        right: width.saturating_sub(max_x + 1),
        bottom: height.saturating_sub(max_y + 1),
    }
}

fn get_pair_signed(dict: &Dictionary, key: &str) -> Result<(f32, f32), AppError> {
    let raw = dict
        .get(key)
        .and_then(Value::as_string)
        .ok_or_else(|| AppError::ParseError(format!("missing `{key}` in plist frame")))?;
    parse_pair_signed(raw)
}

fn parse_pair_signed(value: &str) -> Result<(f32, f32), AppError> {
    let cleaned = value.replace(['{', '}'], "");
    let mut parts = cleaned.split(',').map(str::trim);
    let x = parts
        .next()
        .ok_or_else(|| AppError::ParseError("missing x value".to_string()))?
        .parse::<f32>()
        .map_err(|_| AppError::ParseError("invalid x value".to_string()))?;
    let y = parts
        .next()
        .ok_or_else(|| AppError::ParseError("missing y value".to_string()))?
        .parse::<f32>()
        .map_err(|_| AppError::ParseError("invalid y value".to_string()))?;
    Ok((x, y))
}

fn resolve_sprite_path(source_dir: &Path, frame_name: &str) -> Option<PathBuf> {
    let normalized = frame_name
        .replace('\\', "/")
        .trim_start_matches("./")
        .trim_start_matches('/')
        .to_string();

    let Ok(relative) = path_from_slashes(&normalized) else {
        return None;
    };
    let direct = source_dir.join(&relative);
    if direct.exists() {
        return Some(direct);
    }

    // Common case for icon-based sheets where frame keys may include `icons/` or folder prefixes.
    let mut prefixes: Vec<String> = Vec::new();
    if let Some(dir_name) = source_dir.file_name().and_then(|v| v.to_str()) {
        if !dir_name.is_empty() {
            prefixes.push(format!("{dir_name}/"));
        }
    }
    if let Some(parent_name) = source_dir
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
                let trimmed_path = source_dir.join(trimmed_rel);
                if trimmed_path.exists() {
                    return Some(trimmed_path);
                }
            }
        }
    }

    if let Some(file_name_only) = normalized.rsplit('/').next() {
        if is_safe_path_segment(file_name_only) {
            let direct_filename = source_dir.join(file_name_only);
            if direct_filename.exists() {
                return Some(direct_filename);
            }
            if let Some(found) = recursive_find_file_named(source_dir, file_name_only) {
                return Some(found);
            }
        }
    }

    // Robust fallback: drop leading path segments progressively
    // (e.g. icons/foo.png, pack/icons/foo.png, etc.) until a file exists.
    let parts: Vec<&str> = normalized.split('/').filter(|p| !p.is_empty()).collect();
    if parts.len() > 1 {
        for start in 1..parts.len() {
            let remainder = parts[start..].join("/");
            if let Ok(remainder_rel) = path_from_slashes(&remainder) {
                let candidate = source_dir.join(remainder_rel);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    None
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
