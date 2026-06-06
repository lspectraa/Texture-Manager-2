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
use crate::core::discovery::{discover_sheet_pairs, SheetCandidate};
use crate::core::errors::AppError;
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

fn resolve_latest_placeholder_split_dir() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(env_override) = std::env::var("TM_LATEST_SPLIT_DIR") {
        if !env_override.trim().is_empty() {
            candidates.push(PathBuf::from(env_override));
        }
    }
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest_dir.join("..").join("..").join("Default"));
    candidates.push(
        manifest_dir
            .join("..")
            .join("..")
            .join("Default")
            .join("Split"),
    );
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("Default"));
        candidates.push(cwd.join("..").join("Default"));
        candidates.push(cwd.join("..").join("..").join("Default"));
        candidates.push(cwd.join("Default").join("Split"));
        candidates.push(cwd.join("..").join("Default").join("Split"));
        candidates.push(cwd.join("..").join("..").join("Default").join("Split"));
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.exists() && candidate.is_dir())
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

fn build_latest_plist_index(latest_split_dir: &Path) -> Result<HashMap<String, PathBuf>, AppError> {
    let mut index: HashMap<String, PathBuf> = HashMap::new();
    for plist_path in collect_plists_recursive(latest_split_dir)? {
        let Some(stem) = plist_path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        index.insert(stem.to_ascii_lowercase(), plist_path);
    }
    Ok(index)
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

fn resolve_latest_sheet_png_path(latest_plist_path: &Path) -> Result<PathBuf, AppError> {
    let parent = latest_plist_path.parent().ok_or(AppError::InvalidPath(
        "latest plist has no parent directory",
    ))?;
    let direct = latest_plist_path.with_extension("png");
    if direct.exists() {
        return Ok(direct);
    }

    let root = Value::from_file(latest_plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse latest plist: {err}")))?;
    let root_dict = root.as_dictionary().ok_or_else(|| {
        AppError::ParseError("latest plist root must be a dictionary".to_string())
    })?;
    if let Some(metadata) = root_dict.get("metadata").and_then(Value::as_dictionary) {
        for key in ["realTextureFileName", "textureFileName"] {
            let Some(file_name) = metadata.get(key).and_then(Value::as_string) else {
                continue;
            };
            let candidate = parent.join(file_name);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    Ok(direct)
}

fn load_latest_sheet_sprites(
    latest_plist_path: &Path,
    splitter_opts: &SplitterOptions,
) -> Result<HashMap<String, RgbaImage>, AppError> {
    let stem = latest_plist_path
        .file_stem()
        .and_then(|v| v.to_str())
        .ok_or(AppError::InvalidPath(
            "latest placeholder plist has invalid file stem",
        ))?
        .to_string();
    let png_path = resolve_latest_sheet_png_path(latest_plist_path)?;
    let candidate = SheetCandidate {
        stem,
        relative_dir: PathBuf::new(),
        plist_path: latest_plist_path.to_path_buf(),
        png_path,
    };
    let split = split_sheet_candidate_memory(&candidate, splitter_opts, || {})?;
    Ok(split.sprites.into_iter().collect())
}

fn latest_sheet_sprite_from_cache(
    latest_plist_path: &Path,
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

    let loaded = load_latest_sheet_sprites(latest_plist_path, splitter_opts)?;
    let sprite = loaded.get(frame_name).cloned();
    let mut cache_guard = latest_sheet_sprite_cache.lock().unwrap();
    cache_guard.insert(cache_key, loaded);
    Ok(sprite)
}

fn resolve_split_sprite_path(source_dir: &Path, frame_name: &str) -> Option<PathBuf> {
    let normalized = frame_name
        .replace('\\', "/")
        .trim_start_matches("./")
        .trim_start_matches('/')
        .to_string();

    let direct = source_dir.join(path_from_slashes(&normalized));
    if direct.exists() {
        return Some(direct);
    }

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
            let trimmed_path = source_dir.join(path_from_slashes(trimmed));
            if trimmed_path.exists() {
                return Some(trimmed_path);
            }
        }
    }

    if let Some(file_name_only) = normalized.rsplit('/').next() {
        let direct_filename = source_dir.join(file_name_only);
        if direct_filename.exists() {
            return Some(direct_filename);
        }
        if let Some(found) = recursive_find_file_named(source_dir, file_name_only) {
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
            let candidate = source_dir.join(path_from_slashes(&remainder));
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
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
    sheet_pairs.iter().find(|pair| {
        pair.relative_dir == relative_dir && pair.stem.eq_ignore_ascii_case(&stem)
    })
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
    latest_plist_path: Option<&Path>,
    splitter_opts: &SplitterOptions,
    latest_sheet_sprite_cache: &Arc<Mutex<HashMap<String, HashMap<String, RgbaImage>>>>,
) -> Result<BTreeMap<String, (Value, RgbaImage)>, AppError> {
    if let Some(glow_split) = glow_sheet_split {
        return Ok(collect_glow_frames_for_icon_from_split(icon_id, glow_split));
    }

    if let Some(latest_path) = latest_plist_path {
        let latest_plist_root = Value::from_file(latest_path)
            .map_err(|err| AppError::ParseError(format!("failed to parse latest icon plist: {err}")))?;
        let latest_frames = frames_dictionary(&latest_plist_root)?;
        let mut glow_frames: BTreeMap<String, (Value, RgbaImage)> = BTreeMap::new();
        for (frame_name, frame_value) in latest_frames {
            if !is_glow_frame_name(frame_name) {
                continue;
            }
            if icon_sheet_id_from_frame_name(frame_name).as_deref() != Some(icon_id) {
                continue;
            }
            let sprite = match latest_sheet_sprite_from_cache(
                latest_path,
                frame_name,
                splitter_opts,
                latest_sheet_sprite_cache,
            )? {
                Some(sprite) => sprite,
                None => continue,
            };
            glow_frames.insert(frame_name.clone(), (frame_value.clone(), sprite));
        }
        if !glow_frames.is_empty() {
            return Ok(glow_frames);
        }
    }

    Ok(collect_glow_frames_for_icon_from_split(
        icon_id,
        sheet02_split,
    ))
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
    latest_plists_by_stem: &HashMap<String, PathBuf>,
    latest_sheet_sprite_cache: &Arc<Mutex<HashMap<String, HashMap<String, RgbaImage>>>>,
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
            message: "using accompanying GJ_GameSheetGlow for icon glow sprites".to_string(),
            file: Some(format!("{}.plist", glow_pair.stem)),
        });
        Some(glow_split)
    } else {
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message:
                "no accompanying GJ_GameSheetGlow found; icon glow sprites will use latest placeholders when available"
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
        crate::core::image_io::save_rgba_png_fast(&fireboost_path, sprite)?;
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

    let grouped_count: usize = groups.values().map(|frames| frames.len()).sum();
    if grouped_count < frame_names.len() {
        for frame_name in &frame_names {
            if is_fireboost_frame_name(frame_name) {
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

    let icons_dir = converted_dir.join("icons");
    let mut sheets_written = 0usize;

    for (icon_id, icon_frame_names) in &groups {
        let output_stem = format!("{icon_id}{quality_suffix}");
        let latest_plist_path = latest_plists_by_stem.get(&output_stem.to_ascii_lowercase());
        let glow_frames = resolve_glow_frames_for_icon(
            icon_id.as_str(),
            &split,
            glow_sheet_split.as_ref(),
            latest_plist_path.map(PathBuf::as_path),
            splitter_opts,
            latest_sheet_sprite_cache,
        )?;

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

        let mut icon_plist_root = build_icon_plist_from_frames(
            &frame_entries,
            &split.plist_root,
            output_stem.as_str(),
        )?;

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

        save_merged_sheet(
            &icons_dir,
            output_stem.as_str(),
            &icon_plist_root,
            &atlas,
        )?;
        sheets_written = sheets_written.saturating_add(1);
    }

    issues.push(ReportIssue {
        level: ReportLevel::Info,
        message: format!(
            "split legacy GJ_GameSheet02 into {sheets_written} icon sheets under icons/"
        ),
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

fn convert_process_one_sheet_candidate<F>(
    pair: &SheetCandidate,
    all_sheet_pairs: &[SheetCandidate],
    splitter_opts: &SplitterOptions,
    merger_opts: &MergerOptions,
    latest_plists_by_stem: &HashMap<String, PathBuf>,
    latest_sheet_sprite_cache: &Arc<Mutex<HashMap<String, HashMap<String, RgbaImage>>>>,
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

    if is_legacy_icon_glow_sheet(&stem).is_some() {
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

    if let Some(quality_suffix) = is_legacy_combined_icon_sheet(&stem) {
        return convert_legacy_icon_gamesheet(
            pair,
            quality_suffix.as_str(),
            all_sheet_pairs,
            splitter_opts,
            merger_opts,
            latest_plists_by_stem,
            latest_sheet_sprite_cache,
            converted_dir,
            total_units,
            completed,
            plists_done_atomic,
            plists_total,
            on_progress,
        );
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
    let Some(latest_plist_path) = latest_plists_by_stem.get(&pair.stem.to_ascii_lowercase()) else {
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

    let latest_plist_root = Value::from_file(latest_plist_path)
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

    let latest_sheet_dir = latest_plist_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let mut merged_plist_root = split.plist_root.clone();
    let mut merged_sprites = split.sprites.clone();
    let frames_mut = frames_dictionary_mut(&mut merged_plist_root)?;
    let mut merged_additions = 0usize;
    for frame_name in missing_frame_keys {
        let Some(frame_value) = latest_frames.get(&frame_name).cloned() else {
            continue;
        };
        let Some(sprite_path) = resolve_split_sprite_path(&latest_sheet_dir, &frame_name) else {
            match latest_sheet_sprite_from_cache(
                latest_plist_path.as_path(),
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
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let converted_dir = output_dir.join("ConvertedToLatestVersion");
    fs::create_dir_all(&converted_dir)?;

    let latest_split_dir = resolve_latest_placeholder_split_dir().ok_or(AppError::InvalidPath(
        "latest placeholder split directory not found",
    ))?;
    let latest_plists_by_stem = build_latest_plist_index(&latest_split_dir)?;
    let splitter_opts = phase_defaults().splitter;
    let merger_opts = MergerOptions {
        include_outside_plist_files: false,
        dimensions: None,
        sheet_concurrency: 1,
    };

    check_cancel(cancel.as_ref())?;
    let all_sheet_pairs: Vec<SheetCandidate> = discover_sheet_pairs(input_dir)?;
    let sheet_pairs: Vec<SheetCandidate> = all_sheet_pairs
        .iter()
        .filter(|pair| !sheet_is_under_icons(&pair.relative_dir))
        .filter(|pair| !is_legacy_icon_glow_sheet(&pair.stem).is_some())
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
    issues.push(ReportIssue {
        level: ReportLevel::Info,
        message: format!(
            "requested game version `{}`; phase 1 currently always compares against latest placeholders",
            options.game_version
        ),
        file: None,
    });
    issues.push(ReportIssue {
        level: ReportLevel::Info,
        message: format!(
            "latest placeholder source: {}",
            latest_split_dir.to_string_lossy()
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
    let latest_plists_for_convert = latest_plists_by_stem.clone();
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
                &latest_plists_for_convert,
                &latest_sheet_sprite_cache_for_pool,
                converted_dir_for_convert.as_path(),
                total_units,
                &completed_for_pool,
                &plists_for_pool,
                plists_total,
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

    if latest_plists_by_stem.is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "latest placeholder split source has no plist files".to_string(),
            file: Some(latest_split_dir.to_string_lossy().to_string()),
        });
    }
    if sheet_pairs.is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "no plist/png sheet pairs discovered for conversion".to_string(),
            file: None,
        });
    }

    Ok(OperationReport {
        operation: format!("{:?}", plan.kind),
        files_seen: sheet_pairs.len(),
        files_processed: sheets_written,
        output_dir: converted_dir.to_string_lossy().to_string(),
        elapsed_ms: started_at.elapsed().as_millis(),
        issues,
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::path::Path;

    use plist::{Dictionary, Value};

    use super::{
        group_frame_names_by_icon_id, group_icon_output_frames, icon_sheet_id_from_frame_name,
        is_excluded_legacy_icon_id, is_fireboost_frame_name, is_glow_frame_name,
        is_legacy_combined_icon_sheet, is_legacy_icon_glow_sheet, missing_frame_keys,
        sheet_is_under_icons,
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
        assert_eq!(icon_sheet_id_from_frame_name("edit_eAlphaBtn_001.png"), None);
        assert_eq!(icon_sheet_id_from_frame_name("not_an_icon.png"), None);
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
            "fireBoost_001.png".to_string(),
        ];
        let groups = group_icon_output_frames(frames);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups.get("player_02").map(Vec::len), Some(1));
        assert!(!groups.contains_key("boost_01"));
        assert!(!groups.contains_key("portal_01"));
        assert!(!groups.contains_key("checkpoint_01"));
        assert!(is_excluded_legacy_icon_id("boost_01"));
        assert!(is_excluded_legacy_icon_id("portal_07"));
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

        let grouped_count: usize = groups.values().map(|entries| entries.len()).sum();
        assert!(
            grouped_count > 1000,
            "expected most example-pack icon frames to be grouped, got {grouped_count}"
        );
    }
}
