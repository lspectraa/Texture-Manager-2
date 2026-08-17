use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use image::RgbaImage;
use plist::{Dictionary, Value};

use crate::core::contracts::{
    phase_defaults, ConvertToNewVersionOptions, MergerOptions, OperationPlan, SplitterOptions,
};
use crate::core::discovery::{discover_unpaired_pngs, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::game_files::{
    discover_sheet_pairs_with_game_plist_fallback, ensure_input_sheet_latest_split_cached,
    find_current_sheet_for_input, normalize_legacy_version, resolve_cached_split_sprite,
    sheet_uses_external_plist, GameFilesLayout,
};
use crate::core::image_alpha::clear_orthogonally_isolated_pixels;
use crate::core::merger::merge_plist_from_memory;
use crate::core::plist::count_frames_in_plist;
use crate::core::porter::flattened_bundle_output_dir;
use crate::core::report::{OperationProgress, OperationReport, ReportIssue, ReportLevel};
use crate::core::splitter::{split_sheet_candidate_memory, SplitMemoryResult};

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

fn load_latest_sheet_sprites(
    source_pair: &SheetCandidate,
    splitter_opts: &SplitterOptions,
) -> Result<HashMap<String, RgbaImage>, AppError> {
    let split = split_sheet_candidate_memory(source_pair, splitter_opts, || {})?;
    Ok(split.sprites.into_iter().collect())
}

fn latest_sheet_sprite_from_cache(
    latest_plist_path: &Path,
    source_pair: Option<&SheetCandidate>,
    frame_name: &str,
    splitter_opts: &SplitterOptions,
    latest_sheet_sprite_cache: &Arc<Mutex<HashMap<String, HashMap<String, RgbaImage>>>>,
) -> Result<Option<RgbaImage>, AppError> {
    let cache_key = latest_plist_path.to_string_lossy().to_string();
    {
        let cache_guard = latest_sheet_sprite_cache.lock().unwrap();
        if let Some(map) = cache_guard.get(&cache_key) {
            return Ok(map.get(frame_name).cloned());
        }
    }

    let Some(source_pair) = source_pair else {
        return Ok(None);
    };
    let loaded = load_latest_sheet_sprites(source_pair, splitter_opts)?;
    let sprite = loaded.get(frame_name).cloned();
    let mut cache_guard = latest_sheet_sprite_cache.lock().unwrap();
    cache_guard.insert(cache_key, loaded);
    Ok(sprite)
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

/// Legacy combined-icon GS02 split only applies when converting from 2.11 packs.
pub(crate) fn is_legacy_icon_split_version(game_version: &str) -> bool {
    normalize_legacy_version(game_version) == "2.11"
}

pub(crate) fn is_glow_frame_name(frame_name: &str) -> bool {
    frame_name.contains("_glow_")
}

pub(crate) fn is_fireboost_frame_name(frame_name: &str) -> bool {
    frame_name.eq_ignore_ascii_case("fireBoost_001.png")
}

fn find_legacy_glow_sheet_pair<'a>(
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
        return Some(format!("{}_{}", parts[0], parts[1]));
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
) -> bool {
    if is_fireboost_frame_name(frame_name) {
        return true;
    }
    // Keep excluded types (portal/boost/…) on a rewritten GS02 when modern remerge
    // did not run; those frames are handled separately via remerge when available.
    frame_belongs_to_extracted_icon(frame_name, extracted_icon_ids)
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
    F: FnMut(OperationProgress) + Send + 'static,
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
    split: &SplitMemoryResult,
) -> Result<BTreeMap<String, (Value, RgbaImage)>, AppError> {
    let frames = frames_dictionary(&split.plist_root)?;
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
        let Some(sprite) = split.sprites.get(frame_name) else {
            continue;
        };
        excluded.insert(frame_name.clone(), (frame_value.clone(), sprite.clone()));
    }
    Ok(excluded)
}

fn remerge_excluded_into_modern_gamesheet02<F>(
    quality_suffix: &str,
    excluded_frames: &BTreeMap<String, (Value, RgbaImage)>,
    game_files: &GameFilesLayout,
    splitter_opts: &SplitterOptions,
    merger_opts: &MergerOptions,
    converted_dir: &Path,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    on_progress: &Arc<Mutex<F>>,
    issues: &mut Vec<ReportIssue>,
) -> Result<usize, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
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

    let completed_ref = Arc::clone(completed);
    let on_progress_ref = Arc::clone(on_progress);
    let plists_ref = Arc::clone(plists_done_atomic);
    let label = modern_stem.clone();
    let mut modern_split = split_sheet_candidate_memory(&modern_pair, splitter_opts, || {
        let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress_ref.lock().unwrap()(operation_progress(
            format!("{label} (modern base)"),
            n,
            total_units,
            plists_ref.load(Ordering::Relaxed),
            plists_total,
        ));
    })?;
    issues.append(&mut modern_split.issues);

    let mut merged_plist_root = modern_split.plist_root;
    let mut merged_sprites = modern_split.sprites;
    let frames_mut = frames_dictionary_mut(&mut merged_plist_root)?;
    let mut replaced = 0usize;
    let mut added = 0usize;
    for (frame_name, (frame_value, sprite)) in excluded_frames {
        let existed = frames_mut.contains_key(frame_name);
        frames_mut.insert(frame_name.clone(), frame_value.clone());
        merged_sprites.insert(frame_name.clone(), sprite.clone());
        if existed {
            replaced = replaced.saturating_add(1);
        } else {
            added = added.saturating_add(1);
        }
    }

    let completed_ref = Arc::clone(completed);
    let on_progress_ref = Arc::clone(on_progress);
    let plists_ref = Arc::clone(plists_done_atomic);
    let pack_label = modern_stem.clone();
    let (atlas, _w, _h, _count, merge_issues) = merge_plist_from_memory(
        &mut merged_plist_root,
        &merged_sprites,
        pack_label.as_str(),
        merger_opts,
        &mut |_label| {
            let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress_ref.lock().unwrap()(operation_progress(
                format!("{pack_label} (remerge)"),
                n,
                total_units,
                plists_ref.load(Ordering::Relaxed),
                plists_total,
            ));
        },
    )?;
    issues.extend(merge_issues);

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

fn collect_glow_frames_for_icon_from_split(
    icon_id: &str,
    split: &SplitMemoryResult,
) -> BTreeMap<String, (Value, RgbaImage)> {
    let mut glow_frames: BTreeMap<String, (Value, RgbaImage)> = BTreeMap::new();
    let Ok(frames) = frames_dictionary(&split.plist_root) else {
        return glow_frames;
    };
    for (frame_name, frame_value) in frames {
        if !is_glow_frame_name(frame_name) {
            continue;
        }
        if icon_sheet_id_from_frame_name(frame_name).as_deref() != Some(icon_id) {
            continue;
        }
        let Some(sprite) = split.sprites.get(frame_name).cloned() else {
            continue;
        };
        glow_frames.insert(frame_name.clone(), (frame_value.clone(), sprite));
    }
    glow_frames
}

fn resolve_glow_frames_for_icon(
    icon_id: &str,
    sheet02_split: &SplitMemoryResult,
    glow_sheet_split: Option<&SplitMemoryResult>,
) -> BTreeMap<String, (Value, RgbaImage)> {
    if let Some(glow_split) = glow_sheet_split {
        let from_glow = collect_glow_frames_for_icon_from_split(icon_id, glow_split);
        if !from_glow.is_empty() {
            return from_glow;
        }
    }
    collect_glow_frames_for_icon_from_split(icon_id, sheet02_split)
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
        for key in ["format", "pixelFormat", "premultiplyAlpha"] {
            if let Some(value) = source_meta.get(key) {
                metadata.insert(key.to_string(), value.clone());
            }
        }
    }
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
) -> Result<ConvertSheetWorkOutcome, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let mut issues: Vec<ReportIssue> = Vec::new();
    let stem = pair.stem.clone();

    let glow_sheet_pair =
        find_legacy_glow_sheet_pair(all_sheet_pairs, &pair.relative_dir, quality_suffix);
    let glow_sheet_split = if let Some(glow_pair) = glow_sheet_pair {
        let glow_stem = glow_pair.stem.clone();
        let completed_ref = Arc::clone(completed);
        let on_progress_ref = Arc::clone(on_progress);
        let plists_ref = Arc::clone(plists_done_atomic);
        let mut glow_split = split_sheet_candidate_memory(glow_pair, splitter_opts, || {
            let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress_ref.lock().unwrap()(operation_progress(
                glow_stem.clone(),
                n,
                total_units,
                plists_ref.load(Ordering::Relaxed),
                plists_total,
            ));
        })?;
        issues.append(&mut glow_split.issues);
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message:
                "icon glow sprites: prefer accompanying GJ_GameSheetGlow, fall back to GJ_GameSheet02"
                    .to_string(),
            file: Some(format!("{}.plist", glow_pair.stem)),
        });
        Some(glow_split)
    } else {
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message:
                "no accompanying GJ_GameSheetGlow found; icon glow sprites will use GJ_GameSheet02 when present"
                    .to_string(),
            file: Some(format!("{}.plist", pair.stem)),
        });
        None
    };

    let completed_ref = Arc::clone(completed);
    let on_progress_ref = Arc::clone(on_progress);
    let plists_ref = Arc::clone(plists_done_atomic);
    let mut split = split_sheet_candidate_memory(pair, splitter_opts, || {
        let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress_ref.lock().unwrap()(operation_progress(
            stem.clone(),
            n,
            total_units,
            plists_ref.load(Ordering::Relaxed),
            plists_total,
        ));
    })?;
    issues.append(&mut split.issues);

    if let Some(sprite) = split.sprites.get("fireBoost_001.png") {
        let fireboost_path = converted_dir.join("fireBoost_001.png");
        let cleaned = clear_orthogonally_isolated_pixels(sprite);
        crate::core::image_io::save_rgba_png_fast(&fireboost_path, &cleaned)?;
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message: "exported standalone fireBoost_001.png to converted output root".to_string(),
            file: Some(fireboost_path.to_string_lossy().to_string()),
        });
    }

    let frame_names: Vec<String> = frames_dictionary(&split.plist_root)?
        .keys()
        .cloned()
        .collect();
    let groups = group_icon_output_frames(frame_names.iter().cloned());
    let excluded_frames = collect_excluded_legacy_frames(&split)?;

    let grouped_count: usize = groups.values().map(|frames| frames.len()).sum();
    if grouped_count < frame_names.len() {
        for frame_name in &frame_names {
            if is_fireboost_frame_name(frame_name) {
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

    for (icon_id, icon_frame_names) in &groups {
        let output_stem = format!("{icon_id}{quality_suffix}");
        let glow_frames =
            resolve_glow_frames_for_icon(icon_id.as_str(), &split, glow_sheet_split.as_ref());

        let mut frame_entries: BTreeMap<String, Value> = BTreeMap::new();
        let sheet02_frames = frames_dictionary(&split.plist_root)?;
        for frame_name in icon_frame_names {
            if let Some(value) = sheet02_frames.get(frame_name) {
                frame_entries.insert(frame_name.clone(), value.clone());
            }
        }
        for (frame_name, (frame_value, _sprite)) in &glow_frames {
            frame_entries.insert(frame_name.clone(), frame_value.clone());
        }

        let mut icon_plist_root =
            build_icon_plist_from_frames(&frame_entries, &split.plist_root, output_stem.as_str())?;

        let mut icon_sprites: BTreeMap<String, RgbaImage> = BTreeMap::new();
        for frame_name in icon_frame_names {
            if let Some(sprite) = split.sprites.get(frame_name) {
                icon_sprites.insert(frame_name.clone(), sprite.clone());
            }
        }
        for (frame_name, (_frame_value, sprite)) in glow_frames {
            icon_sprites.insert(frame_name, sprite);
        }

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
        splitter_opts,
        merger_opts,
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
        sheets_written = sheets_written.saturating_add(rewrite_sheet_without_frames(
            &split,
            &|frame_name| should_remove_from_legacy_gamesheet02(frame_name, &extracted_icon_ids),
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

    if let (Some(glow_pair), Some(glow_split)) = (glow_sheet_pair, glow_sheet_split.as_ref()) {
        let glow_relative: PathBuf = if glow_pair.relative_dir.as_os_str().is_empty() {
            PathBuf::from(&glow_pair.stem)
        } else {
            glow_pair.relative_dir.join(&glow_pair.stem)
        };
        sheets_written = sheets_written.saturating_add(rewrite_sheet_without_frames(
            glow_split,
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
    })
}

struct ConvertSheetWorkOutcome {
    sheets_written: usize,
    issues: Vec<ReportIssue>,
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
    plist_root
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
    latest_sheet_sprite_cache: &Arc<Mutex<HashMap<String, HashMap<String, RgbaImage>>>>,
    converted_dir: &Path,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    legacy_icon_split: bool,
    on_progress: &Arc<Mutex<F>>,
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
            );
        }
    }

    let completed_ref = Arc::clone(completed);
    let on_progress_ref = Arc::clone(on_progress);
    let plists_ref = Arc::clone(plists_done_atomic);
    let split = split_sheet_candidate_memory(pair, splitter_opts, || {
        let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress_ref.lock().unwrap()(operation_progress(
            stem.clone(),
            n,
            total_units,
            plists_ref.load(Ordering::Relaxed),
            plists_total,
        ));
    })?;
    issues.extend(split.issues);

    let input_frame_names = frame_name_set(&split.plist_root)?;
    let Some((latest_source_pair, latest_split_dir)) =
        ensure_input_sheet_latest_split_cached(game_files, pair, splitter_opts)?
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
        });
    };
    let latest_plist_path = latest_source_pair.plist_path.clone();

    let latest_plist_root = Value::from_file(&latest_plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse latest plist: {err}")))?;
    let latest_frames = frames_dictionary(&latest_plist_root)?;
    let missing_frame_keys = missing_frame_keys(latest_frames, &input_frame_names);

    if missing_frame_keys.is_empty() {
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
        });
    }

    let mut merged_plist_root = split.plist_root.clone();
    let mut merged_sprites = split.sprites.clone();
    let frames_mut = frames_dictionary_mut(&mut merged_plist_root)?;
    let mut merged_additions = 0usize;
    for frame_name in missing_frame_keys {
        let Some(frame_value) = latest_frames.get(&frame_name).cloned() else {
            continue;
        };
        let Some(sprite_path) = resolve_cached_split_sprite(&latest_split_dir, &frame_name) else {
            match latest_sheet_sprite_from_cache(
                latest_plist_path.as_path(),
                Some(&latest_source_pair),
                &frame_name,
                splitter_opts,
                latest_sheet_sprite_cache,
            ) {
                Ok(Some(sprite)) => {
                    frames_mut.insert(frame_name.clone(), frame_value);
                    merged_sprites.insert(frame_name, sprite);
                    merged_additions = merged_additions.saturating_add(1);
                    continue;
                }
                Ok(None) => {
                    issues.push(ReportIssue {
                        level: ReportLevel::Warning,
                        message: "missing sprite payload in latest placeholder split data"
                            .to_string(),
                        file: Some(frame_name),
                    });
                    continue;
                }
                Err(err) => {
                    issues.push(ReportIssue {
                        level: ReportLevel::Warning,
                        message: format!("failed latest gamesheet fallback payload lookup: {err}"),
                        file: Some(frame_name),
                    });
                    continue;
                }
            }
        };
        let sprite = match image::open(&sprite_path) {
            Ok(img) => img.to_rgba8(),
            Err(err) => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: format!("failed to open latest sprite payload: {err}"),
                    file: Some(sprite_path.to_string_lossy().to_string()),
                });
                continue;
            }
        };
        frames_mut.insert(frame_name.clone(), frame_value);
        merged_sprites.insert(frame_name, sprite);
        merged_additions = merged_additions.saturating_add(1);
    }

    if merged_additions == 0 {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message:
                "sheet has missing frame keys but no mergeable payloads; keeping original sheet content"
                    .to_string(),
            file: Some(format!("{}.plist", pair.stem)),
        });
    }

    let relative_sheet: PathBuf = if pair.relative_dir.as_os_str().is_empty() {
        PathBuf::from(&pair.stem)
    } else {
        pair.relative_dir.join(&pair.stem)
    };
    let destination_dir = flattened_bundle_output_dir(converted_dir, &relative_sheet);

    let completed_ref = Arc::clone(completed);
    let on_progress_ref = Arc::clone(on_progress);
    let plists_ref = Arc::clone(plists_done_atomic);
    let label_stem = pair.stem.clone();
    let (atlas, _w, _h, _count, merge_issues) = merge_plist_from_memory(
        &mut merged_plist_root,
        &merged_sprites,
        label_stem.as_str(),
        merger_opts,
        &mut |_label| {
            let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress_ref.lock().unwrap()(operation_progress(
                format!("{label_stem} (pack)"),
                n,
                total_units,
                plists_ref.load(Ordering::Relaxed),
                plists_total,
            ));
        },
    )?;
    issues.extend(merge_issues);

    save_merged_sheet(
        &destination_dir,
        pair.stem.as_str(),
        &merged_plist_root,
        &atlas,
    )?;

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
    let legacy_icon_split = is_legacy_icon_split_version(&options.game_version);
    let all_sheet_pairs: Vec<SheetCandidate> =
        discover_sheet_pairs_with_game_plist_fallback(input_dir, game_files)?;
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
    let latest_sheet_sprite_cache: Arc<Mutex<HashMap<String, HashMap<String, RgbaImage>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    check_cancel(cancel.as_ref())?;
    let cancel_for_convert = Arc::clone(&cancel);
    let completed_for_pool = Arc::clone(&completed);
    let plists_for_pool = Arc::clone(&plists_done_atomic);
    let progress_for_pool = Arc::clone(on_progress);
    let latest_sheet_sprite_cache_for_pool = Arc::clone(&latest_sheet_sprite_cache);
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
                &latest_sheet_sprite_cache_for_pool,
                converted_dir_for_convert.as_path(),
                total_units,
                &completed_for_pool,
                &plists_for_pool,
                plists_total,
                legacy_icon_split,
                &progress_for_pool,
            )
        }),
    )?;

    for entry in results {
        let outcome = match entry {
            Ok(value) => value,
            Err(err) => return Err(err),
        };
        sheets_written = sheets_written.saturating_add(outcome.sheets_written);
        issues.extend(outcome.issues);
    }

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
    use std::path::Path;

    use plist::{Dictionary, Value};

    use super::{
        frame_belongs_to_extracted_icon, group_frame_names_by_icon_id, group_icon_output_frames,
        icon_sheet_id_from_frame_name, is_excluded_legacy_icon_id, is_fireboost_frame_name,
        is_glow_frame_name, is_icon_sprite, is_legacy_combined_icon_sheet,
        is_legacy_icon_glow_sheet, is_legacy_icon_split_version, missing_frame_keys,
        sheet_is_under_icons, should_remove_from_legacy_gamesheet02,
        should_remove_from_legacy_glow_sheet,
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
    fn is_legacy_icon_split_version_only_matches_2_11() {
        assert!(is_legacy_icon_split_version("2.11"));
        assert!(is_legacy_icon_split_version(" 2.11 "));
        assert!(is_legacy_icon_split_version("v2.11"));
        assert!(!is_legacy_icon_split_version("2.2"));
        assert!(!is_legacy_icon_split_version("2.205"));
        assert!(!is_legacy_icon_split_version(""));
    }

    #[test]
    fn resolve_glow_frames_prefers_glow_sheet_then_gamesheet02() {
        use super::resolve_glow_frames_for_icon;
        use crate::core::splitter::SplitMemoryResult;
        use image::RgbaImage;
        use plist::{Dictionary, Value};
        use std::collections::BTreeMap;

        fn split_with_frames(frames: Vec<(&str, RgbaImage)>) -> SplitMemoryResult {
            let mut frames_dict = Dictionary::new();
            let mut sprites = BTreeMap::new();
            for (name, sprite) in frames {
                frames_dict.insert(name.to_string(), Value::Dictionary(Dictionary::new()));
                sprites.insert(name.to_string(), sprite);
            }
            let mut root = Dictionary::new();
            root.insert("frames".to_string(), Value::Dictionary(frames_dict));
            SplitMemoryResult {
                plist_root: Value::Dictionary(root),
                sprites,
                files_processed: 0,
                issues: Vec::new(),
            }
        }

        let tiny = || RgbaImage::from_pixel(1, 1, image::Rgba([255, 255, 255, 255]));
        let sheet02 = split_with_frames(vec![
            ("player_02_001.png", tiny()),
            ("player_02_glow_001.png", tiny()),
            ("player_03_glow_001.png", tiny()),
        ]);
        let glow_sheet = split_with_frames(vec![("player_02_glow_001.png", tiny())]);

        let from_glow = resolve_glow_frames_for_icon("player_02", &sheet02, Some(&glow_sheet));
        assert_eq!(from_glow.len(), 1);
        assert!(from_glow.contains_key("player_02_glow_001.png"));

        let from_sheet02_fallback =
            resolve_glow_frames_for_icon("player_03", &sheet02, Some(&glow_sheet));
        assert_eq!(from_sheet02_fallback.len(), 1);
        assert!(from_sheet02_fallback.contains_key("player_03_glow_001.png"));

        let no_glow_sheet = resolve_glow_frames_for_icon("player_02", &sheet02, None);
        assert_eq!(no_glow_sheet.len(), 1);
        assert!(no_glow_sheet.contains_key("player_02_glow_001.png"));
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
        assert_eq!(icon_sheet_id_from_frame_name("not_an_icon.png"), None);
    }

    #[test]
    fn is_icon_sprite_uses_folder_or_frame_identity_not_sheet_filename() {
        assert!(is_icon_sprite(Path::new("icons"), "anything.png"));
        assert!(is_icon_sprite(Path::new("pack/icons/extra"), "weird.png"));
        assert!(is_icon_sprite(Path::new(""), "player_02_001.png"));
        assert!(is_icon_sprite(Path::new(""), "bird_01_glow_001.png"));
        assert!(is_icon_sprite(Path::new(""), "robot_01_03_001.png"));
        assert!(!is_icon_sprite(Path::new(""), "edit_eAlphaBtn_001.png"));
        assert!(!is_icon_sprite(Path::new(""), "portal_01_front_001.png"));
        assert!(!is_icon_sprite(Path::new(""), "boost_01_001.png"));
        assert!(!is_icon_sprite(Path::new(""), "GJ_GameSheet02-uhd.png"));
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

        assert!(should_remove_from_legacy_gamesheet02(
            "player_02_001.png",
            &extracted
        ));
        assert!(should_remove_from_legacy_gamesheet02(
            "player_02_glow_001.png",
            &extracted
        ));
        assert!(should_remove_from_legacy_gamesheet02(
            "fireBoost_001.png",
            &extracted
        ));
        assert!(!should_remove_from_legacy_gamesheet02(
            "portal_01_back_001.png",
            &extracted
        ));
        assert!(!should_remove_from_legacy_gamesheet02(
            "player_03_001.png",
            &extracted
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
}
