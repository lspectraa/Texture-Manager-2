use std::collections::{BTreeMap, HashSet, VecDeque};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use image::imageops::{overlay, replace as blit_replace, rotate90};
use image::{DynamicImage, Rgba, RgbaImage};
use plist::{Dictionary, Value};

use crate::core::contracts::{
    phase_defaults, ConvertToNewVersionOptions, MergerOptions, OperationPlan, SplitterOptions,
};
use crate::core::discovery::{discover_unpaired_pngs, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::game_files::{
    discover_sheet_pairs_with_game_plist_fallback, find_current_sheet_for_input,
    normalize_legacy_version, sheet_uses_external_plist, GameFilesLayout,
};
use crate::core::image_alpha::clear_orthogonally_isolated_pixels;
use crate::core::merger::{apply_alpha_trim_to_frame_dict, merge_plist_from_memory};
use crate::core::plist::{
    count_frames_in_plist, denormalize_plist_if_format2, force_plist_frames_to_format3,
    normalize_plist_frames_to_format3,
};
use crate::core::porter::flattened_bundle_output_dir;
use crate::core::report::{OperationProgress, OperationReport, ReportIssue, ReportLevel};
use crate::core::splitter::{extract_frame_image, SplitMemoryResult};

fn progress_total_as_u32(total: usize) -> u32 {
    total.max(1).min(u32::MAX as usize) as u32
}

fn progress_done_as_u32(done: usize, total: usize) -> u32 {
    done.min(total.max(1)).min(u32::MAX as usize) as u32
}

fn operation_progress(
    gamesheet_name: String,
    sprites_done: usize,
    sprites_total: usize,
    plists_done: u32,
    plists_total: u32,
) -> OperationProgress {
    OperationProgress {
        gamesheet_name,
        sprites_completed: progress_done_as_u32(sprites_done, sprites_total),
        sprites_total: progress_total_as_u32(sprites_total),
        plists_completed: plists_done,
        plists_total,
    }
}

fn check_cancel(cancel: &AtomicBool) -> Result<(), AppError> {
    if cancel.load(Ordering::Relaxed) {
        return Err(AppError::Cancelled);
    }
    Ok(())
}

fn sheet_input_weight_bytes(pair: &SheetCandidate) -> u64 {
    let plist_bytes = fs::metadata(&pair.plist_path).map(|m| m.len()).unwrap_or(0);
    let png_bytes = fs::metadata(&pair.png_path).map(|m| m.len()).unwrap_or(0);
    plist_bytes.saturating_add(png_bytes)
}

fn scope_run_weighted_job_queue<J, R>(
    jobs: Vec<(u64, J)>,
    concurrency: u32,
    cancel: Arc<AtomicBool>,
    work: Arc<dyn Fn(J) -> R + Send + Sync>,
) -> Result<Vec<R>, AppError>
where
    J: Send + 'static,
    R: Send + 'static,
{
    let mut sorted = jobs;
    sorted.sort_by_key(|(w, _)| *w);
    let worker_count = concurrency.max(1).min(64) as usize;
    let large_worker_count = (worker_count + 1) / 2;
    let small_worker_count = worker_count.saturating_sub(large_worker_count);
    let queue: Arc<Mutex<VecDeque<(u64, J)>>> = Arc::new(Mutex::new(VecDeque::from(sorted)));
    let results: Arc<Mutex<Vec<R>>> = Arc::new(Mutex::new(Vec::new()));
    let results_for_workers = Arc::clone(&results);

    thread::scope(|scope| -> Result<(), AppError> {
        let mut handles = Vec::with_capacity(worker_count);
        for _ in 0..large_worker_count {
            let cancel = Arc::clone(&cancel);
            let queue = Arc::clone(&queue);
            let results = Arc::clone(&results_for_workers);
            let work = Arc::clone(&work);
            handles.push(scope.spawn(move || -> Result<(), AppError> {
                loop {
                    check_cancel(cancel.as_ref())?;
                    let job = {
                        let mut q = queue.lock().unwrap();
                        q.pop_back().or_else(|| q.pop_front()).map(|(_, j)| j)
                    };
                    let Some(job) = job else {
                        break;
                    };
                    check_cancel(cancel.as_ref())?;
                    let out = work(job);
                    results.lock().unwrap().push(out);
                }
                Ok(())
            }));
        }
        for _ in 0..small_worker_count {
            let cancel = Arc::clone(&cancel);
            let queue = Arc::clone(&queue);
            let results = Arc::clone(&results_for_workers);
            let work = Arc::clone(&work);
            handles.push(scope.spawn(move || -> Result<(), AppError> {
                loop {
                    check_cancel(cancel.as_ref())?;
                    let job = {
                        let mut q = queue.lock().unwrap();
                        q.pop_front().or_else(|| q.pop_back()).map(|(_, j)| j)
                    };
                    let Some(job) = job else {
                        break;
                    };
                    check_cancel(cancel.as_ref())?;
                    let out = work(job);
                    results.lock().unwrap().push(out);
                }
                Ok(())
            }));
        }

        for handle in handles {
            match handle.join() {
                Ok(Ok(())) => {}
                Ok(Err(e)) => return Err(e),
                Err(_) => {
                    return Err(AppError::IoError(
                        "weighted job queue worker thread panicked".to_string(),
                    ))
                }
            }
        }
        Ok(())
    })?;

    let taken = std::mem::take(&mut *results.lock().unwrap());
    Ok(taken)
}

fn frames_dictionary<'a>(plist_root: &'a Value) -> Result<&'a Dictionary, AppError> {
    plist_root
        .as_dictionary()
        .and_then(|root| root.get("frames"))
        .and_then(Value::as_dictionary)
        .ok_or_else(|| {
            AppError::ParseError("plist missing top-level `frames` dictionary".to_string())
        })
}

fn frames_dictionary_mut<'a>(plist_root: &'a mut Value) -> Result<&'a mut Dictionary, AppError> {
    plist_root
        .as_dictionary_mut()
        .and_then(|root| root.get_mut("frames"))
        .and_then(Value::as_dictionary_mut)
        .ok_or_else(|| {
            AppError::ParseError("plist missing top-level `frames` dictionary".to_string())
        })
}

fn frame_name_set(plist_root: &Value) -> Result<HashSet<String>, AppError> {
    let frames = frames_dictionary(plist_root)?;
    Ok(frames.keys().cloned().collect())
}

pub(crate) fn missing_frame_keys(
    latest_frames: &Dictionary,
    input_frame_names: &HashSet<String>,
) -> Vec<String> {
    let mut missing: Vec<String> = latest_frames
        .keys()
        .filter(|name| !input_frame_names.contains(*name))
        .cloned()
        .collect();
    missing.sort();
    missing
}

/// Copy missing latest-version frames into an already-upscaled in-memory sheet.
/// Does not pack or save; caller merges once.
pub(crate) fn insert_missing_latest_frames(
    output_stem: &str,
    relative_dir: &Path,
    plist_root: &mut Value,
    sprites: &mut BTreeMap<String, RgbaImage>,
    game_files: &GameFilesLayout,
    splitter_opts: &SplitterOptions,
) -> Result<(usize, Vec<ReportIssue>), AppError> {
    let mut issues = Vec::new();
    let input_names = frame_name_set(plist_root)?;
    let Some(latest_pair) = find_current_sheet_for_input(game_files, relative_dir, output_stem)?
    else {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "no latest placeholder plist found for sheet".to_string(),
            file: Some(format!("{output_stem}.plist")),
        });
        return Ok((0, issues));
    };

    let mut latest_plist = load_plist_normalized(&latest_pair.plist_path)?;
    let missing = {
        let latest_frames = frames_dictionary(&latest_plist)?;
        missing_frame_keys(latest_frames, &input_names)
    };
    if missing.is_empty() {
        return Ok((0, issues));
    }

    let latest_image = open_sheet_image(&latest_pair.png_path)?;
    let mut extracted =
        extract_named_frames(&latest_image, &mut latest_plist, &missing, splitter_opts)?;
    drop(latest_image);

    let mut additions: Vec<(String, Value, RgbaImage)> = Vec::new();
    for name in &missing {
        let Some(sprite) = extracted.remove(name) else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "missing sprite payload in latest placeholder image".to_string(),
                file: Some(name.clone()),
            });
            continue;
        };
        let Some(frame_value) = frames_dictionary(&latest_plist)?.get(name).cloned() else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "missing sprite payload in latest placeholder plist".to_string(),
                file: Some(name.clone()),
            });
            continue;
        };
        additions.push((name.clone(), frame_value, sprite));
    }

    let added = additions.len();
    {
        let frames_mut = frames_dictionary_mut(plist_root)?;
        for (name, frame_value, sprite) in additions {
            frames_mut.insert(name.clone(), frame_value);
            sprites.insert(name, sprite);
        }
    }
    if added > 0 {
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message: format!(
                "copied {added} missing frame(s) from latest Geometry Dash Resources"
            ),
            file: Some(format!("{output_stem}.plist")),
        });
    }
    Ok((added, issues))
}

const APPEND_SPRITE_GAP_PX: u32 = 1;

fn load_plist_normalized(path: &Path) -> Result<Value, AppError> {
    let mut root = Value::from_file(path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    normalize_plist_frames_to_format3(&mut root);
    Ok(root)
}

fn open_sheet_image(path: &Path) -> Result<DynamicImage, AppError> {
    image::open(path).map_err(|err| {
        AppError::ParseError(format!(
            "failed to open png `{}`: {err}",
            path.to_string_lossy()
        ))
    })
}

fn emit_convert_progress<F>(
    on_progress: &Arc<Mutex<F>>,
    label: String,
    completed: &AtomicUsize,
    total_units: usize,
    plists_done: u32,
    plists_total: u32,
) where
    F: FnMut(OperationProgress) + Send + ?Sized,
{
    on_progress.lock().unwrap()(operation_progress(
        label,
        completed.load(Ordering::Relaxed),
        total_units,
        plists_done,
        plists_total,
    ));
}

fn extract_named_frames(
    source_image: &DynamicImage,
    plist_root: &mut Value,
    names: &[String],
    splitter_opts: &SplitterOptions,
) -> Result<BTreeMap<String, RgbaImage>, AppError> {
    let frames = frames_dictionary_mut(plist_root)?;
    let mut sprites: BTreeMap<String, RgbaImage> = BTreeMap::new();
    for name in names {
        let Some(frame_value) = frames.get_mut(name) else {
            continue;
        };
        let Some(frame_dict) = frame_value.as_dictionary_mut() else {
            continue;
        };
        match extract_frame_image(source_image, frame_dict, splitter_opts) {
            Ok(extracted) => {
                sprites.insert(name.clone(), extracted.to_rgba8());
            }
            Err(_) => {}
        }
    }
    Ok(sprites)
}

struct PreparedAppendSprite {
    name: String,
    image: RgbaImage,
    width: u32,
    height: u32,
    frame_value: Value,
}

fn prepare_append_sprite(
    name: String,
    mut frame_value: Value,
    rgba: RgbaImage,
) -> Option<PreparedAppendSprite> {
    let Some(frame_dict) = frame_value.as_dictionary_mut() else {
        return None;
    };
    let mut rgba = clear_orthogonally_isolated_pixels(&rgba);
    rgba = apply_alpha_trim_to_frame_dict(frame_dict, rgba);
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
    Some(PreparedAppendSprite {
        name,
        image: rgba,
        width,
        height,
        frame_value,
    })
}

fn append_sprites_below_atlas(
    atlas: RgbaImage,
    sprites: Vec<PreparedAppendSprite>,
    plist_root: &mut Value,
) -> Result<RgbaImage, AppError> {
    if sprites.is_empty() {
        return Ok(atlas);
    }

    let min_width = sprites
        .iter()
        .map(|sprite| sprite.width.saturating_add(APPEND_SPRITE_GAP_PX))
        .max()
        .unwrap_or(1)
        .saturating_add(2);
    let packing_width = atlas.width().max(min_width).max(2);

    let mut cursor_x = 1_u32;
    let mut band_y = 0_u32;
    let mut row_h = 0_u32;
    let mut placements: Vec<(u32, u32)> = Vec::with_capacity(sprites.len());
    for sprite in &sprites {
        let slot_w = sprite.width.saturating_add(APPEND_SPRITE_GAP_PX);
        let slot_h = sprite.height.saturating_add(APPEND_SPRITE_GAP_PX);
        if cursor_x > 1 && cursor_x.saturating_add(slot_w).saturating_add(1) > packing_width {
            cursor_x = 1;
            band_y = band_y.saturating_add(row_h);
            row_h = 0;
        }
        placements.push((cursor_x, band_y));
        cursor_x = cursor_x.saturating_add(slot_w);
        row_h = row_h.max(slot_h);
    }
    let band_h = band_y.saturating_add(row_h).saturating_add(1).max(1);
    let new_height = atlas.height().saturating_add(band_h).max(1);
    let mut out = RgbaImage::from_pixel(packing_width, new_height, Rgba([0, 0, 0, 0]));
    overlay(&mut out, &atlas, 0, 0);

    let y_offset = atlas.height();
    {
        let frames_mut = frames_dictionary_mut(plist_root)?;
        for (sprite, (px, py)) in sprites.into_iter().zip(placements) {
            let draw_x = px;
            let draw_y = y_offset.saturating_add(py);
            overlay(
                &mut out,
                &sprite.image,
                i64::from(draw_x),
                i64::from(draw_y),
            );
            let mut frame_value = sprite.frame_value;
            if let Some(frame_dict) = frame_value.as_dictionary_mut() {
                frame_dict.insert(
                    "textureRect".to_string(),
                    Value::String(
                        format!(
                            "{{{{{},{}}},{{{},{} }}}}",
                            draw_x, draw_y, sprite.width, sprite.height
                        )
                        .replace(" ", ""),
                    ),
                );
            }
            frames_mut.insert(sprite.name, frame_value);
        }
    }

    let root_dict = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    if !root_dict.contains_key("metadata") {
        root_dict.insert("metadata".to_string(), Value::Dictionary(Dictionary::new()));
    }
    let metadata = root_dict
        .get_mut("metadata")
        .ok_or_else(|| AppError::ParseError("failed to create metadata section".to_string()))?;
    let metadata_dict = metadata
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("metadata section must be dictionary".to_string()))?;
    metadata_dict.insert(
        "size".to_string(),
        Value::String(format!("{{{},{} }}", packing_width, new_height).replace(" ", "")),
    );
    denormalize_plist_if_format2(plist_root);
    Ok(out)
}

fn parse_plist_numbers(value: &str) -> Vec<f32> {
    let mut cleaned = String::with_capacity(value.len());
    for ch in value.chars() {
        if !matches!(ch, '{' | '}') {
            cleaned.push(ch);
        }
    }
    cleaned
        .split(',')
        .filter_map(|part| part.trim().parse::<f32>().ok())
        .collect()
}

fn parse_frame_texture_rect(frame: &Dictionary) -> Option<(u32, u32, u32, u32, bool)> {
    let raw = frame.get("textureRect").and_then(Value::as_string)?;
    let numbers = parse_plist_numbers(raw);
    if numbers.len() != 4 {
        return None;
    }
    let rotated = frame
        .get("textureRotated")
        .and_then(Value::as_boolean)
        .unwrap_or(false);
    Some((
        numbers[0].ceil().max(0.0) as u32,
        numbers[1].ceil().max(0.0) as u32,
        numbers[2].floor().max(1.0) as u32,
        numbers[3].floor().max(1.0) as u32,
        rotated,
    ))
}

fn clear_atlas_rect(atlas: &mut RgbaImage, x: u32, y: u32, width: u32, height: u32) {
    let max_x = x.saturating_add(width).min(atlas.width());
    let max_y = y.saturating_add(height).min(atlas.height());
    for py in y..max_y {
        for px in x..max_x {
            atlas.put_pixel(px, py, Rgba([0, 0, 0, 0]));
        }
    }
}

fn update_plist_metadata_size(plist_root: &mut Value, width: u32, height: u32) -> Result<(), AppError> {
    let root_dict = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    if !root_dict.contains_key("metadata") {
        root_dict.insert("metadata".to_string(), Value::Dictionary(Dictionary::new()));
    }
    let metadata = root_dict
        .get_mut("metadata")
        .ok_or_else(|| AppError::ParseError("failed to create metadata section".to_string()))?;
    let metadata_dict = metadata
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("metadata section must be dictionary".to_string()))?;
    metadata_dict.insert(
        "size".to_string(),
        Value::String(format!("{{{},{}}}", width, height)),
    );
    Ok(())
}

/// Paint replacement sprites into existing `textureRect` slots instead of packing a new band.
fn replace_sprites_in_atlas(
    mut atlas: RgbaImage,
    sprites: Vec<PreparedAppendSprite>,
    plist_root: &mut Value,
) -> Result<RgbaImage, AppError> {
    if sprites.is_empty() {
        return Ok(atlas);
    }

    struct Slot {
        sprite: PreparedAppendSprite,
        x: u32,
        y: u32,
        old_w: u32,
        old_h: u32,
        rotated: bool,
    }

    let mut slots = Vec::with_capacity(sprites.len());
    {
        let frames = frames_dictionary(plist_root)?;
        for sprite in sprites {
            let Some(existing) = frames.get(&sprite.name).and_then(Value::as_dictionary) else {
                continue;
            };
            let Some((x, y, old_w, old_h, rotated)) = parse_frame_texture_rect(existing) else {
                continue;
            };
            slots.push(Slot {
                sprite,
                x,
                y,
                old_w,
                old_h,
                rotated,
            });
        }
    }

    let mut packed_images: Vec<RgbaImage> = Vec::with_capacity(slots.len());
    let mut need_w = atlas.width();
    let mut need_h = atlas.height();
    for slot in &slots {
        let packed = if slot.rotated {
            rotate90(&slot.sprite.image)
        } else {
            slot.sprite.image.clone()
        };
        need_w = need_w.max(slot.x.saturating_add(packed.width()));
        need_h = need_h.max(slot.y.saturating_add(packed.height()));
        packed_images.push(packed);
    }

    if need_w > atlas.width() || need_h > atlas.height() {
        let mut grown = RgbaImage::from_pixel(need_w, need_h, Rgba([0, 0, 0, 0]));
        overlay(&mut grown, &atlas, 0, 0);
        atlas = grown;
    }

    {
        let frames_mut = frames_dictionary_mut(plist_root)?;
        for (slot, packed) in slots.into_iter().zip(packed_images) {
            clear_atlas_rect(&mut atlas, slot.x, slot.y, slot.old_w, slot.old_h);
            blit_replace(&mut atlas, &packed, i64::from(slot.x), i64::from(slot.y));
            let packed_w = packed.width().max(1);
            let packed_h = packed.height().max(1);
            let mut frame_value = slot.sprite.frame_value;
            if let Some(frame_dict) = frame_value.as_dictionary_mut() {
                frame_dict.insert(
                    "textureRect".to_string(),
                    Value::String(format!(
                        "{{{{{},{}}},{{{},{}}}}}",
                        slot.x, slot.y, packed_w, packed_h
                    )),
                );
                frame_dict.insert("textureRotated".to_string(), Value::Boolean(slot.rotated));
            }
            frames_mut.insert(slot.sprite.name, frame_value);
        }
    }

    update_plist_metadata_size(plist_root, atlas.width(), atlas.height())?;
    denormalize_plist_if_format2(plist_root);
    Ok(atlas)
}

pub(crate) fn sheet_is_under_icons(relative_dir: &Path) -> bool {
    relative_dir.components().any(|component| match component {
        Component::Normal(name) => name.to_string_lossy().eq_ignore_ascii_case("icons"),
        _ => false,
    })
}

/// Returns the graphics-tier suffix when `stem` is a legacy combined icon gamesheet.
pub(crate) fn is_legacy_combined_icon_sheet(stem: &str) -> Option<String> {
    let lower = stem.to_ascii_lowercase();
    if lower == "gj_gamesheet02" {
        return Some(String::new());
    }
    if lower == "gj_gamesheet02-uhd" {
        return Some("-uhd".to_string());
    }
    if lower == "gj_gamesheet02-hd" {
        return Some("-hd".to_string());
    }
    None
}

/// Returns the graphics-tier suffix when `stem` is the legacy combined icon glow sheet.
pub(crate) fn is_legacy_icon_glow_sheet(stem: &str) -> Option<String> {
    let lower = stem.to_ascii_lowercase();
    if lower == "gj_gamesheetglow" {
        return Some(String::new());
    }
    if lower == "gj_gamesheetglow-uhd" {
        return Some("-uhd".to_string());
    }
    if lower == "gj_gamesheetglow-hd" {
        return Some("-hd".to_string());
    }
    None
}

pub(crate) fn is_excluded_legacy_icon_id(icon_id: &str) -> bool {
    let lower = icon_id.to_ascii_lowercase();
    lower.starts_with("portal_")
        || lower.starts_with("boost_")
        || lower.starts_with("checkpoint_")
        || lower.starts_with("floorline_")
}

fn is_non_icon_legacy_sheet_id(icon_id: &str) -> bool {
    icon_id.to_ascii_lowercase().starts_with("secretcoin_")
}

/// Legacy combined-icon GS02 split applies when converting from 2.0 or 2.11 packs.
/// 2.2 official packs already use `icons/`; some 2.2 packs still follow the old
/// GS02 layout and are detected separately via [`plist_contains_legacy_icon_frames`].
pub(crate) fn is_legacy_icon_split_version(game_version: &str) -> bool {
    matches!(
        normalize_legacy_version(game_version).as_str(),
        "2.0" | "2.11"
    )
}

pub(crate) fn is_known_legacy_icon_kind(kind: &str) -> bool {
    matches!(
        kind,
        "player"
            | "ship"
            | "ufo"
            | "bird"
            | "dart"
            | "robot"
            | "spider"
            | "swing"
            | "jetpack"
            | "cube"
    )
}

/// True when a gamesheet stem is the pre-`icons/` combined icon atlas (or its glow sheet).
pub(crate) fn sheet_may_hold_legacy_icons(stem: &str) -> bool {
    is_legacy_combined_icon_sheet(stem).is_some() || is_legacy_icon_glow_sheet(stem).is_some()
}

/// True when a plist still stores cube/ship/etc. frames (2.1 / old-convention 2.2 GS02).
pub(crate) fn plist_contains_legacy_icon_frames(plist_path: &Path) -> bool {
    let Ok(root) = Value::from_file(plist_path) else {
        return false;
    };
    let Ok(frames) = frames_dictionary(&root) else {
        return false;
    };
    frames
        .keys()
        .any(|name| is_icon_sprite(Path::new(""), name))
}

pub(crate) fn pack_uses_legacy_combined_icons(sheet_pairs: &[SheetCandidate]) -> bool {
    sheet_pairs.iter().any(|pair| {
        sheet_may_hold_legacy_icons(&pair.stem)
            && plist_contains_legacy_icon_frames(&pair.plist_path)
    })
}

pub(crate) fn is_glow_frame_name(frame_name: &str) -> bool {
    frame_name.contains("_glow_")
}

pub(crate) fn is_fireboost_frame_name(frame_name: &str) -> bool {
    frame_name.eq_ignore_ascii_case("fireBoost_001.png")
}

/// 2.0 menu buttons that live on `GJ_GameSheet04` in current Geometry Dash.
pub(crate) const GAMESHEET04_MOVED_FRAMES: &[&str] = &[
    "GJ_featuredBtn_001.png",
    "GJ_searchBtn_001.png",
    "GJ_highscoreBtn_001.png",
    "GJ_mapPacksBtn_001.png",
    "GJ_createBtn_001.png",
    "GJ_savedBtn_001.png",
];

pub(crate) fn is_gamesheet04_moved_frame(frame_name: &str) -> bool {
    GAMESHEET04_MOVED_FRAMES
        .iter()
        .any(|name| name.eq_ignore_ascii_case(frame_name))
}

pub(crate) fn is_gamesheet04_stem(stem: &str) -> bool {
    let lower = stem.to_ascii_lowercase();
    lower == "gj_gamesheet04" || lower.starts_with("gj_gamesheet04-")
}

pub(crate) fn is_convert_from_2_0(game_version: &str) -> bool {
    normalize_legacy_version(game_version) == "2.0"
}

pub(crate) fn take_gamesheet04_menu_buttons(
    plist_root: &mut Value,
    sprites: &mut BTreeMap<String, RgbaImage>,
) -> BTreeMap<String, (Value, RgbaImage)> {
    let names: Vec<String> = sprites
        .keys()
        .filter(|name| is_gamesheet04_moved_frame(name))
        .cloned()
        .collect();
    let mut taken = BTreeMap::new();
    if names.is_empty() {
        return taken;
    }
    let Ok(frames) = frames_dictionary_mut(plist_root) else {
        return taken;
    };
    for name in names {
        let Some(frame_value) = frames.remove(&name) else {
            continue;
        };
        let Some(sprite) = sprites.remove(&name) else {
            frames.insert(name, frame_value);
            continue;
        };
        taken.insert(name, (frame_value, sprite));
    }
    taken
}

fn sheet_relative_path(pair: &SheetCandidate) -> PathBuf {
    if pair.relative_dir.as_os_str().is_empty() {
        PathBuf::from(&pair.stem)
    } else {
        pair.relative_dir.join(&pair.stem)
    }
}

fn write_converted_sheet_pair(
    pair: &SheetCandidate,
    converted_dir: &Path,
    plist_root: &Value,
    atlas: Option<&RgbaImage>,
) -> Result<(), AppError> {
    let destination_dir = flattened_bundle_output_dir(converted_dir, &sheet_relative_path(pair));
    if let Some(atlas) = atlas {
        save_merged_sheet(&destination_dir, pair.stem.as_str(), plist_root, atlas)?;
        return Ok(());
    }
    fs::create_dir_all(&destination_dir)?;
    fs::copy(
        &pair.png_path,
        destination_dir.join(format!("{}.png", pair.stem)),
    )?;
    let plist_path = destination_dir.join(format!("{}.plist", pair.stem));
    let mut output_plist = plist_root.clone();
    force_plist_frames_to_format3(&mut output_plist);
    output_plist
        .to_file_xml(&plist_path)
        .map_err(|err| AppError::IoError(format!("failed to write plist: {err}")))?;
    Ok(())
}

fn pack_quality_suffix(pairs: &[SheetCandidate]) -> String {
    let mut has_uhd = false;
    let mut has_hd = false;
    for pair in pairs {
        let lower = pair.stem.to_ascii_lowercase();
        if lower.contains("-uhd") {
            has_uhd = true;
        } else if lower.contains("-hd") {
            has_hd = true;
        }
    }
    if has_uhd {
        "-uhd".to_string()
    } else if has_hd {
        "-hd".to_string()
    } else {
        String::new()
    }
}

pub(crate) fn target_graphics_quality_suffix(target: crate::core::contracts::UpscalerTargetGraphics) -> &'static str {
    match target {
        crate::core::contracts::UpscalerTargetGraphics::Uhd => "-uhd",
        crate::core::contracts::UpscalerTargetGraphics::Hd => "-hd",
    }
}

/// Write modern `GJ_GameSheet04` (vanilla base + relocated 2.0 menu buttons).
pub(crate) fn write_modern_gamesheet04<F>(
    quality_suffix: &str,
    relocated: &BTreeMap<String, (Value, RgbaImage)>,
    always_write: bool,
    game_files: &GameFilesLayout,
    converted_dir: &Path,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    on_progress: &Arc<Mutex<F>>,
    issues: &mut Vec<ReportIssue>,
) -> Result<usize, AppError>
where
    F: FnMut(OperationProgress) + Send + ?Sized,
{
    if relocated.is_empty() && !always_write {
        return Ok(0);
    }

    let modern_stem = format!("GJ_GameSheet04{quality_suffix}");
    let destination_dir =
        flattened_bundle_output_dir(converted_dir, &PathBuf::from(modern_stem.as_str()));
    let dest_plist = destination_dir.join(format!("{modern_stem}.plist"));
    let dest_png = destination_dir.join(format!("{modern_stem}.png"));

    emit_convert_progress(
        on_progress,
        format!("{modern_stem} (gamesheet 04)"),
        completed,
        total_units,
        plists_done_atomic.load(Ordering::Relaxed),
        plists_total,
    );

    let existing_output = dest_plist.is_file() && dest_png.is_file();
    let source_pair = if existing_output {
        Some(SheetCandidate {
            stem: modern_stem.clone(),
            relative_dir: PathBuf::new(),
            plist_path: dest_plist.clone(),
            png_path: dest_png.clone(),
        })
    } else {
        find_current_sheet_for_input(game_files, Path::new(""), modern_stem.as_str())?
    };

    let Some(source_pair) = source_pair else {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: format!(
                "modern `{modern_stem}` not found in Geometry Dash Resources; skipped GameSheet04"
            ),
            file: None,
        });
        return Ok(0);
    };

    if relocated.is_empty() {
        fs::create_dir_all(&destination_dir)?;
        if source_pair.plist_path != dest_plist {
            fs::copy(&source_pair.plist_path, &dest_plist)?;
            fs::copy(&source_pair.png_path, &dest_png)?;
        }
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message: format!("wrote `{modern_stem}` from latest Geometry Dash Resources"),
            file: Some(format!("{modern_stem}.plist")),
        });
        let _ = plists_done_atomic.fetch_add(1, Ordering::Relaxed);
        return Ok(1);
    }

    let mut merged_plist_root = load_plist_normalized(&source_pair.plist_path)?;
    let existing_names = frame_name_set(&merged_plist_root)?;
    let mut to_replace: Vec<PreparedAppendSprite> = Vec::new();
    let mut to_append: Vec<PreparedAppendSprite> = Vec::new();
    for (frame_name, (frame_value, sprite)) in relocated {
        let source_frame = frames_dictionary(&merged_plist_root)?
            .get(frame_name)
            .cloned()
            .unwrap_or_else(|| frame_value.clone());
        let Some(prepared_sprite) =
            prepare_append_sprite(frame_name.clone(), source_frame, sprite.clone())
        else {
            continue;
        };
        if existing_names.contains(frame_name) {
            to_replace.push(prepared_sprite);
        } else {
            to_append.push(prepared_sprite);
        }
    }

    let mut atlas = open_sheet_image(&source_pair.png_path)?.to_rgba8();
    atlas = replace_sprites_in_atlas(atlas, to_replace, &mut merged_plist_root)?;
    atlas = append_sprites_below_atlas(atlas, to_append, &mut merged_plist_root)?;
    save_merged_sheet(
        &destination_dir,
        modern_stem.as_str(),
        &merged_plist_root,
        &atlas,
    )?;
    issues.push(ReportIssue {
        level: ReportLevel::Info,
        message: format!(
            "wrote `{modern_stem}` with {} relocated 2.0 menu button(s)",
            relocated.len()
        ),
        file: Some(format!("{modern_stem}.plist")),
    });
    let _ = plists_done_atomic.fetch_add(1, Ordering::Relaxed);
    Ok(1)
}

pub(crate) fn find_legacy_glow_sheet_pair<'a>(
    sheet_pairs: &'a [SheetCandidate],
    relative_dir: &Path,
    quality_suffix: &str,
) -> Option<&'a SheetCandidate> {
    let stem = format!("GJ_GameSheetGlow{quality_suffix}");
    sheet_pairs
        .iter()
        .find(|pair| pair.relative_dir == relative_dir && pair.stem.eq_ignore_ascii_case(&stem))
}

fn is_numeric_icon_token(token: &str) -> bool {
    !token.is_empty() && token.chars().all(|c| c.is_ascii_digit())
}

/// Icon sheet id from a frame key (e.g. `player_02`, `player_ball_00`, `robot_01`).
pub(crate) fn icon_sheet_id_from_frame_name(frame_name: &str) -> Option<String> {
    let stem = frame_name.strip_suffix(".png").unwrap_or(frame_name);
    let parts: Vec<&str> = stem.split('_').collect();
    if parts.len() < 2 {
        return None;
    }

    if parts[0] == "player" && parts.len() >= 3 && is_numeric_icon_token(parts[2]) {
        if !is_numeric_icon_token(parts[1]) {
            return Some(format!("{}_{}_{}", parts[0], parts[1], parts[2]));
        }
    }

    if is_numeric_icon_token(parts[1]) {
        if !is_known_legacy_icon_kind(parts[0]) {
            return None;
        }
        let icon_id = format!("{}_{}", parts[0], parts[1]);
        if is_non_icon_legacy_sheet_id(&icon_id) {
            return None;
        }
        return Some(icon_id);
    }

    None
}

/// Icon sprites in 2.2 live under `icons/`; 2.0 / 2.11 pack them into mixed gamesheets
/// (`GJ_GameSheet02`, glow sheet, etc.). Detect by folder or frame identity, not sheet filename.
pub(crate) fn is_icon_sprite(relative_dir: &Path, frame_name: &str) -> bool {
    if sheet_is_under_icons(relative_dir) {
        return true;
    }
    match icon_sheet_id_from_frame_name(frame_name) {
        Some(id) => !is_excluded_legacy_icon_id(&id),
        None => false,
    }
}

pub(crate) fn group_frame_names_by_icon_id(
    frame_names: impl IntoIterator<Item = String>,
) -> BTreeMap<String, Vec<String>> {
    let mut groups: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for frame_name in frame_names {
        if let Some(icon_id) = icon_sheet_id_from_frame_name(&frame_name) {
            groups.entry(icon_id).or_default().push(frame_name);
        }
    }
    for frames in groups.values_mut() {
        frames.sort();
    }
    groups
}

pub(crate) fn group_icon_output_frames(
    frame_names: impl IntoIterator<Item = String>,
) -> BTreeMap<String, Vec<String>> {
    group_frame_names_by_icon_id(frame_names.into_iter().filter(|frame_name| {
        !is_glow_frame_name(frame_name) && !is_fireboost_frame_name(frame_name)
    }))
    .into_iter()
    .filter(|(icon_id, _)| !is_excluded_legacy_icon_id(icon_id))
    .collect()
}

fn frame_belongs_to_extracted_icon(frame_name: &str, extracted_icon_ids: &HashSet<String>) -> bool {
    icon_sheet_id_from_frame_name(frame_name)
        .map(|icon_id| extracted_icon_ids.contains(&icon_id))
        .unwrap_or(false)
}

fn should_remove_from_legacy_gamesheet02(
    frame_name: &str,
    extracted_icon_ids: &HashSet<String>,
    exported_standalones: &HashSet<String>,
) -> bool {
    if is_fireboost_frame_name(frame_name)
        || exported_standalones.contains(frame_name)
        || is_gamesheet04_moved_frame(frame_name)
    {
        return true;
    }
    // Keep excluded types (portal/boost/…) on a rewritten GS02 when modern remerge
    // did not run; those frames are handled separately via remerge when available.
    frame_belongs_to_extracted_icon(frame_name, extracted_icon_ids)
}

fn vanilla_resources_has_standalone_png(game_files: &GameFilesLayout, frame_name: &str) -> bool {
    let stem = frame_name.strip_suffix(".png").unwrap_or(frame_name);
    ["", "-hd", "-uhd"].iter().any(|suffix| {
        game_files
            .resources
            .join(format!("{stem}{suffix}.png"))
            .is_file()
    })
}

fn export_standalone_converted_png(
    converted_dir: &Path,
    frame_name: &str,
    sprite: &RgbaImage,
) -> Result<PathBuf, AppError> {
    let output_path = converted_dir.join(frame_name);
    let cleaned = clear_orthogonally_isolated_pixels(sprite);
    crate::core::image_io::save_rgba_png_fast(&output_path, &cleaned)?;
    Ok(output_path)
}

fn should_remove_from_legacy_glow_sheet(
    frame_name: &str,
    extracted_icon_ids: &HashSet<String>,
) -> bool {
    frame_belongs_to_extracted_icon(frame_name, extracted_icon_ids)
}

fn rewrite_sheet_without_frames<F>(
    source_split: &SplitMemoryResult,
    remove_frame: &dyn Fn(&str) -> bool,
    output_stem: &str,
    relative_sheet: &Path,
    converted_dir: &Path,
    merger_opts: &MergerOptions,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    on_progress: &Arc<Mutex<F>>,
    issues: &mut Vec<ReportIssue>,
    progress_label: &str,
) -> Result<usize, AppError>
where
    F: FnMut(OperationProgress) + Send + ?Sized,
{
    let source_frames = frames_dictionary(&source_split.plist_root)?;
    let mut kept_entries: BTreeMap<String, Value> = BTreeMap::new();
    let mut kept_sprites: BTreeMap<String, RgbaImage> = BTreeMap::new();
    let mut removed = 0usize;

    for (frame_name, frame_value) in source_frames {
        if remove_frame(frame_name) {
            removed = removed.saturating_add(1);
            continue;
        }
        let Some(sprite) = source_split.sprites.get(frame_name) else {
            continue;
        };
        kept_entries.insert(frame_name.clone(), frame_value.clone());
        kept_sprites.insert(frame_name.clone(), sprite.clone());
    }

    if kept_entries.is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message: format!(
                "removed all extractable icon frames from `{output_stem}`; no remaining frames to write"
            ),
            file: Some(format!("{output_stem}.plist")),
        });
        return Ok(0);
    }

    let mut metadata = Dictionary::new();
    if let Some(source_meta) = source_split
        .plist_root
        .as_dictionary()
        .and_then(|root| root.get("metadata"))
        .and_then(Value::as_dictionary)
    {
        for key in ["format", "pixelFormat", "premultiplyAlpha"] {
            if let Some(value) = source_meta.get(key) {
                metadata.insert(key.to_string(), value.clone());
            }
        }
    }
    let texture_file = format!("{output_stem}.png");
    metadata.insert(
        "textureFileName".to_string(),
        Value::String(texture_file.clone()),
    );
    metadata.insert(
        "realTextureFileName".to_string(),
        Value::String(texture_file),
    );

    let mut frames_dict = Dictionary::new();
    for (name, value) in &kept_entries {
        frames_dict.insert(name.clone(), value.clone());
    }
    let mut root = Dictionary::new();
    root.insert("frames".to_string(), Value::Dictionary(frames_dict));
    root.insert("metadata".to_string(), Value::Dictionary(metadata));
    let mut plist_root = Value::Dictionary(root);

    let completed_ref = Arc::clone(completed);
    let on_progress_ref = Arc::clone(on_progress);
    let plists_ref = Arc::clone(plists_done_atomic);
    let label = progress_label.to_string();
    let (atlas, _w, _h, _count, merge_issues) = merge_plist_from_memory(
        &mut plist_root,
        &kept_sprites,
        label.as_str(),
        merger_opts,
        &mut |_label| {
            let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress_ref.lock().unwrap()(operation_progress(
                format!("{label} (strip icons)"),
                n,
                total_units,
                plists_ref.load(Ordering::Relaxed),
                plists_total,
            ));
        },
    )?;
    issues.extend(merge_issues);

    let destination_dir = flattened_bundle_output_dir(converted_dir, relative_sheet);
    save_merged_sheet(&destination_dir, output_stem, &plist_root, &atlas)?;
    issues.push(ReportIssue {
        level: ReportLevel::Info,
        message: format!(
            "rewrote `{output_stem}` without {removed} extracted icon-related frame(s); kept {}",
            kept_entries.len()
        ),
        file: Some(format!("{output_stem}.plist")),
    });
    Ok(1)
}

fn collect_excluded_legacy_frames(
    plist_root: &Value,
    sprites: &BTreeMap<String, RgbaImage>,
) -> Result<BTreeMap<String, (Value, RgbaImage)>, AppError> {
    let frames = frames_dictionary(plist_root)?;
    let mut excluded: BTreeMap<String, (Value, RgbaImage)> = BTreeMap::new();
    for (frame_name, frame_value) in frames {
        if is_fireboost_frame_name(frame_name) || is_glow_frame_name(frame_name) {
            continue;
        }
        let Some(icon_id) = icon_sheet_id_from_frame_name(frame_name) else {
            continue;
        };
        if !is_excluded_legacy_icon_id(&icon_id) {
            continue;
        }
        let Some(sprite) = sprites.get(frame_name) else {
            continue;
        };
        excluded.insert(frame_name.clone(), (frame_value.clone(), sprite.clone()));
    }
    Ok(excluded)
}

fn excluded_legacy_frame_names(plist_root: &Value) -> Result<Vec<String>, AppError> {
    let frames = frames_dictionary(plist_root)?;
    Ok(frames
        .keys()
        .filter(|frame_name| {
            if is_fireboost_frame_name(frame_name) || is_glow_frame_name(frame_name) {
                return false;
            }
            icon_sheet_id_from_frame_name(frame_name)
                .map(|icon_id| is_excluded_legacy_icon_id(&icon_id))
                .unwrap_or(false)
        })
        .cloned()
        .collect())
}

fn glow_frame_names_for_icon(plist_root: &Value, icon_id: &str) -> Vec<String> {
    let Ok(frames) = frames_dictionary(plist_root) else {
        return Vec::new();
    };
    frames
        .keys()
        .filter(|frame_name| {
            is_glow_frame_name(frame_name)
                && icon_sheet_id_from_frame_name(frame_name).as_deref() == Some(icon_id)
        })
        .cloned()
        .collect()
}

fn frame_values_for_names(plist_root: &Value, names: &[String]) -> BTreeMap<String, Value> {
    let Ok(frames) = frames_dictionary(plist_root) else {
        return BTreeMap::new();
    };
    let mut entries = BTreeMap::new();
    for name in names {
        if let Some(value) = frames.get(name) {
            entries.insert(name.clone(), value.clone());
        }
    }
    entries
}

fn split_memory_from_parts(
    plist_root: Value,
    sprites: BTreeMap<String, RgbaImage>,
) -> SplitMemoryResult {
    SplitMemoryResult {
        files_processed: sprites.len(),
        issues: Vec::new(),
        plist_root,
        sprites,
    }
}

fn remerge_excluded_into_modern_gamesheet02<F>(
    quality_suffix: &str,
    excluded_frames: &BTreeMap<String, (Value, RgbaImage)>,
    game_files: &GameFilesLayout,
    converted_dir: &Path,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    on_progress: &Arc<Mutex<F>>,
    issues: &mut Vec<ReportIssue>,
) -> Result<usize, AppError>
where
    F: FnMut(OperationProgress) + Send + ?Sized,
{
    if excluded_frames.is_empty() {
        return Ok(0);
    }

    let modern_stem = format!("GJ_GameSheet02{quality_suffix}");
    let Some(modern_pair) =
        find_current_sheet_for_input(game_files, Path::new(""), modern_stem.as_str())?
    else {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: format!(
                "modern `{modern_stem}` not found in Geometry Dash Resources; skipped remerging excluded frames"
            ),
            file: None,
        });
        return Ok(0);
    };

    emit_convert_progress(
        on_progress,
        format!("{modern_stem} (append excluded)"),
        completed,
        total_units,
        plists_done_atomic.load(Ordering::Relaxed),
        plists_total,
    );

    let mut merged_plist_root = load_plist_normalized(&modern_pair.plist_path)?;
    let existing_names = frame_name_set(&merged_plist_root)?;
    let mut replaced = 0usize;
    let mut added = 0usize;
    let mut prepared: Vec<PreparedAppendSprite> = Vec::new();
    for (frame_name, (frame_value, sprite)) in excluded_frames {
        if existing_names.contains(frame_name) {
            replaced = replaced.saturating_add(1);
        } else {
            added = added.saturating_add(1);
        }
        if let Some(prepared_sprite) =
            prepare_append_sprite(frame_name.clone(), frame_value.clone(), sprite.clone())
        {
            prepared.push(prepared_sprite);
        }
        let _ = completed.fetch_add(1, Ordering::Relaxed);
        emit_convert_progress(
            on_progress,
            format!("{modern_stem} (append excluded)"),
            completed,
            total_units,
            plists_done_atomic.load(Ordering::Relaxed),
            plists_total,
        );
    }

    let atlas = open_sheet_image(&modern_pair.png_path)?.to_rgba8();
    let atlas = append_sprites_below_atlas(atlas, prepared, &mut merged_plist_root)?;

    let destination_dir =
        flattened_bundle_output_dir(converted_dir, &PathBuf::from(modern_stem.as_str()));
    save_merged_sheet(
        &destination_dir,
        modern_stem.as_str(),
        &merged_plist_root,
        &atlas,
    )?;

    issues.push(ReportIssue {
        level: ReportLevel::Info,
        message: format!(
            "remerged {replaced} replaced and {added} added excluded frames into modern `{modern_stem}` from Geometry Dash Resources"
        ),
        file: Some(format!("{modern_stem}.plist")),
    });
    Ok(1)
}

fn build_icon_plist_from_frames(
    frame_entries: &BTreeMap<String, Value>,
    metadata_source: &Value,
    output_stem: &str,
) -> Result<Value, AppError> {
    let mut frames_dict = Dictionary::new();
    for (name, value) in frame_entries {
        frames_dict.insert(name.clone(), value.clone());
    }

    let mut metadata = Dictionary::new();
    if let Some(source_meta) = metadata_source
        .as_dictionary()
        .and_then(|root| root.get("metadata"))
        .and_then(Value::as_dictionary)
    {
        for key in ["pixelFormat", "premultiplyAlpha"] {
            if let Some(value) = source_meta.get(key) {
                metadata.insert(key.to_string(), value.clone());
            }
        }
    }
    metadata.insert("format".to_string(), Value::Integer(3.into()));
    let texture_file = format!("icons/{output_stem}.png");
    metadata.insert(
        "textureFileName".to_string(),
        Value::String(texture_file.clone()),
    );
    metadata.insert(
        "realTextureFileName".to_string(),
        Value::String(texture_file),
    );

    let mut root = Dictionary::new();
    root.insert("frames".to_string(), Value::Dictionary(frames_dict));
    root.insert("metadata".to_string(), Value::Dictionary(metadata));
    Ok(Value::Dictionary(root))
}

/// Save already-upscaled GS02 (+ optional glow) as modern `icons/` sheets and leftover gamesheets.
pub(crate) fn write_converted_legacy_icons_from_memory<F>(
    gs02_stem: &str,
    gs02_relative: &Path,
    quality_suffix: &str,
    gs02_plist: Value,
    gs02_sprites: BTreeMap<String, RgbaImage>,
    glow: Option<(SheetCandidate, Value, BTreeMap<String, RgbaImage>)>,
    game_files: &GameFilesLayout,
    converted_dir: &Path,
    merger_opts: &MergerOptions,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    on_progress: &Arc<Mutex<F>>,
    cancel: &AtomicBool,
) -> Result<(usize, Vec<ReportIssue>), AppError>
where
    F: FnMut(OperationProgress) + Send + ?Sized,
{
    let mut issues = Vec::new();
    let frame_names: Vec<String> = gs02_sprites.keys().cloned().collect();
    let groups = group_icon_output_frames(frame_names.iter().cloned());
    let excluded_frames = collect_excluded_legacy_frames(&gs02_plist, &gs02_sprites)?;

    let mut exported_standalones: HashSet<String> = HashSet::new();
    if let Some(sprite) = gs02_sprites.get("fireBoost_001.png") {
        let path = export_standalone_converted_png(converted_dir, "fireBoost_001.png", sprite)?;
        exported_standalones.insert("fireBoost_001.png".to_string());
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message: "exported standalone fireBoost_001.png to converted output root".to_string(),
            file: Some(path.to_string_lossy().to_string()),
        });
    }
    for frame_name in &frame_names {
        if exported_standalones.contains(frame_name)
            || is_glow_frame_name(frame_name)
            || excluded_frames.contains_key(frame_name)
            || icon_sheet_id_from_frame_name(frame_name).is_some()
        {
            continue;
        }
        if !vanilla_resources_has_standalone_png(game_files, frame_name) {
            continue;
        }
        let Some(sprite) = gs02_sprites.get(frame_name) else {
            continue;
        };
        let path = export_standalone_converted_png(converted_dir, frame_name, sprite)?;
        exported_standalones.insert(frame_name.clone());
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message: format!("exported standalone {frame_name} to converted output root"),
            file: Some(path.to_string_lossy().to_string()),
        });
    }

    let icons_dir = converted_dir.join("icons");
    let mut sheets_written = 0usize;
    let group_total = groups.len();
    let glow_plist_ref = glow.as_ref().map(|(_, plist, _)| plist);
    let glow_sprites_ref = glow.as_ref().map(|(_, _, sprites)| sprites);

    for (icon_index, (icon_id, icon_frame_names)) in groups.iter().enumerate() {
        check_cancel(cancel)?;
        let output_stem = format!("{icon_id}{quality_suffix}");
        emit_convert_progress(
            on_progress,
            format!(
                "{output_stem} (icon {}/{group_total})",
                icon_index.saturating_add(1)
            ),
            completed,
            total_units,
            plists_done_atomic.load(Ordering::Relaxed),
            plists_total,
        );

        let glow_names_from_sheet = glow_plist_ref
            .map(|plist| glow_frame_names_for_icon(plist, icon_id.as_str()))
            .unwrap_or_default();
        let (glow_names, glow_plist_for_values, glow_sprites_for_values) =
            if !glow_names_from_sheet.is_empty() {
                (
                    glow_names_from_sheet,
                    glow_plist_ref.unwrap_or(&gs02_plist),
                    glow_sprites_ref.unwrap_or(&gs02_sprites),
                )
            } else {
                (
                    glow_frame_names_for_icon(&gs02_plist, icon_id.as_str()),
                    &gs02_plist,
                    &gs02_sprites,
                )
            };

        let mut frame_entries = frame_values_for_names(&gs02_plist, icon_frame_names);
        frame_entries.extend(frame_values_for_names(
            glow_plist_for_values,
            &glow_names,
        ));
        let mut icon_sprites: BTreeMap<String, RgbaImage> = BTreeMap::new();
        for name in icon_frame_names {
            if let Some(sprite) = gs02_sprites.get(name) {
                icon_sprites.insert(name.clone(), sprite.clone());
            }
        }
        for name in &glow_names {
            if let Some(sprite) = glow_sprites_for_values.get(name) {
                icon_sprites.insert(name.clone(), sprite.clone());
            }
        }

        let mut icon_plist_root =
            build_icon_plist_from_frames(&frame_entries, &gs02_plist, output_stem.as_str())?;
        let completed_ref = Arc::clone(completed);
        let on_progress_ref = Arc::clone(on_progress);
        let plists_ref = Arc::clone(plists_done_atomic);
        let label = output_stem.clone();
        let (atlas, _w, _h, _count, merge_issues) = merge_plist_from_memory(
            &mut icon_plist_root,
            &icon_sprites,
            label.as_str(),
            merger_opts,
            &mut |_label| {
                let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
                on_progress_ref.lock().unwrap()(operation_progress(
                    format!("{label} (icon)"),
                    n,
                    total_units,
                    plists_ref.load(Ordering::Relaxed),
                    plists_total,
                ));
            },
        )?;
        issues.extend(merge_issues);
        save_merged_sheet(&icons_dir, output_stem.as_str(), &icon_plist_root, &atlas)?;
        sheets_written = sheets_written.saturating_add(1);
    }

    if sheets_written > 0 {
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message: format!(
                "split legacy GJ_GameSheet02 into {sheets_written} icon sheets under icons/"
            ),
            file: Some(format!("{gs02_stem}.plist")),
        });
    }

    let extracted_icon_ids: HashSet<String> = groups.keys().cloned().collect();
    let remerged = remerge_excluded_into_modern_gamesheet02(
        quality_suffix,
        &excluded_frames,
        game_files,
        converted_dir,
        total_units,
        completed,
        plists_done_atomic,
        plists_total,
        on_progress,
        &mut issues,
    )?;
    sheets_written = sheets_written.saturating_add(remerged);

    if remerged == 0 {
        let leftover_split = split_memory_from_parts(gs02_plist.clone(), gs02_sprites);
        sheets_written = sheets_written.saturating_add(rewrite_sheet_without_frames(
            &leftover_split,
            &|frame_name| {
                should_remove_from_legacy_gamesheet02(
                    frame_name,
                    &extracted_icon_ids,
                    &exported_standalones,
                )
            },
            gs02_stem,
            gs02_relative,
            converted_dir,
            merger_opts,
            total_units,
            completed,
            plists_done_atomic,
            plists_total,
            on_progress,
            &mut issues,
            gs02_stem,
        )?);
    }

    if let Some((glow_pair, glow_plist, glow_sprites)) = glow {
        let glow_relative: PathBuf = if glow_pair.relative_dir.as_os_str().is_empty() {
            PathBuf::from(&glow_pair.stem)
        } else {
            glow_pair.relative_dir.join(&glow_pair.stem)
        };
        let leftover_split = split_memory_from_parts(glow_plist, glow_sprites);
        sheets_written = sheets_written.saturating_add(rewrite_sheet_without_frames(
            &leftover_split,
            &|frame_name| should_remove_from_legacy_glow_sheet(frame_name, &extracted_icon_ids),
            glow_pair.stem.as_str(),
            &glow_relative,
            converted_dir,
            merger_opts,
            total_units,
            completed,
            plists_done_atomic,
            plists_total,
            on_progress,
            &mut issues,
            glow_pair.stem.as_str(),
        )?);
    }

    Ok((sheets_written, issues))
}

fn convert_legacy_icon_gamesheet<F>(
    pair: &SheetCandidate,
    quality_suffix: &str,
    all_sheet_pairs: &[SheetCandidate],
    splitter_opts: &SplitterOptions,
    merger_opts: &MergerOptions,
    game_files: &GameFilesLayout,
    converted_dir: &Path,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    on_progress: &Arc<Mutex<F>>,
    cancel: &AtomicBool,
) -> Result<ConvertSheetWorkOutcome, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let mut issues: Vec<ReportIssue> = Vec::new();
    let stem = pair.stem.clone();
    let plists_done = || plists_done_atomic.load(Ordering::Relaxed);

    let glow_sheet_pair =
        find_legacy_glow_sheet_pair(all_sheet_pairs, &pair.relative_dir, quality_suffix);
    let mut glow_plist = None;
    let mut glow_image = None;
    if let Some(glow_pair) = glow_sheet_pair {
        emit_convert_progress(
            on_progress,
            format!("{} (open glow atlas)", glow_pair.stem),
            completed,
            total_units,
            plists_done(),
            plists_total,
        );
        glow_plist = Some(load_plist_normalized(&glow_pair.plist_path)?);
        glow_image = Some(open_sheet_image(&glow_pair.png_path)?);
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message:
                "icon glow sprites: prefer accompanying GJ_GameSheetGlow, fall back to GJ_GameSheet02"
                    .to_string(),
            file: Some(format!("{}.plist", glow_pair.stem)),
        });
    } else {
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message:
                "no accompanying GJ_GameSheetGlow found; icon glow sprites will use GJ_GameSheet02 when present"
                    .to_string(),
            file: Some(format!("{}.plist", pair.stem)),
        });
    }

    emit_convert_progress(
        on_progress,
        format!("{stem} (open atlas)"),
        completed,
        total_units,
        plists_done(),
        plists_total,
    );
    let mut gs02_plist = load_plist_normalized(&pair.plist_path)?;
    let gs02_image = open_sheet_image(&pair.png_path)?;

    let frame_names: Vec<String> = frames_dictionary(&gs02_plist)?.keys().cloned().collect();
    let gs04_names: Vec<String> = frame_names
        .iter()
        .filter(|name| is_gamesheet04_moved_frame(name))
        .cloned()
        .collect();
    let mut relocated_gs04 = BTreeMap::new();
    if !gs04_names.is_empty() {
        let extracted =
            extract_named_frames(&gs02_image, &mut gs02_plist, &gs04_names, splitter_opts)?;
        let frames = frames_dictionary_mut(&mut gs02_plist)?;
        for name in &gs04_names {
            let Some(frame_value) = frames.remove(name) else {
                continue;
            };
            let Some(sprite) = extracted.get(name).cloned() else {
                frames.insert(name.clone(), frame_value);
                continue;
            };
            relocated_gs04.insert(name.clone(), (frame_value, sprite));
        }
    }
    let groups = group_icon_output_frames(frame_names.iter().cloned());

    let mut exported_standalones: HashSet<String> = HashSet::new();
    if frame_names.iter().any(|name| name == "fireBoost_001.png") {
        let extracted = extract_named_frames(
            &gs02_image,
            &mut gs02_plist,
            &[String::from("fireBoost_001.png")],
            splitter_opts,
        )?;
        if let Some(sprite) = extracted.get("fireBoost_001.png") {
            let fireboost_path =
                export_standalone_converted_png(converted_dir, "fireBoost_001.png", sprite)?;
            exported_standalones.insert("fireBoost_001.png".to_string());
            issues.push(ReportIssue {
                level: ReportLevel::Info,
                message: "exported standalone fireBoost_001.png to converted output root"
                    .to_string(),
                file: Some(fireboost_path.to_string_lossy().to_string()),
            });
        }
    }

    let excluded_names = excluded_legacy_frame_names(&gs02_plist)?;
    let excluded_sprites =
        extract_named_frames(&gs02_image, &mut gs02_plist, &excluded_names, splitter_opts)?;
    let excluded_frames = collect_excluded_legacy_frames(&gs02_plist, &excluded_sprites)?;

    let standalone_names: Vec<String> = frame_names
        .iter()
        .filter(|frame_name| {
            if exported_standalones.contains(*frame_name)
                || is_glow_frame_name(frame_name)
                || excluded_frames.contains_key(*frame_name)
                || icon_sheet_id_from_frame_name(frame_name).is_some()
            {
                return false;
            }
            vanilla_resources_has_standalone_png(game_files, frame_name)
        })
        .cloned()
        .collect();
    let standalone_sprites = extract_named_frames(
        &gs02_image,
        &mut gs02_plist,
        &standalone_names,
        splitter_opts,
    )?;
    for (frame_name, sprite) in &standalone_sprites {
        let exported_path = export_standalone_converted_png(converted_dir, frame_name, sprite)?;
        exported_standalones.insert(frame_name.clone());
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message: format!("exported standalone {frame_name} to converted output root"),
            file: Some(exported_path.to_string_lossy().to_string()),
        });
    }

    let grouped_count: usize = groups.values().map(|frames| frames.len()).sum();
    if grouped_count < frame_names.len() {
        for frame_name in &frame_names {
            if is_fireboost_frame_name(frame_name) || exported_standalones.contains(frame_name) {
                continue;
            }
            if is_glow_frame_name(frame_name) {
                continue;
            }
            if excluded_frames.contains_key(frame_name) {
                continue;
            }
            let Some(icon_id) = icon_sheet_id_from_frame_name(frame_name) else {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: "frame name does not map to an icon sheet id; skipping".to_string(),
                    file: Some(frame_name.clone()),
                });
                continue;
            };
            if is_excluded_legacy_icon_id(&icon_id) {
                issues.push(ReportIssue {
                    level: ReportLevel::Info,
                    message: "frame belongs to a sprite type that now lives on another gamesheet; skipping"
                        .to_string(),
                    file: Some(frame_name.clone()),
                });
            }
        }
    }

    if groups.is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "legacy GJ_GameSheet02 has no groupable icon frames".to_string(),
            file: Some(format!("{}.plist", pair.stem)),
        });
    }

    let icons_dir = converted_dir.join("icons");
    let mut sheets_written = 0usize;
    let group_total = groups.len();

    for (icon_index, (icon_id, icon_frame_names)) in groups.iter().enumerate() {
        check_cancel(cancel)?;
        let output_stem = format!("{icon_id}{quality_suffix}");
        emit_convert_progress(
            on_progress,
            format!(
                "{output_stem} (icon {}/{group_total})",
                icon_index.saturating_add(1)
            ),
            completed,
            total_units,
            plists_done(),
            plists_total,
        );

        let glow_names_from_sheet = glow_plist
            .as_ref()
            .map(|plist| glow_frame_names_for_icon(plist, icon_id.as_str()))
            .unwrap_or_default();
        let (glow_sprites, glow_values) = if !glow_names_from_sheet.is_empty() {
            match (glow_image.as_ref(), glow_plist.as_mut()) {
                (Some(image), Some(plist)) => {
                    let sprites =
                        extract_named_frames(image, plist, &glow_names_from_sheet, splitter_opts)?;
                    let values = frame_values_for_names(plist, &glow_names_from_sheet);
                    (sprites, values)
                }
                _ => (BTreeMap::new(), BTreeMap::new()),
            }
        } else {
            let names = glow_frame_names_for_icon(&gs02_plist, icon_id.as_str());
            let sprites =
                extract_named_frames(&gs02_image, &mut gs02_plist, &names, splitter_opts)?;
            let values = frame_values_for_names(&gs02_plist, &names);
            (sprites, values)
        };

        let mut icon_sprites = extract_named_frames(
            &gs02_image,
            &mut gs02_plist,
            icon_frame_names,
            splitter_opts,
        )?;
        let mut frame_entries = frame_values_for_names(&gs02_plist, icon_frame_names);
        for (frame_name, value) in glow_values {
            frame_entries.insert(frame_name, value);
        }
        for (frame_name, sprite) in glow_sprites {
            icon_sprites.insert(frame_name, sprite);
        }

        let mut icon_plist_root =
            build_icon_plist_from_frames(&frame_entries, &gs02_plist, output_stem.as_str())?;

        let completed_ref = Arc::clone(completed);
        let on_progress_ref = Arc::clone(on_progress);
        let plists_ref = Arc::clone(plists_done_atomic);
        let label = output_stem.clone();
        let (atlas, _w, _h, _count, merge_issues) = merge_plist_from_memory(
            &mut icon_plist_root,
            &icon_sprites,
            label.as_str(),
            merger_opts,
            &mut |_label| {
                let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
                on_progress_ref.lock().unwrap()(operation_progress(
                    format!("{label} (icon)"),
                    n,
                    total_units,
                    plists_ref.load(Ordering::Relaxed),
                    plists_total,
                ));
            },
        )?;
        issues.extend(merge_issues);

        save_merged_sheet(&icons_dir, output_stem.as_str(), &icon_plist_root, &atlas)?;
        sheets_written = sheets_written.saturating_add(1);
    }

    if sheets_written > 0 {
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message: format!(
                "split legacy GJ_GameSheet02 into {sheets_written} icon sheets under icons/"
            ),
            file: Some(format!("{}.plist", pair.stem)),
        });
    }

    let extracted_icon_ids: HashSet<String> = groups.keys().cloned().collect();

    let remerged = remerge_excluded_into_modern_gamesheet02(
        quality_suffix,
        &excluded_frames,
        game_files,
        converted_dir,
        total_units,
        completed,
        plists_done_atomic,
        plists_total,
        on_progress,
        &mut issues,
    )?;
    sheets_written = sheets_written.saturating_add(remerged);

    let sheet02_relative: PathBuf = if pair.relative_dir.as_os_str().is_empty() {
        PathBuf::from(&pair.stem)
    } else {
        pair.relative_dir.join(&pair.stem)
    };

    // When modern remerge wrote GS02, icons are already absent from that sheet.
    // Otherwise rewrite the original GS02 without extracted icon frames.
    if remerged == 0 {
        let leftover_names: Vec<String> = frame_names
            .iter()
            .filter(|frame_name| {
                !should_remove_from_legacy_gamesheet02(
                    frame_name,
                    &extracted_icon_ids,
                    &exported_standalones,
                )
            })
            .cloned()
            .collect();
        let leftover_sprites =
            extract_named_frames(&gs02_image, &mut gs02_plist, &leftover_names, splitter_opts)?;
        let leftover_split = split_memory_from_parts(gs02_plist.clone(), leftover_sprites);
        sheets_written = sheets_written.saturating_add(rewrite_sheet_without_frames(
            &leftover_split,
            &|frame_name| {
                should_remove_from_legacy_gamesheet02(
                    frame_name,
                    &extracted_icon_ids,
                    &exported_standalones,
                )
            },
            pair.stem.as_str(),
            &sheet02_relative,
            converted_dir,
            merger_opts,
            total_units,
            completed,
            plists_done_atomic,
            plists_total,
            on_progress,
            &mut issues,
            pair.stem.as_str(),
        )?);
    }

    if let Some(glow_pair) = glow_sheet_pair {
        if let (Some(plist), Some(image)) = (glow_plist.as_mut(), glow_image.as_ref()) {
            let glow_relative: PathBuf = if glow_pair.relative_dir.as_os_str().is_empty() {
                PathBuf::from(&glow_pair.stem)
            } else {
                glow_pair.relative_dir.join(&glow_pair.stem)
            };
            let glow_names: Vec<String> = frames_dictionary(plist)?.keys().cloned().collect();
            let leftover_names: Vec<String> = glow_names
                .into_iter()
                .filter(|frame_name| {
                    !should_remove_from_legacy_glow_sheet(frame_name, &extracted_icon_ids)
                })
                .collect();
            let leftover_sprites =
                extract_named_frames(image, plist, &leftover_names, splitter_opts)?;
            let leftover_split = split_memory_from_parts(plist.clone(), leftover_sprites);
            sheets_written = sheets_written.saturating_add(rewrite_sheet_without_frames(
                &leftover_split,
                &|frame_name| should_remove_from_legacy_glow_sheet(frame_name, &extracted_icon_ids),
                glow_pair.stem.as_str(),
                &glow_relative,
                converted_dir,
                merger_opts,
                total_units,
                completed,
                plists_done_atomic,
                plists_total,
                on_progress,
                &mut issues,
                glow_pair.stem.as_str(),
            )?);
        }
    }

    let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
    on_progress.lock().unwrap()(operation_progress(
        pair.stem.clone(),
        completed.load(Ordering::Relaxed),
        total_units,
        plist_done_now,
        plists_total,
    ));

    Ok(ConvertSheetWorkOutcome {
        sheets_written,
        issues,
        relocated_gs04,
    })
}

struct ConvertSheetWorkOutcome {
    sheets_written: usize,
    issues: Vec<ReportIssue>,
    relocated_gs04: BTreeMap<String, (Value, RgbaImage)>,
}

fn save_merged_sheet(
    destination_dir: &Path,
    stem: &str,
    plist_root: &Value,
    atlas: &image::RgbaImage,
) -> Result<(), AppError> {
    fs::create_dir_all(destination_dir)?;
    let plist_path = destination_dir.join(format!("{stem}.plist"));
    let png_path = destination_dir.join(format!("{stem}.png"));
    let mut output_plist = plist_root.clone();
    force_plist_frames_to_format3(&mut output_plist);
    output_plist
        .to_file_xml(&plist_path)
        .map_err(|err| AppError::IoError(format!("failed to write plist: {err}")))?;
    crate::core::image_io::save_rgba_png_fast(&png_path, atlas)?;
    Ok(())
}

fn copy_unpaired_png_to_converted(
    png_path: &Path,
    input_dir: &Path,
    converted_dir: &Path,
) -> Result<PathBuf, AppError> {
    let relative = png_path.strip_prefix(input_dir).map_err(|_| {
        AppError::InvalidOperation("failed to compute relative path for unpaired png")
    })?;
    let destination = converted_dir.join(relative);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(png_path, &destination).map_err(|err| {
        AppError::IoError(format!(
            "failed to copy unpaired png `{}`: {err}",
            png_path.to_string_lossy()
        ))
    })?;
    Ok(destination)
}

fn convert_process_one_sheet_candidate<F>(
    pair: &SheetCandidate,
    all_sheet_pairs: &[SheetCandidate],
    splitter_opts: &SplitterOptions,
    merger_opts: &MergerOptions,
    game_files: &GameFilesLayout,
    converted_dir: &Path,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    legacy_icon_split: bool,
    on_progress: &Arc<Mutex<F>>,
    cancel: &AtomicBool,
) -> Result<ConvertSheetWorkOutcome, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let mut issues: Vec<ReportIssue> = Vec::new();
    let stem = pair.stem.clone();
    if sheet_is_under_icons(&pair.relative_dir) {
        let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            stem,
            completed.load(Ordering::Relaxed),
            total_units,
            plist_done_now,
            plists_total,
        ));
        return Ok(ConvertSheetWorkOutcome {
            sheets_written: 0,
            issues,
            relocated_gs04: BTreeMap::new(),
        });
    }

    if legacy_icon_split && is_legacy_icon_glow_sheet(&stem).is_some() {
        let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            stem,
            completed.load(Ordering::Relaxed),
            total_units,
            plist_done_now,
            plists_total,
        ));
        return Ok(ConvertSheetWorkOutcome {
            sheets_written: 0,
            issues,
            relocated_gs04: BTreeMap::new(),
        });
    }

    if legacy_icon_split {
        if let Some(quality_suffix) = is_legacy_combined_icon_sheet(&stem) {
            return convert_legacy_icon_gamesheet(
                pair,
                quality_suffix.as_str(),
                all_sheet_pairs,
                splitter_opts,
                merger_opts,
                game_files,
                converted_dir,
                total_units,
                completed,
                plists_done_atomic,
                plists_total,
                on_progress,
                cancel,
            );
        }
    }

    let mut input_plist = load_plist_normalized(&pair.plist_path)?;
    let input_frame_names = frame_name_set(&input_plist)?;
    let gs04_names: Vec<String> = if is_gamesheet04_stem(&stem) {
        Vec::new()
    } else {
        input_frame_names
            .iter()
            .filter(|name| is_gamesheet04_moved_frame(name))
            .cloned()
            .collect()
    };
    let mut relocated_gs04 = BTreeMap::new();
    let mut pack_atlas: Option<RgbaImage> = None;
    if !gs04_names.is_empty() {
        let pack_image = open_sheet_image(&pair.png_path)?;
        let extracted =
            extract_named_frames(&pack_image, &mut input_plist, &gs04_names, splitter_opts)?;
        let frames = frames_dictionary_mut(&mut input_plist)?;
        for name in &gs04_names {
            let Some(frame_value) = frames.remove(name) else {
                continue;
            };
            let Some(sprite) = extracted.get(name).cloned() else {
                frames.insert(name.clone(), frame_value);
                continue;
            };
            relocated_gs04.insert(name.clone(), (frame_value, sprite));
        }
        pack_atlas = Some(pack_image.to_rgba8());
    }
    let Some(latest_source_pair) =
        find_current_sheet_for_input(game_files, &pair.relative_dir, &pair.stem)?
    else {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "no latest placeholder plist found for sheet".to_string(),
            file: Some(format!("{}.plist", pair.stem)),
        });
        let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            stem,
            completed.load(Ordering::Relaxed),
            total_units,
            plist_done_now,
            plists_total,
        ));
        return Ok(ConvertSheetWorkOutcome {
            sheets_written: 0,
            issues,
            relocated_gs04,
        });
    };

    let mut latest_plist_root = load_plist_normalized(&latest_source_pair.plist_path)?;
    let missing_frame_keys = {
        let latest_frames = frames_dictionary(&latest_plist_root)?;
        missing_frame_keys(latest_frames, &input_frame_names)
    };

    if missing_frame_keys.is_empty() {
        if relocated_gs04.is_empty() {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "no new frame keys found versus latest placeholder plist".to_string(),
                file: Some(format!("{}.plist", pair.stem)),
            });
            let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress.lock().unwrap()(operation_progress(
                pair.stem.clone(),
                completed.load(Ordering::Relaxed),
                total_units,
                plist_done_now,
                plists_total,
            ));
            return Ok(ConvertSheetWorkOutcome {
                sheets_written: 0,
                issues,
                relocated_gs04,
            });
        }

        write_converted_sheet_pair(
            pair,
            converted_dir,
            &input_plist,
            pack_atlas.as_ref(),
        )?;
        let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            pair.stem.clone(),
            completed.load(Ordering::Relaxed),
            total_units,
            plist_done_now,
            plists_total,
        ));
        return Ok(ConvertSheetWorkOutcome {
            sheets_written: 1,
            issues,
            relocated_gs04,
        });
    }

    check_cancel(cancel)?;
    emit_convert_progress(
        on_progress,
        format!("{stem} (read latest)"),
        completed,
        total_units,
        plists_done_atomic.load(Ordering::Relaxed),
        plists_total,
    );
    let latest_image = open_sheet_image(&latest_source_pair.png_path)?;
    let extracted = extract_named_frames(
        &latest_image,
        &mut latest_plist_root,
        &missing_frame_keys,
        splitter_opts,
    )?;
    drop(latest_image);

    let mut prepared: Vec<PreparedAppendSprite> = Vec::new();
    for frame_name in &missing_frame_keys {
        let Some(frame_value) = frames_dictionary(&latest_plist_root)?
            .get(frame_name)
            .cloned()
        else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "missing sprite payload in latest placeholder plist".to_string(),
                file: Some(frame_name.clone()),
            });
            continue;
        };
        let Some(sprite) = extracted.get(frame_name).cloned() else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "missing sprite payload in latest placeholder image".to_string(),
                file: Some(frame_name.clone()),
            });
            continue;
        };
        if let Some(prepared_sprite) =
            prepare_append_sprite(frame_name.clone(), frame_value, sprite)
        {
            prepared.push(prepared_sprite);
        }
        let _ = completed.fetch_add(1, Ordering::Relaxed);
    }

    if prepared.is_empty() {
        if relocated_gs04.is_empty() {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message:
                    "sheet has missing frame keys but no mergeable payloads; keeping original sheet content"
                        .to_string(),
                file: Some(format!("{}.plist", pair.stem)),
            });
            let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress.lock().unwrap()(operation_progress(
                pair.stem.clone(),
                completed.load(Ordering::Relaxed),
                total_units,
                plist_done_now,
                plists_total,
            ));
            return Ok(ConvertSheetWorkOutcome {
                sheets_written: 0,
                issues,
                relocated_gs04,
            });
        }
        write_converted_sheet_pair(
            pair,
            converted_dir,
            &input_plist,
            pack_atlas.as_ref(),
        )?;
        let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            pair.stem.clone(),
            completed.load(Ordering::Relaxed),
            total_units,
            plist_done_now,
            plists_total,
        ));
        return Ok(ConvertSheetWorkOutcome {
            sheets_written: 1,
            issues,
            relocated_gs04,
        });
    }

    let added = prepared.len();
    emit_convert_progress(
        on_progress,
        format!("{stem} (append {added} frames)"),
        completed,
        total_units,
        plists_done_atomic.load(Ordering::Relaxed),
        plists_total,
    );
    let atlas = match pack_atlas {
        Some(atlas) => atlas,
        None => open_sheet_image(&pair.png_path)?.to_rgba8(),
    };
    let atlas = append_sprites_below_atlas(atlas, prepared, &mut input_plist)?;
    save_merged_sheet(
        &flattened_bundle_output_dir(converted_dir, &sheet_relative_path(pair)),
        pair.stem.as_str(),
        &input_plist,
        &atlas,
    )?;

    issues.push(ReportIssue {
        level: ReportLevel::Info,
        message: format!("appended {added} missing frame(s) from latest Geometry Dash Resources"),
        file: Some(format!("{}.plist", pair.stem)),
    });

    let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
    on_progress.lock().unwrap()(operation_progress(
        pair.stem.clone(),
        completed.load(Ordering::Relaxed),
        total_units,
        plist_done_now,
        plists_total,
    ));

    Ok(ConvertSheetWorkOutcome {
        sheets_written: 1,
        issues,
        relocated_gs04,
    })
}

pub fn execute_convert_to_new_version<F>(
    plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    options: &ConvertToNewVersionOptions,
    game_files: &GameFilesLayout,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let converted_dir = output_dir.join("ConvertedToLatestVersion");
    fs::create_dir_all(&converted_dir)?;

    let splitter_opts = phase_defaults().splitter;
    let merger_opts = MergerOptions {
        include_outside_plist_files: false,
        dimensions: None,
        sheet_concurrency: 1,
    };

    check_cancel(cancel.as_ref())?;
    let all_sheet_pairs: Vec<SheetCandidate> =
        discover_sheet_pairs_with_game_plist_fallback(input_dir, game_files)?;
    let legacy_icon_split = is_legacy_icon_split_version(&options.game_version)
        || pack_uses_legacy_combined_icons(&all_sheet_pairs);
    let paired_pngs: HashSet<PathBuf> = all_sheet_pairs
        .iter()
        .map(|pair| pair.png_path.clone())
        .collect();
    let unpaired_pngs = discover_unpaired_pngs(input_dir, &paired_pngs)?;
    let sheet_pairs: Vec<SheetCandidate> = all_sheet_pairs
        .iter()
        .filter(|pair| !sheet_is_under_icons(&pair.relative_dir))
        .filter(|pair| !(legacy_icon_split && is_legacy_icon_glow_sheet(&pair.stem).is_some()))
        .cloned()
        .collect();
    let plists_total = sheet_pairs.len() as u32;
    let mut input_total_sprites = 0usize;
    for pair in &sheet_pairs {
        input_total_sprites =
            input_total_sprites.saturating_add(count_frames_in_plist(&pair.plist_path)?);
    }
    let total_units = input_total_sprites
        .saturating_mul(2)
        .saturating_add(sheet_pairs.len())
        .saturating_add(unpaired_pngs.len())
        .max(1);
    let completed = Arc::new(AtomicUsize::new(0));
    let plists_done_atomic = Arc::new(AtomicU32::new(0));

    on_progress.lock().unwrap()(operation_progress(
        String::new(),
        0,
        total_units,
        0,
        plists_total,
    ));

    let mut issues: Vec<ReportIssue> = Vec::new();
    for pair in &all_sheet_pairs {
        if sheet_uses_external_plist(input_dir, pair) {
            issues.push(ReportIssue {
                level: ReportLevel::Info,
                message: format!("Using vanilla plist for {}", pair.stem),
                file: Some(pair.png_path.to_string_lossy().to_string()),
            });
        }
    }
    issues.push(ReportIssue {
        level: ReportLevel::Info,
        message: if legacy_icon_split {
            format!(
                "previous game version `{}`; applying legacy GJ_GameSheet02 icon split and comparing other sheets against Steam Geometry Dash Resources / geode mods",
                options.game_version
            )
        } else {
            format!(
                "previous game version `{}`; comparing sheets against Steam Geometry Dash Resources / geode mods",
                options.game_version
            )
        },
        file: None,
    });
    issues.push(ReportIssue {
        level: ReportLevel::Info,
        message: format!(
            "latest placeholder source: {}",
            game_files.resources.to_string_lossy()
        ),
        file: None,
    });
    let mut sheets_written = 0usize;

    let convert_sheet_jobs: Vec<(u64, SheetCandidate)> = sheet_pairs
        .iter()
        .map(|pair| (sheet_input_weight_bytes(pair), pair.clone()))
        .collect();
    check_cancel(cancel.as_ref())?;
    let cancel_for_convert = Arc::clone(&cancel);
    let completed_for_pool = Arc::clone(&completed);
    let plists_for_pool = Arc::clone(&plists_done_atomic);
    let progress_for_pool = Arc::clone(on_progress);
    let splitter_opts_for_convert = splitter_opts.clone();
    let merger_opts_for_convert = merger_opts.clone();
    let game_files_for_convert = game_files.clone();
    let converted_dir_for_convert = converted_dir.clone();
    let all_sheet_pairs_for_convert = all_sheet_pairs.clone();
    let results: Vec<Result<ConvertSheetWorkOutcome, AppError>> = scope_run_weighted_job_queue(
        convert_sheet_jobs,
        options.sheet_concurrency,
        Arc::clone(&cancel),
        Arc::new(move |pair: SheetCandidate| {
            check_cancel(cancel_for_convert.as_ref())?;
            convert_process_one_sheet_candidate(
                &pair,
                all_sheet_pairs_for_convert.as_slice(),
                &splitter_opts_for_convert,
                &merger_opts_for_convert,
                &game_files_for_convert,
                converted_dir_for_convert.as_path(),
                total_units,
                &completed_for_pool,
                &plists_for_pool,
                plists_total,
                legacy_icon_split,
                &progress_for_pool,
                cancel_for_convert.as_ref(),
            )
        }),
    )?;

    let mut relocated_gs04 = BTreeMap::new();
    for entry in results {
        let outcome = match entry {
            Ok(value) => value,
            Err(err) => return Err(err),
        };
        sheets_written = sheets_written.saturating_add(outcome.sheets_written);
        issues.extend(outcome.issues);
        relocated_gs04.extend(outcome.relocated_gs04);
    }

    let gs04_written = write_modern_gamesheet04(
        pack_quality_suffix(&all_sheet_pairs).as_str(),
        &relocated_gs04,
        is_convert_from_2_0(&options.game_version),
        game_files,
        &converted_dir,
        total_units,
        &completed,
        &plists_done_atomic,
        plists_total,
        on_progress,
        &mut issues,
    )?;
    sheets_written = sheets_written.saturating_add(gs04_written);

    let mut unpaired_copied = 0usize;
    for png_path in &unpaired_pngs {
        check_cancel(cancel.as_ref())?;
        if copy_unpaired_png_to_converted(png_path, input_dir, &converted_dir).is_ok() {
            unpaired_copied = unpaired_copied.saturating_add(1);
        }
        let n = completed.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            png_path
                .file_name()
                .and_then(|v| v.to_str())
                .unwrap_or("unpaired.png")
                .to_string(),
            n,
            total_units,
            plists_done_atomic.load(Ordering::Relaxed),
            plists_total,
        ));
    }

    if !game_files.geometry_dash_found() || !game_files.resources.is_dir() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "Geometry Dash is not configured or Resources was not found. Set the install path in Settings, then re-run Convert to New Version.".to_string(),
            file: None,
        });
    }
    if sheet_pairs.is_empty() && unpaired_pngs.is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "no plist/png sheet pairs or unpaired png files discovered for conversion"
                .to_string(),
            file: None,
        });
    }

    Ok(OperationReport {
        operation: format!("{:?}", plan.kind),
        files_seen: sheet_pairs.len().saturating_add(unpaired_pngs.len()),
        files_processed: sheets_written.saturating_add(unpaired_copied),
        output_dir: converted_dir.to_string_lossy().to_string(),
        elapsed_ms: started_at.elapsed().as_millis(),
        issues,
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::path::{Path, PathBuf};

    use plist::{Dictionary, Value};

    use super::{
        frame_belongs_to_extracted_icon, group_frame_names_by_icon_id, group_icon_output_frames,
        icon_sheet_id_from_frame_name, is_excluded_legacy_icon_id, is_fireboost_frame_name,
        is_glow_frame_name, is_icon_sprite, is_known_legacy_icon_kind,
        is_legacy_combined_icon_sheet, is_legacy_icon_glow_sheet, is_legacy_icon_split_version,
        missing_frame_keys, pack_uses_legacy_combined_icons, plist_contains_legacy_icon_frames,
        save_merged_sheet, sheet_is_under_icons, sheet_may_hold_legacy_icons,
        should_remove_from_legacy_gamesheet02, should_remove_from_legacy_glow_sheet,
        take_gamesheet04_menu_buttons, is_convert_from_2_0, is_gamesheet04_moved_frame,
        is_gamesheet04_stem,
    };

    #[test]
    fn missing_frame_keys_returns_sorted_latest_minus_input() {
        let mut latest = Dictionary::new();
        latest.insert("z.png".to_string(), Value::Dictionary(Dictionary::new()));
        latest.insert("a.png".to_string(), Value::Dictionary(Dictionary::new()));
        latest.insert("m.png".to_string(), Value::Dictionary(Dictionary::new()));

        let mut input: HashSet<String> = HashSet::new();
        input.insert("m.png".to_string());

        let result = missing_frame_keys(&latest, &input);
        assert_eq!(result, vec!["a.png".to_string(), "z.png".to_string()]);
    }

    #[test]
    fn sheet_is_under_icons_matches_nested_icons_path() {
        assert!(sheet_is_under_icons(Path::new("icons")));
        assert!(sheet_is_under_icons(Path::new("mods/icons/shared")));
        assert!(!sheet_is_under_icons(Path::new("mods/ui")));
    }

    #[test]
    fn discover_unpaired_pngs_includes_assets_without_quality_suffix() {
        use crate::core::discovery::discover_unpaired_pngs;
        use std::collections::HashSet;
        use std::fs;
        use std::time::{SystemTime, UNIX_EPOCH};

        let root = std::env::temp_dir().join(format!(
            "tm_unpaired_png_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&root).expect("create temp");
        let paired = root.join("GJ_GameSheet02-uhd.png");
        let unpaired = root.join("edit_eAlphaBtn_001.png");
        fs::write(&paired, b"paired").expect("write paired");
        fs::write(&unpaired, b"unpaired").expect("write unpaired");
        let paired_set: HashSet<_> = [paired].into_iter().collect();
        let found = discover_unpaired_pngs(&root, &paired_set).expect("discover");
        assert_eq!(found, vec![unpaired]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn is_legacy_icon_split_version_matches_2_0_and_2_11() {
        assert!(is_legacy_icon_split_version("2.0"));
        assert!(is_legacy_icon_split_version(" 2.0 "));
        assert!(is_legacy_icon_split_version("v2.0"));
        assert!(is_legacy_icon_split_version("2.11"));
        assert!(is_legacy_icon_split_version(" 2.11 "));
        assert!(is_legacy_icon_split_version("v2.11"));
        assert!(!is_legacy_icon_split_version("2.2"));
        assert!(!is_legacy_icon_split_version("2.205"));
        assert!(!is_legacy_icon_split_version(""));
    }

    #[test]
    fn known_legacy_icon_kinds_are_the_gd_icon_families() {
        assert!(is_known_legacy_icon_kind("player"));
        assert!(is_known_legacy_icon_kind("ship"));
        assert!(is_known_legacy_icon_kind("robot"));
        assert!(!is_known_legacy_icon_kind("portal"));
        assert!(!is_known_legacy_icon_kind("block"));
        assert!(!is_known_legacy_icon_kind("square"));
    }

    #[test]
    fn sheet_may_hold_legacy_icons_matches_gs02_and_glow() {
        assert!(sheet_may_hold_legacy_icons("GJ_GameSheet02-uhd"));
        assert!(sheet_may_hold_legacy_icons("GJ_GameSheetGlow-hd"));
        assert!(!sheet_may_hold_legacy_icons("GJ_GameSheet03-uhd"));
        assert!(!sheet_may_hold_legacy_icons("player_01-uhd"));
    }

    #[test]
    fn plist_contains_legacy_icon_frames_detects_old_gs02_layout() {
        use std::fs;
        use std::time::{SystemTime, UNIX_EPOCH};

        let dir = std::env::temp_dir().join(format!(
            "tm_legacy_gs02_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&dir).expect("temp dir");
        let with_icons = dir.join("with-icons.plist");
        let objects_only = dir.join("objects-only.plist");
        fs::write(
            &with_icons,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>frames</key><dict>
<key>player_02_001.png</key><dict/>
<key>portal_01_front_001.png</key><dict/>
</dict></dict></plist>"#,
        )
        .expect("write");
        fs::write(
            &objects_only,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>frames</key><dict>
<key>portal_01_front_001.png</key><dict/>
<key>edit_eAlphaBtn_001.png</key><dict/>
</dict></dict></plist>"#,
        )
        .expect("write");
        assert!(plist_contains_legacy_icon_frames(&with_icons));
        assert!(!plist_contains_legacy_icon_frames(&objects_only));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn pack_uses_legacy_combined_icons_ignores_modern_gs02() {
        use crate::core::discovery::SheetCandidate;

        let pair = SheetCandidate {
            relative_dir: PathBuf::new(),
            stem: "GJ_GameSheet03-uhd".to_string(),
            plist_path: PathBuf::from("missing.plist"),
            png_path: PathBuf::from("missing.png"),
        };
        assert!(!pack_uses_legacy_combined_icons(&[pair]));
    }

    #[test]
    fn glow_frame_names_prefer_glow_sheet_then_gamesheet02() {
        fn plist_with_frames(names: &[&str]) -> Value {
            let mut frames_dict = Dictionary::new();
            for name in names {
                frames_dict.insert((*name).to_string(), Value::Dictionary(Dictionary::new()));
            }
            let mut root = Dictionary::new();
            root.insert("frames".to_string(), Value::Dictionary(frames_dict));
            Value::Dictionary(root)
        }

        let sheet02 = plist_with_frames(&[
            "player_02_001.png",
            "player_02_glow_001.png",
            "player_03_glow_001.png",
        ]);
        let glow_sheet = plist_with_frames(&["player_02_glow_001.png"]);

        assert_eq!(
            super::glow_frame_names_for_icon(&glow_sheet, "player_02"),
            vec!["player_02_glow_001.png".to_string()]
        );
        assert!(super::glow_frame_names_for_icon(&glow_sheet, "player_03").is_empty());
        assert_eq!(
            super::glow_frame_names_for_icon(&sheet02, "player_03"),
            vec!["player_03_glow_001.png".to_string()]
        );
        assert_eq!(
            super::glow_frame_names_for_icon(&sheet02, "player_02"),
            vec!["player_02_glow_001.png".to_string()]
        );
    }

    #[test]
    fn is_legacy_combined_icon_sheet_matches_gj_gamesheet02_variants() {
        assert_eq!(
            is_legacy_combined_icon_sheet("GJ_GameSheet02-uhd"),
            Some("-uhd".to_string())
        );
        assert_eq!(
            is_legacy_combined_icon_sheet("GJ_GameSheet02-hd"),
            Some("-hd".to_string())
        );
        assert_eq!(
            is_legacy_combined_icon_sheet("GJ_GameSheet02"),
            Some(String::new())
        );
        assert_eq!(is_legacy_combined_icon_sheet("GJ_GameSheet03-uhd"), None);
    }

    #[test]
    fn icon_sheet_id_from_frame_name_handles_standard_and_multipart_frames() {
        assert_eq!(
            icon_sheet_id_from_frame_name("player_02_001.png"),
            Some("player_02".to_string())
        );
        assert_eq!(
            icon_sheet_id_from_frame_name("player_02_2_001.png"),
            Some("player_02".to_string())
        );
        assert_eq!(
            icon_sheet_id_from_frame_name("bird_01_glow_001.png"),
            Some("bird_01".to_string())
        );
        assert_eq!(
            icon_sheet_id_from_frame_name("player_100_extra_001.png"),
            Some("player_100".to_string())
        );
        assert_eq!(
            icon_sheet_id_from_frame_name("robot_01_03_glow_001.png"),
            Some("robot_01".to_string())
        );
        assert_eq!(
            icon_sheet_id_from_frame_name("spider_02_01_2_001.png"),
            Some("spider_02".to_string())
        );
        assert_eq!(
            icon_sheet_id_from_frame_name("player_ball_00_001.png"),
            Some("player_ball_00".to_string())
        );
        assert_eq!(
            icon_sheet_id_from_frame_name("player_ball_00_2_001.png"),
            Some("player_ball_00".to_string())
        );
        assert_eq!(
            icon_sheet_id_from_frame_name("edit_eAlphaBtn_001.png"),
            None
        );
        assert_eq!(icon_sheet_id_from_frame_name("secretCoin_01_001.png"), None);
        assert_eq!(
            icon_sheet_id_from_frame_name("secretCoin_2_01_001.png"),
            None
        );
        assert_eq!(icon_sheet_id_from_frame_name("not_an_icon.png"), None);
        assert_eq!(icon_sheet_id_from_frame_name("square_01_001.png"), None);
        assert_eq!(icon_sheet_id_from_frame_name("block_01_001.png"), None);
    }

    #[test]
    fn is_icon_sprite_uses_folder_or_frame_identity_not_sheet_filename() {
        assert!(is_icon_sprite(Path::new("icons"), "anything.png"));
        assert!(is_icon_sprite(Path::new("pack/icons/extra"), "weird.png"));
        assert!(is_icon_sprite(Path::new(""), "player_02_001.png"));
        assert!(is_icon_sprite(Path::new(""), "bird_01_glow_001.png"));
        assert!(is_icon_sprite(Path::new(""), "robot_01_03_001.png"));
        assert!(!is_icon_sprite(Path::new(""), "edit_eAlphaBtn_001.png"));
        assert!(!is_icon_sprite(Path::new(""), "secretCoin_01_001.png"));
        assert!(!is_icon_sprite(Path::new(""), "portal_01_front_001.png"));
        assert!(!is_icon_sprite(Path::new(""), "boost_01_001.png"));
        assert!(!is_icon_sprite(Path::new(""), "GJ_GameSheet02-uhd.png"));
        assert!(!is_icon_sprite(Path::new(""), "square_01_001.png"));
        assert!(is_icon_sprite(Path::new(""), "ship_03_001.png"));
    }

    #[test]
    fn group_frame_names_by_icon_id_buckets_frames_per_icon() {
        let frames = vec![
            "player_02_001.png".to_string(),
            "player_02_2_001.png".to_string(),
            "player_03_001.png".to_string(),
            "robot_01_01_001.png".to_string(),
            "robot_01_02_glow_001.png".to_string(),
        ];
        let groups = group_frame_names_by_icon_id(frames);
        assert_eq!(groups.len(), 3);
        assert_eq!(groups.get("player_02").map(Vec::len), Some(2));
        assert_eq!(groups.get("player_03").map(Vec::len), Some(1));
        assert_eq!(groups.get("robot_01").map(Vec::len), Some(2));
    }

    #[test]
    fn group_icon_output_frames_excludes_moved_sprite_types_glow_and_fireboost() {
        let frames = vec![
            "player_02_001.png".to_string(),
            "player_02_glow_001.png".to_string(),
            "boost_01_001.png".to_string(),
            "portal_01_back_001.png".to_string(),
            "checkpoint_01_001.png".to_string(),
            "floorLine_01_001.png".to_string(),
            "fireBoost_001.png".to_string(),
        ];
        let groups = group_icon_output_frames(frames);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups.get("player_02").map(Vec::len), Some(1));
        assert!(!groups.contains_key("boost_01"));
        assert!(!groups.contains_key("portal_01"));
        assert!(!groups.contains_key("checkpoint_01"));
        assert!(!groups.contains_key("floorLine_01"));
        assert!(is_excluded_legacy_icon_id("boost_01"));
        assert!(is_excluded_legacy_icon_id("portal_07"));
        assert!(is_excluded_legacy_icon_id("floorLine_01"));
        assert!(is_glow_frame_name("bird_01_glow_001.png"));
        assert!(is_fireboost_frame_name("fireBoost_001.png"));
    }

    #[test]
    fn is_legacy_icon_glow_sheet_matches_gj_gamesheetglow_variants() {
        assert_eq!(
            is_legacy_icon_glow_sheet("GJ_GameSheetGlow-uhd"),
            Some("-uhd".to_string())
        );
        assert_eq!(
            is_legacy_icon_glow_sheet("GJ_GameSheetGlow-hd"),
            Some("-hd".to_string())
        );
        assert_eq!(is_legacy_icon_glow_sheet("GJ_GameSheet02-uhd"), None);
    }

    #[test]
    fn strip_predicates_remove_extracted_icons_from_gamesheet_and_glow() {
        let extracted: HashSet<String> = ["player_02".to_string(), "bird_01".to_string()]
            .into_iter()
            .collect();

        let exported = HashSet::new();
        assert!(should_remove_from_legacy_gamesheet02(
            "player_02_001.png",
            &extracted,
            &exported
        ));
        assert!(should_remove_from_legacy_gamesheet02(
            "player_02_glow_001.png",
            &extracted,
            &exported
        ));
        assert!(should_remove_from_legacy_gamesheet02(
            "fireBoost_001.png",
            &extracted,
            &exported
        ));
        assert!(should_remove_from_legacy_gamesheet02(
            "edit_eAlphaBtn_001.png",
            &extracted,
            &["edit_eAlphaBtn_001.png".to_string()].into_iter().collect()
        ));
        assert!(!should_remove_from_legacy_gamesheet02(
            "portal_01_back_001.png",
            &extracted,
            &exported
        ));
        assert!(!should_remove_from_legacy_gamesheet02(
            "player_03_001.png",
            &extracted,
            &exported
        ));
        assert!(should_remove_from_legacy_gamesheet02(
            "GJ_featuredBtn_001.png",
            &extracted,
            &exported
        ));

        assert!(should_remove_from_legacy_glow_sheet(
            "bird_01_glow_001.png",
            &extracted
        ));
        assert!(!should_remove_from_legacy_glow_sheet(
            "player_03_glow_001.png",
            &extracted
        ));
        assert!(frame_belongs_to_extracted_icon(
            "robot_01_02_glow_001.png",
            &["robot_01".to_string()].into_iter().collect()
        ));
    }

    #[test]
    fn gamesheet04_moved_frames_are_recognized_and_taken_from_sheet() {
        assert!(is_gamesheet04_moved_frame("GJ_featuredBtn_001.png"));
        assert!(is_gamesheet04_moved_frame("GJ_searchBtn_001.png"));
        assert!(is_gamesheet04_moved_frame("GJ_highscoreBtn_001.png"));
        assert!(is_gamesheet04_moved_frame("GJ_mapPacksBtn_001.png"));
        assert!(is_gamesheet04_moved_frame("gj_createbtn_001.png"));
        assert!(is_gamesheet04_moved_frame("GJ_savedBtn_001.png"));
        assert!(!is_gamesheet04_moved_frame("GJ_playBtn_001.png"));
        assert!(is_gamesheet04_stem("GJ_GameSheet04-uhd"));
        assert!(is_gamesheet04_stem("GJ_GameSheet04"));
        assert!(!is_gamesheet04_stem("GJ_GameSheet-uhd"));
        assert!(is_convert_from_2_0("2.0"));
        assert!(!is_convert_from_2_0("2.1"));

        let mut frames = Dictionary::new();
        frames.insert(
            "GJ_featuredBtn_001.png".to_string(),
            Value::Dictionary(Dictionary::new()),
        );
        frames.insert(
            "keep_me_001.png".to_string(),
            Value::Dictionary(Dictionary::new()),
        );
        let mut root = Dictionary::new();
        root.insert("frames".to_string(), Value::Dictionary(frames));
        let mut plist_root = Value::Dictionary(root);
        let mut sprites = std::collections::BTreeMap::new();
        sprites.insert(
            "GJ_featuredBtn_001.png".to_string(),
            image::RgbaImage::new(2, 2),
        );
        sprites.insert("keep_me_001.png".to_string(), image::RgbaImage::new(2, 2));

        let taken = take_gamesheet04_menu_buttons(&mut plist_root, &mut sprites);
        assert_eq!(taken.len(), 1);
        assert!(taken.contains_key("GJ_featuredBtn_001.png"));
        assert!(!sprites.contains_key("GJ_featuredBtn_001.png"));
        assert!(sprites.contains_key("keep_me_001.png"));
    }

    #[test]
    fn legacy_gj_gamesheet02_example_pack_grouping() {
        use super::frames_dictionary;

        let plist_path = Path::new(
            r"C:\Users\Kevin\Documents\tp\!private packs\new riot\GJ_GameSheet02-uhd.plist",
        );
        if !plist_path.exists() {
            return;
        }

        let root = Value::from_file(plist_path).expect("parse example plist");
        let frames = frames_dictionary(&root).expect("read frames");
        let groups = group_icon_output_frames(frames.keys().cloned());

        assert!(
            groups.len() > 100,
            "expected many icon groups from example pack, got {}",
            groups.len()
        );

        let player_02 = groups.get("player_02").expect("player_02 group");
        assert!(player_02.contains(&"player_02_001.png".to_string()));
        assert!(player_02.contains(&"player_02_2_001.png".to_string()));
        assert!(!player_02.iter().any(|name| name.contains("_glow_")));

        assert!(groups.contains_key("player_ball_00"));
        assert!(!groups.contains_key("boost_01"));
        assert!(!groups.contains_key("checkpoint_01"));
        assert!(!groups.contains_key("portal_01"));
        assert!(!groups.contains_key("floorLine_01"));

        let grouped_count: usize = groups.values().map(|entries| entries.len()).sum();
        assert!(
            grouped_count > 1000,
            "expected most example-pack icon frames to be grouped, got {grouped_count}"
        );
    }

    #[test]
    fn convert_save_writes_format3_from_format2_source() {
        use image::{Rgba, RgbaImage};
        use std::fs;
        use std::time::{SystemTime, UNIX_EPOCH};

        let mut frame = Dictionary::new();
        frame.insert(
            "frame".to_string(),
            Value::String("{{0,0},{2,2}}".to_string()),
        );
        frame.insert("offset".to_string(), Value::String("{0,0}".to_string()));
        frame.insert("rotated".to_string(), Value::Boolean(false));
        frame.insert(
            "sourceColorRect".to_string(),
            Value::String("{{0,0},{2,2}}".to_string()),
        );
        frame.insert("sourceSize".to_string(), Value::String("{2,2}".to_string()));
        let mut frames = Dictionary::new();
        frames.insert("player_02_001.png".to_string(), Value::Dictionary(frame));
        let mut metadata = Dictionary::new();
        metadata.insert("format".to_string(), Value::Integer(2.into()));
        let mut root = Dictionary::new();
        root.insert("frames".to_string(), Value::Dictionary(frames));
        root.insert("metadata".to_string(), Value::Dictionary(metadata));
        let plist_root = Value::Dictionary(root);
        let atlas = RgbaImage::from_pixel(2, 2, Rgba([255, 0, 0, 255]));

        let dir = std::env::temp_dir().join(format!(
            "tm_convert_fmt3_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&dir).expect("temp dir");
        save_merged_sheet(&dir, "player_02-hd", &plist_root, &atlas).expect("save");

        let written = Value::from_file(dir.join("player_02-hd.plist")).expect("reload");
        let metadata = written
            .as_dictionary()
            .and_then(|dict| dict.get("metadata"))
            .and_then(Value::as_dictionary)
            .expect("metadata");
        assert_eq!(
            metadata.get("format").and_then(|value| match value {
                Value::Integer(integer) => integer.as_signed(),
                _ => None,
            }),
            Some(3)
        );
        let frame = written
            .as_dictionary()
            .and_then(|dict| dict.get("frames"))
            .and_then(Value::as_dictionary)
            .and_then(|frames| frames.get("player_02_001.png"))
            .and_then(Value::as_dictionary)
            .expect("frame");
        assert!(frame.contains_key("textureRect"));
        assert!(!frame.contains_key("frame"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn append_sprites_below_atlas_keeps_original_pixels_and_records_new_frame() {
        use image::{Rgba, RgbaImage};

        let atlas = RgbaImage::from_pixel(8, 8, Rgba([255, 0, 0, 255]));
        let sprite = RgbaImage::from_pixel(2, 2, Rgba([0, 255, 0, 255]));
        let mut frame = Dictionary::new();
        frame.insert(
            "textureRect".to_string(),
            Value::String("{{0,0},{2,2}}".to_string()),
        );
        frame.insert("spriteSize".to_string(), Value::String("{2,2}".to_string()));
        frame.insert(
            "spriteOffset".to_string(),
            Value::String("{0,0}".to_string()),
        );
        frame.insert(
            "spriteSourceSize".to_string(),
            Value::String("{2,2}".to_string()),
        );
        frame.insert("textureRotated".to_string(), Value::Boolean(false));
        let prepared =
            super::prepare_append_sprite("new.png".to_string(), Value::Dictionary(frame), sprite)
                .expect("prepare");

        let mut frames = Dictionary::new();
        let mut existing = Dictionary::new();
        existing.insert(
            "textureRect".to_string(),
            Value::String("{{1,1},{4,4}}".to_string()),
        );
        frames.insert("old.png".to_string(), Value::Dictionary(existing));
        let mut metadata = Dictionary::new();
        metadata.insert("format".to_string(), Value::Integer(3.into()));
        metadata.insert("size".to_string(), Value::String("{8,8}".to_string()));
        let mut root = Dictionary::new();
        root.insert("frames".to_string(), Value::Dictionary(frames));
        root.insert("metadata".to_string(), Value::Dictionary(metadata));
        let mut plist_root = Value::Dictionary(root);

        let out = super::append_sprites_below_atlas(atlas, vec![prepared], &mut plist_root)
            .expect("append");
        assert!(out.height() > 8);
        assert_eq!(out.get_pixel(0, 0).0, [255, 0, 0, 255]);
        let frames = super::frames_dictionary(&plist_root).expect("frames");
        assert!(frames.contains_key("old.png"));
        assert!(frames.contains_key("new.png"));
        let old_rect = frames
            .get("old.png")
            .and_then(Value::as_dictionary)
            .and_then(|dict| dict.get("textureRect"))
            .and_then(Value::as_string)
            .expect("old rect");
        assert_eq!(old_rect, "{{1,1},{4,4}}");
    }

    #[test]
    fn replace_sprites_in_atlas_overwrites_existing_slot_without_growing_height() {
        use image::{Rgba, RgbaImage};

        let mut atlas = RgbaImage::from_pixel(8, 8, Rgba([255, 0, 0, 255]));
        for y in 2..6 {
            for x in 2..6 {
                atlas.put_pixel(x, y, Rgba([0, 0, 255, 255]));
            }
        }
        let replacement = RgbaImage::from_pixel(4, 4, Rgba([0, 255, 0, 255]));
        let mut frame = Dictionary::new();
        frame.insert(
            "textureRect".to_string(),
            Value::String("{{2,2},{4,4}}".to_string()),
        );
        frame.insert("spriteSize".to_string(), Value::String("{4,4}".to_string()));
        frame.insert(
            "spriteOffset".to_string(),
            Value::String("{0,0}".to_string()),
        );
        frame.insert(
            "spriteSourceSize".to_string(),
            Value::String("{4,4}".to_string()),
        );
        frame.insert("textureRotated".to_string(), Value::Boolean(false));
        let prepared = super::prepare_append_sprite(
            "GJ_featuredBtn_001.png".to_string(),
            Value::Dictionary(frame.clone()),
            replacement,
        )
        .expect("prepare");

        let mut frames = Dictionary::new();
        frames.insert(
            "GJ_featuredBtn_001.png".to_string(),
            Value::Dictionary(frame),
        );
        let mut metadata = Dictionary::new();
        metadata.insert("format".to_string(), Value::Integer(3.into()));
        metadata.insert("size".to_string(), Value::String("{8,8}".to_string()));
        let mut root = Dictionary::new();
        root.insert("frames".to_string(), Value::Dictionary(frames));
        root.insert("metadata".to_string(), Value::Dictionary(metadata));
        let mut plist_root = Value::Dictionary(root);

        let out = super::replace_sprites_in_atlas(atlas, vec![prepared], &mut plist_root)
            .expect("replace");
        assert_eq!(out.width(), 8);
        assert_eq!(out.height(), 8);
        assert_eq!(out.get_pixel(0, 0).0, [255, 0, 0, 255]);
        assert_eq!(out.get_pixel(2, 2).0, [0, 255, 0, 255]);
        assert_eq!(out.get_pixel(5, 5).0, [0, 255, 0, 255]);
        let frames = super::frames_dictionary(&plist_root).expect("frames");
        let rect = frames
            .get("GJ_featuredBtn_001.png")
            .and_then(Value::as_dictionary)
            .and_then(|dict| dict.get("textureRect"))
            .and_then(Value::as_string)
            .expect("rect");
        assert_eq!(rect, "{{2,2},{4,4}}");
    }

    #[test]
    fn convert_legacy_icon_gamesheet_streams_icons_without_full_sheet_remesh() {
        use crate::core::contracts::{phase_defaults, MergerOptions};
        use crate::core::discovery::SheetCandidate;
        use crate::core::game_files::GameFilesLayout;
        use crate::core::image_io::save_rgba_png_fast;
        use crate::core::report::OperationProgress;
        use image::{Rgba, RgbaImage};
        use std::fs;
        use std::sync::atomic::AtomicBool;
        use std::sync::{Arc, Mutex};
        use std::time::{SystemTime, UNIX_EPOCH};

        let root = std::env::temp_dir().join(format!(
            "tm_legacy_gs02_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&root).expect("temp dir");
        let gd = root.join("gd");
        fs::create_dir_all(gd.join("Resources")).expect("resources");
        let layout = GameFilesLayout {
            root: root.join("cache"),
            geometry_dash_dir: gd.clone(),
            resources: gd.join("Resources"),
            geode_resources: gd.join("geode").join("resources"),
            geode_unzipped: gd.join("geode").join("unzipped"),
            current_split: root.join("split-cache"),
            legacy: root.join("legacy"),
        };

        let mut atlas = RgbaImage::from_pixel(8, 8, Rgba([0, 0, 0, 0]));
        for y in 0..4 {
            for x in 0..4 {
                atlas.put_pixel(x, y, Rgba([255, 0, 0, 255]));
                atlas.put_pixel(x + 4, y, Rgba([0, 255, 0, 255]));
            }
        }
        let png_path = root.join("GJ_GameSheet02-uhd.png");
        save_rgba_png_fast(&png_path, &atlas).expect("png");

        let mut frame_a = Dictionary::new();
        frame_a.insert(
            "textureRect".to_string(),
            Value::String("{{0,0},{4,4}}".to_string()),
        );
        frame_a.insert("spriteSize".to_string(), Value::String("{4,4}".to_string()));
        frame_a.insert(
            "spriteOffset".to_string(),
            Value::String("{0,0}".to_string()),
        );
        frame_a.insert(
            "spriteSourceSize".to_string(),
            Value::String("{4,4}".to_string()),
        );
        frame_a.insert("textureRotated".to_string(), Value::Boolean(false));
        let mut frame_b = frame_a.clone();
        frame_b.insert(
            "textureRect".to_string(),
            Value::String("{{4,0},{4,4}}".to_string()),
        );
        let mut frames = Dictionary::new();
        frames.insert("player_01_001.png".to_string(), Value::Dictionary(frame_a));
        frames.insert(
            "player_01_2_001.png".to_string(),
            Value::Dictionary(frame_b),
        );
        let mut metadata = Dictionary::new();
        metadata.insert("format".to_string(), Value::Integer(3.into()));
        metadata.insert("size".to_string(), Value::String("{8,8}".to_string()));
        let mut root_dict = Dictionary::new();
        root_dict.insert("frames".to_string(), Value::Dictionary(frames));
        root_dict.insert("metadata".to_string(), Value::Dictionary(metadata));
        let plist_path = root.join("GJ_GameSheet02-uhd.plist");
        Value::Dictionary(root_dict)
            .to_file_xml(&plist_path)
            .expect("plist");

        let pair = SheetCandidate {
            stem: "GJ_GameSheet02-uhd".to_string(),
            relative_dir: PathBuf::new(),
            plist_path,
            png_path,
        };
        let converted_dir = root.join("out");
        fs::create_dir_all(&converted_dir).expect("out");
        let progress = Arc::new(Mutex::new(|_p: OperationProgress| {}));
        let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let plists_done = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let cancel = AtomicBool::new(false);
        let merger_opts = MergerOptions {
            include_outside_plist_files: false,
            dimensions: None,
            sheet_concurrency: 1,
        };
        let outcome = super::convert_legacy_icon_gamesheet(
            &pair,
            "-uhd",
            std::slice::from_ref(&pair),
            &phase_defaults().splitter,
            &merger_opts,
            &layout,
            &converted_dir,
            8,
            &completed,
            &plists_done,
            1,
            &progress,
            &cancel,
        )
        .expect("convert legacy gs02");
        assert!(outcome.sheets_written >= 1);
        assert!(converted_dir
            .join("icons")
            .join("player_01-uhd.plist")
            .is_file());
        assert!(converted_dir
            .join("icons")
            .join("player_01-uhd.png")
            .is_file());
        let _ = fs::remove_dir_all(&root);
    }
}
