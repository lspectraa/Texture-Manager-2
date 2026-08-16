//! AI upscaler: split → ncnn-Vulkan upscale → rename/scale → merge → optional convert-after.

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use image::RgbaImage;
use plist::Value;

use crate::core::contracts::{
    phase_defaults, ConvertToNewVersionOptions, MergerOptions, OperationKind, OperationOptions,
    OperationPlan, UpscalerCacheMatchMode, UpscalerModel, UpscalerOptions, UpscalerTargetGraphics,
};
use crate::core::convert_to_new_version::{execute_convert_to_new_version, is_icon_sprite};
use crate::core::discovery::{discover_standalone_pngs, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::game_files::{
    discover_sheet_pairs_with_game_plist_fallback, sheet_uses_external_plist, GameFilesLayout,
};
use crate::core::image_finish::{
    finish_ai_upscaled_sprite_layers, save_icon_debug_layers, FinishPolicy, FinishedIconLayers,
};
use crate::core::image_io::save_rgba_png_fast;
use crate::core::merger::merge_plist_from_memory;
use crate::core::plist::count_frames_in_plist;
use crate::core::porter::{
    flattened_bundle_output_dir, port_source_tier_from_stem, save_merged_sheet,
    scale_plist_geometry, PortSourceGraphicsTier,
};
use crate::core::report::{OperationProgress, OperationReport, ReportIssue, ReportLevel};
use crate::core::safe_fs::ensure_no_parent_dir_components;
use crate::core::splitter::split_sheet_candidate_memory;
use crate::core::sprite_index::{
    apply_extracted_geometry_to_frame, extract_indexed_sprites_batch,
    find_best_loose_match_in_batch, find_byte_identical_sheet, find_hash_in_batch,
    load_index_snapshot, lookup_hash_any_in_index, prepare_batch_from_images, prepare_frame,
    prepare_sheet_batch, probe_and_index_likely_sheets, same_tier_vanilla_batch,
    target_tier_from_graphics, ExtractedIndexedSprite, SheetProbeHint, SpriteExtractRequest,
    SpriteIndexHit,
};
use crate::core::upscaler_sidecar::{
    last_upscaler_device_label, reset_upscaler_run_state, resolve_models_dir,
    resolve_sidecar_binary, upscale_rgba_images_batch, upscale_rgba_images_batch_with_progress,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UpscalePlanAction {
    /// Apply `scale` and rename stem to `output_stem`.
    Upscale {
        scale: u32,
        output_stem: &'static str,
    },
    /// Already at (or above) target — skip.
    SkipAlreadyAtTarget,
    /// Would require downscaling — skip with warning.
    SkipDownscaleNotSupported,
}

/// Icon sprites use Real-ESRGAN AnimeVideo v3, including glow layers and
/// bird/UFO capsules. Everything else keeps the user/default model (Waifu2x).
fn uses_icon_upscale_pipeline(relative_dir: &Path, frame_name: &str) -> bool {
    is_icon_sprite(relative_dir, frame_name)
}

fn ai_model_for_sprite(
    relative_dir: &Path,
    frame_name: &str,
    default_model: UpscalerModel,
) -> UpscalerModel {
    if uses_icon_upscale_pipeline(relative_dir, frame_name) {
        UpscalerModel::RealesrganAnime
    } else {
        default_model
    }
}

fn ensure_upscaler_sidecars_ready(default_model: UpscalerModel) -> Result<(), AppError> {
    let _ = resolve_sidecar_binary(default_model)?;
    let _ = resolve_models_dir(default_model)?;
    // Icons always route to AnimeVideo v3 even when the UI model is Waifu2x.
    if default_model != UpscalerModel::RealesrganAnime {
        let _ = resolve_sidecar_binary(UpscalerModel::RealesrganAnime)?;
        let _ = resolve_models_dir(UpscalerModel::RealesrganAnime)?;
    }
    Ok(())
}

/// Derive integer scale + output stem rename rules from source stem and target graphics.
pub fn plan_upscale_for_stem(
    stem: &str,
    target: UpscalerTargetGraphics,
) -> (PortSourceGraphicsTier, UpscalePlanAction) {
    let tier = port_source_tier_from_stem(stem);
    let action = match (tier, target) {
        (PortSourceGraphicsTier::Low, UpscalerTargetGraphics::Hd) => UpscalePlanAction::Upscale {
            scale: 2,
            output_stem: "add_hd",
        },
        (PortSourceGraphicsTier::Low, UpscalerTargetGraphics::Uhd) => UpscalePlanAction::Upscale {
            scale: 4,
            output_stem: "add_uhd",
        },
        (PortSourceGraphicsTier::Hd, UpscalerTargetGraphics::Hd) => {
            UpscalePlanAction::SkipAlreadyAtTarget
        }
        (PortSourceGraphicsTier::Hd, UpscalerTargetGraphics::Uhd) => UpscalePlanAction::Upscale {
            scale: 2,
            output_stem: "hd_to_uhd",
        },
        (PortSourceGraphicsTier::Uhd, UpscalerTargetGraphics::Uhd) => {
            UpscalePlanAction::SkipAlreadyAtTarget
        }
        (PortSourceGraphicsTier::Uhd, UpscalerTargetGraphics::Hd) => {
            UpscalePlanAction::SkipDownscaleNotSupported
        }
    };
    (tier, action)
}

/// Rename a single identifier (stem, frame key, or plist string) for an upscale pass.
pub fn upscale_rename_identifier(value: &str, kind: &str) -> String {
    match kind {
        "add_hd" => {
            if value.contains("-uhd") || value.contains("-hd") {
                value.to_string()
            } else {
                insert_tier_suffix(value, "-hd")
            }
        }
        "add_uhd" => {
            if value.contains("-uhd") {
                value.to_string()
            } else if value.contains("-hd") {
                value.replace("-hd", "-uhd")
            } else {
                insert_tier_suffix(value, "-uhd")
            }
        }
        "hd_to_uhd" => value.replace("-hd", "-uhd"),
        _ => value.to_string(),
    }
}

fn insert_tier_suffix(value: &str, suffix: &str) -> String {
    // Prefer inserting before a file-like extension if present in keys (rare); else append.
    if let Some((base, ext)) = value.rsplit_once('.') {
        if !base.is_empty() && ext.chars().all(|c| c.is_ascii_alphanumeric()) && ext.len() <= 4 {
            return format!("{base}{suffix}.{ext}");
        }
    }
    format!("{value}{suffix}")
}

fn upscale_rename_plist_and_sprites(
    plist_root: &mut Value,
    sprites: &mut BTreeMap<String, RgbaImage>,
    rename_kind: &str,
) -> Result<(), AppError> {
    let root = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;

    if let Some(Value::Dictionary(frames)) = root.get_mut("frames") {
        let old_keys: Vec<String> = frames.keys().cloned().collect();
        let mut new_frames = plist::Dictionary::new();
        for old_key in old_keys {
            let new_key = upscale_rename_identifier(&old_key, rename_kind);
            if let Some(v) = frames.remove(&old_key) {
                new_frames.insert(new_key, v);
            }
        }
        *frames = new_frames;
    }

    let old_sprite_keys: Vec<String> = sprites.keys().cloned().collect();
    let mut new_sprites: BTreeMap<String, RgbaImage> = BTreeMap::new();
    for old_key in old_sprite_keys {
        let new_key = upscale_rename_identifier(&old_key, rename_kind);
        if let Some(img) = sprites.remove(&old_key) {
            new_sprites.insert(new_key, img);
        }
    }
    *sprites = new_sprites;

    rename_all_string_values(plist_root, rename_kind);
    Ok(())
}

fn rename_all_string_values(value: &mut Value, rename_kind: &str) {
    match value {
        Value::String(s) => *s = upscale_rename_identifier(s, rename_kind),
        Value::Dictionary(d) => {
            for (_, child) in d.iter_mut() {
                rename_all_string_values(child, rename_kind);
            }
        }
        Value::Array(a) => {
            for child in a.iter_mut() {
                rename_all_string_values(child, rename_kind);
            }
        }
        _ => {}
    }
}

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

fn merger_opts_for_upscaler() -> MergerOptions {
    MergerOptions {
        include_outside_plist_files: false,
        dimensions: None,
        sheet_concurrency: 1,
    }
}

fn create_upscaler_temp_dir(layout: &GameFilesLayout) -> Result<PathBuf, AppError> {
    let root = layout.root.join(".tm2-upscaler-temp");
    fs::create_dir_all(&root)?;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = root.join(format!("job-{nanos}"));
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn overlay_directory_files(from: &Path, onto: &Path) -> Result<(), AppError> {
    if !from.is_dir() {
        return Ok(());
    }
    let mut stack = vec![from.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let src = entry.path();
            let rel = src
                .strip_prefix(from)
                .map_err(|_| AppError::InvalidPath("upscaler overlay path escape"))?;
            ensure_no_parent_dir_components(rel)?;
            let dest = onto.join(rel);
            if src.is_dir() {
                fs::create_dir_all(&dest)?;
                stack.push(src);
            } else if src.is_file() {
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(&src, &dest)?;
            }
        }
    }
    Ok(())
}

struct CacheHitReplacement {
    key: String,
    extracted: ExtractedIndexedSprite,
}

#[derive(Clone, Copy)]
enum PendingMatchKind {
    Exact,
    Loose,
    Global,
}

struct PendingCacheHit {
    key: String,
    hit: SpriteIndexHit,
    kind: PendingMatchKind,
}

fn cache_extract_aliases(hit: &SpriteIndexHit, key: &str, rename_kind: &str) -> Vec<String> {
    let renamed = upscale_rename_identifier(&hit.sprite_name, rename_kind);
    vec![
        renamed,
        hit.sprite_name.clone(),
        key.to_string(),
        upscale_rename_identifier(key, rename_kind),
    ]
}

fn finish_batched_extracts(
    layout: &GameFilesLayout,
    target_tier: PortSourceGraphicsTier,
    rename_kind: &str,
    pending: Vec<PendingCacheHit>,
    notes: &mut Vec<ReportIssue>,
) -> (
    Vec<CacheHitReplacement>,
    Vec<String>,
    usize,
    usize,
    usize,
    usize,
) {
    let mut hits = Vec::new();
    let mut misses = Vec::new();
    let mut extract_failures = 0usize;
    let mut name_exact = 0usize;
    let mut name_loose = 0usize;
    let mut global_hash_hits = 0usize;

    if pending.is_empty() {
        return (
            hits,
            misses,
            extract_failures,
            name_exact,
            name_loose,
            global_hash_hits,
        );
    }

    let requests: Vec<SpriteExtractRequest> = pending
        .iter()
        .map(|p| SpriteExtractRequest {
            result_key: p.key.clone(),
            hit: p.hit.clone(),
            aliases: cache_extract_aliases(&p.hit, &p.key, rename_kind),
        })
        .collect();
    let mut extracted = extract_indexed_sprites_batch(layout, target_tier, &requests);

    for p in pending {
        match extracted.remove(&p.key) {
            Some(Ok(img)) => {
                match p.kind {
                    PendingMatchKind::Exact => name_exact = name_exact.saturating_add(1),
                    PendingMatchKind::Loose => name_loose = name_loose.saturating_add(1),
                    PendingMatchKind::Global => {
                        global_hash_hits = global_hash_hits.saturating_add(1)
                    }
                }
                hits.push(CacheHitReplacement {
                    key: p.key,
                    extracted: img,
                });
            }
            Some(Err(err)) => {
                extract_failures = extract_failures.saturating_add(1);
                if extract_failures <= 5 {
                    notes.push(ReportIssue {
                        level: ReportLevel::Warning,
                        message: format!(
                            "Cache hit for `{}` but failed to pull {target_tier:?}: {err}",
                            p.key
                        ),
                        file: Some(p.key.clone()),
                    });
                }
                misses.push(p.key);
            }
            None => {
                extract_failures = extract_failures.saturating_add(1);
                misses.push(p.key);
            }
        }
    }

    (
        hits,
        misses,
        extract_failures,
        name_exact,
        name_loose,
        global_hash_hits,
    )
}

/// Phase 1: resolve cache hits before any AI sidecar work.
/// Preprocess each sheet once (pack + vanilla), match in memory, then batch-extract target tiers.
fn resolve_sprite_cache_hits(
    sprites: &BTreeMap<String, RgbaImage>,
    pair: &SheetCandidate,
    layout: &GameFilesLayout,
    target: UpscalerTargetGraphics,
    cache_match_mode: UpscalerCacheMatchMode,
    rename_kind: &str,
    sheet_label: &str,
    completed: &AtomicUsize,
    total_units: usize,
    plists_done: u32,
    plists_total: u32,
    on_progress: &Arc<Mutex<dyn FnMut(OperationProgress) + Send>>,
    cancel: &AtomicBool,
) -> Result<(Vec<CacheHitReplacement>, Vec<String>, Vec<ReportIssue>), AppError> {
    check_cancel(cancel)?;
    let mut notes = Vec::new();

    if sprites.is_empty() {
        return Ok((Vec::new(), Vec::new(), notes));
    }

    let total = sprites.len();
    on_progress.lock().unwrap()(operation_progress(
        format!("{sheet_label} (cache resolve 0/{total})"),
        completed.load(Ordering::Relaxed),
        total_units,
        plists_done,
        plists_total,
    ));

    // Index likely vanilla Resources sheets once (source + HD/UHD siblings).
    let hint = SheetProbeHint {
        relative_dir: pair.relative_dir.clone(),
        stem: pair.stem.clone(),
    };
    match probe_and_index_likely_sheets(layout, &hint) {
        Ok(n) if n > 0 => {
            notes.push(ReportIssue {
                level: ReportLevel::Info,
                message: format!(
                    "Sprite index: added/updated {n} frame hashes from game files for `{}`.",
                    pair.stem
                ),
                file: Some(format!("{}.plist", pair.stem)),
            });
        }
        Ok(_) => {}
        Err(err) => {
            notes.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!("Sprite index probe failed for `{}`: {err}", pair.stem),
                file: Some(format!("{}.plist", pair.stem)),
            });
        }
    }

    let index_file = load_index_snapshot(layout)?;
    let index_size = index_file.sprites.len();
    if index_size == 0 {
        notes.push(ReportIssue {
            level: ReportLevel::Warning,
            message: format!(
                "Sprite cache index is empty after probing `{}`. Configure Geometry Dash game files, then re-run (or Regenerate sprite index).",
                pair.stem
            ),
            file: Some(format!("{}.plist", pair.stem)),
        });
        return Ok((Vec::new(), sprites.keys().cloned().collect(), notes));
    }

    let pack_tier = port_source_tier_from_stem(&pair.stem);
    let target_tier = target_tier_from_graphics(target);
    // Always run loose similarity after exact hash (UI no longer exposes a mode toggle).
    let allow_loose = true;
    let _cache_match_mode = cache_match_mode;

    // Fast path only when the entire sheet file is byte-identical to vanilla.
    if let Some(sheet_hit) = find_byte_identical_sheet(
        layout,
        &pair.relative_dir,
        &pair.stem,
        &pair.plist_path,
        &pair.png_path,
    )? {
        notes.push(ReportIssue {
            level: ReportLevel::Info,
            message: format!(
                "`{}` matches vanilla sheet file bytes — pulling {target_tier:?} frames by name.",
                pair.stem
            ),
            file: Some(format!("{}.plist", pair.stem)),
        });
        on_progress.lock().unwrap()(operation_progress(
            format!("{sheet_label} (cache resolve {total}/{total})"),
            completed.load(Ordering::Relaxed),
            total_units,
            plists_done,
            plists_total,
        ));
        let pending: Vec<PendingCacheHit> = sprites
            .keys()
            .map(|key| {
                let mut hit = sheet_hit.clone();
                hit.sprite_name = key.clone();
                PendingCacheHit {
                    key: key.clone(),
                    hit,
                    kind: PendingMatchKind::Exact,
                }
            })
            .collect();
        let (hits, misses, extract_failures, _, _, _) =
            finish_batched_extracts(layout, target_tier, rename_kind, pending, &mut notes);
        if extract_failures > 5 {
            notes.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!(
                    "Cache extract failed for {extract_failures} sprites on `{}` (showing first 5).",
                    pair.stem
                ),
                file: Some(format!("{}.plist", pair.stem)),
            });
        }
        return Ok((hits, misses, notes));
    }

    // Preprocess pack + same-tier vanilla once (exact hash + loose dHash features).
    on_progress.lock().unwrap()(operation_progress(
        format!("{sheet_label} (cache preprocess)"),
        completed.load(Ordering::Relaxed),
        total_units,
        plists_done,
        plists_total,
    ));

    let pack_batch = match prepare_sheet_batch(&pair.plist_path, &pair.png_path) {
        Ok(batch) => batch,
        Err(err) => {
            notes.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!(
                    "Sprite cache atlas extract failed for `{}`: {err}. Trying trimmed split sprites only.",
                    pair.stem
                ),
                file: Some(format!("{}.plist", pair.stem)),
            });
            Default::default()
        }
    };
    // Splitter images: second hash candidate + fallback when atlas preprocess failed.
    let working_batch = prepare_batch_from_images(sprites);
    let vanilla_batch = same_tier_vanilla_batch(layout, &hint)?;

    let mut pending = Vec::new();
    let mut misses = Vec::new();
    let mut tier_mismatches = 0usize;
    let mut resolved = 0usize;

    for key in sprites.keys() {
        check_cancel(cancel)?;
        resolved += 1;
        if resolved == 1 || resolved == total || resolved % 64 == 0 {
            on_progress.lock().unwrap()(operation_progress(
                format!("{sheet_label} (cache resolve {resolved}/{total})"),
                completed.load(Ordering::Relaxed),
                total_units,
                plists_done,
                plists_total,
            ));
        }

        let pack_frame = pack_batch.get(key);
        let working_frame = working_batch.get(key);
        let mut candidates = Vec::new();
        if let Some(f) = pack_frame {
            candidates.push(f.hash.clone());
        }
        if let Some(f) = working_frame {
            if !candidates.iter().any(|c| c == &f.hash) {
                candidates.push(f.hash.clone());
            }
        }
        if candidates.is_empty() {
            if let Some(image) = sprites.get(key) {
                candidates.push(prepare_frame(image).hash);
            }
        }

        // 1) Exact trimmed-hash via sprite-index.json (name-agnostic; covers icon reuse).
        //    Always first — even when loose mode is selected.
        if let Some(hit) = lookup_hash_any_in_index(&index_file, &candidates, Some(pack_tier)) {
            pending.push(PendingCacheHit {
                key: key.clone(),
                hit,
                kind: PendingMatchKind::Global,
            });
            continue;
        }

        // 2) Exact hash against the loaded same-tier vanilla sheet (any frame name).
        if let Some((sheet_hit, batch)) = vanilla_batch.as_ref() {
            let mut matched_name = None;
            for hash in &candidates {
                if let Some(name) = find_hash_in_batch(batch, hash) {
                    matched_name = Some(name.to_string());
                    break;
                }
            }
            if let Some(vanilla_name) = matched_name {
                let mut hit = sheet_hit.clone();
                hit.sprite_name = vanilla_name;
                pending.push(PendingCacheHit {
                    key: key.clone(),
                    hit,
                    kind: PendingMatchKind::Exact,
                });
                continue;
            }
        }

        if lookup_hash_any_in_index(&index_file, &candidates, None).is_some() {
            tier_mismatches = tier_mismatches.saturating_add(1);
        }

        // 3) Loose image match only when enabled — name-agnostic, strict thresholds.
        if allow_loose {
            if let Some((sheet_hit, batch)) = vanilla_batch.as_ref() {
                let needle = pack_frame.or(working_frame);
                if let Some(needle) = needle {
                    if let Some(vanilla_name) =
                        find_best_loose_match_in_batch(needle, batch, pack_tier)
                    {
                        let mut hit = sheet_hit.clone();
                        hit.sprite_name = vanilla_name.to_string();
                        pending.push(PendingCacheHit {
                            key: key.clone(),
                            hit,
                            kind: PendingMatchKind::Loose,
                        });
                        continue;
                    }
                }
            }
        }

        misses.push(key.clone());
    }

    on_progress.lock().unwrap()(operation_progress(
        format!("{sheet_label} (cache extract {})", pending.len()),
        completed.load(Ordering::Relaxed),
        total_units,
        plists_done,
        plists_total,
    ));

    let (hits, mut extract_misses, extract_failures, name_exact, name_loose, global_hash_hits) =
        finish_batched_extracts(layout, target_tier, rename_kind, pending, &mut notes);
    misses.append(&mut extract_misses);

    if extract_failures > 5 {
        notes.push(ReportIssue {
            level: ReportLevel::Warning,
            message: format!(
                "Cache extract failed for {extract_failures} sprites on `{}` (showing first 5).",
                pair.stem
            ),
            file: Some(format!("{}.plist", pair.stem)),
        });
    }

    let exact_total = name_exact.saturating_add(global_hash_hits);
    notes.push(ReportIssue {
        level: ReportLevel::Info,
        message: format!(
            "`{}`: {} from cache / {} AI (vanilla {pack_tier:?}: {exact_total} exactHash ({global_hash_hits} index), {name_loose} loose; index={index_size}{})",
            pair.stem,
            hits.len(),
            misses.len(),
            if tier_mismatches > 0 {
                format!(", {tier_mismatches} wrong-tier hash only")
            } else {
                String::new()
            }
        ),
        file: Some(format!("{}.plist", pair.stem)),
    });

    Ok((hits, misses, notes))
}

fn layer_dump_stem(name: &str) -> String {
    Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name)
        .to_string()
}

fn try_save_icon_debug_layers(dir: &Path, stem: &str, layers: &FinishedIconLayers) {
    if !upscaler_debug_layers_enabled() {
        return;
    }
    if let Err(err) = save_icon_debug_layers(dir, stem, layers) {
        eprintln!("upscaler debug layers `{stem}`: {err}");
    }
}

fn upscaler_debug_layers_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        std::env::var("TEXTURE_MANAGER_UPSCALER_DEBUG_LAYERS")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    })
}

fn upscale_sprites_map(
    sprites: &mut BTreeMap<String, RgbaImage>,
    model: UpscalerModel,
    scale: u32,
    work_root: &Path,
    layers_dir: &Path,
    sheet_label: &str,
    layout: &GameFilesLayout,
    pair: &SheetCandidate,
    target: UpscalerTargetGraphics,
    cache_match_mode: UpscalerCacheMatchMode,
    rename_kind: &str,
    completed: &AtomicUsize,
    total_units: usize,
    plists_done: u32,
    plists_total: u32,
    on_progress: &Arc<Mutex<dyn FnMut(OperationProgress) + Send>>,
    cancel: &AtomicBool,
) -> Result<(Vec<CacheHitReplacement>, usize, Vec<ReportIssue>), AppError> {
    check_cancel(cancel)?;
    if sprites.is_empty() {
        return Ok((Vec::new(), 0, Vec::new()));
    }

    // Phase 1 — resolve all cache hits before any AI.
    let (hits, mut miss_keys, mut notes) = resolve_sprite_cache_hits(
        sprites,
        pair,
        layout,
        target,
        cache_match_mode,
        rename_kind,
        sheet_label,
        completed,
        total_units,
        plists_done,
        plists_total,
        on_progress,
        cancel,
    )?;

    // Only AI sprites that are still in the working map and were not cache-replaced.
    miss_keys.retain(|key| sprites.contains_key(key));
    // Any split sprite not covered by a hit or miss must AI.
    {
        let hit_keys: HashSet<String> = hits.iter().map(|h| h.key.clone()).collect();
        let miss_set: HashSet<String> = miss_keys.iter().cloned().collect();
        for key in sprites.keys() {
            if !hit_keys.contains(key) && !miss_set.contains(key) {
                miss_keys.push(key.clone());
            }
        }
    }

    // Apply higher-quality game-file sprites into the pack map (replaces low-res).
    for hit in &hits {
        sprites.insert(hit.key.clone(), hit.extracted.image.clone());
        let n = completed.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            format!("{sheet_label} (cache hit)"),
            n,
            total_units,
            plists_done,
            plists_total,
        ));
    }

    // Phase 2 — AI batch only misses.
    if miss_keys.is_empty() {
        notes.push(ReportIssue {
            level: ReportLevel::Info,
            message: format!("`{sheet_label}`: {} from cache, 0 AI upscaled", hits.len()),
            file: Some(format!("{sheet_label}.plist")),
        });
        return Ok((hits, 0, notes));
    }

    let images: Vec<RgbaImage> = miss_keys
        .iter()
        .filter_map(|key| sprites.get(key).cloned())
        .collect();
    if images.len() != miss_keys.len() {
        return Err(AppError::IoError(
            "sprite map changed while preparing AI miss batch".to_string(),
        ));
    }

    let batch_dir = work_root.join("batch");
    fs::create_dir_all(&batch_dir)?;
    let sheet = sheet_label.to_string();
    let miss_total = miss_keys.len();

    let mut icon_idxs = Vec::new();
    let mut other_idxs = Vec::new();
    for (i, key) in miss_keys.iter().enumerate() {
        if ai_model_for_sprite(&pair.relative_dir, key, model) == UpscalerModel::RealesrganAnime {
            icon_idxs.push(i);
        } else {
            other_idxs.push(i);
        }
    }

    let mut upscaled: Vec<Option<RgbaImage>> = (0..miss_total).map(|_| None).collect();
    let mut ai_done = 0usize;
    let progress_total = miss_total;

    for (group_idxs, group_model) in [
        (&icon_idxs[..], UpscalerModel::RealesrganAnime),
        (&other_idxs[..], model),
    ] {
        if group_idxs.is_empty() {
            continue;
        }
        check_cancel(cancel)?;
        let group_images: Vec<RgbaImage> = group_idxs.iter().map(|&i| images[i].clone()).collect();
        let group_dir = batch_dir.join(match group_model {
            UpscalerModel::RealesrganAnime => "realesrgan",
            UpscalerModel::Waifu2x => "waifu2x",
        });
        fs::create_dir_all(&group_dir)?;
        let group_base = ai_done;
        let outs = upscale_rgba_images_batch_with_progress(
            &group_images,
            group_model,
            scale,
            &group_dir,
            &mut |done, _total| {
                if cancel.load(Ordering::Relaxed) {
                    return;
                }
                on_progress.lock().unwrap()(operation_progress(
                    format!(
                        "{sheet} (AI {}/{progress_total})",
                        group_base.saturating_add(done)
                    ),
                    completed
                        .load(Ordering::Relaxed)
                        .saturating_add(group_base)
                        .saturating_add(done),
                    total_units,
                    plists_done,
                    plists_total,
                ));
            },
        )?;
        if outs.len() != group_idxs.len() {
            return Err(AppError::IoError(format!(
                "upscaler returned {} images for {} miss sprites ({group_model:?})",
                outs.len(),
                group_idxs.len()
            )));
        }
        for (local_i, out) in outs.into_iter().enumerate() {
            upscaled[group_idxs[local_i]] = Some(out);
        }
        ai_done = ai_done.saturating_add(group_idxs.len());
    }

    check_cancel(cancel)?;
    let _ = fs::remove_dir_all(&batch_dir);

    let upscaled: Vec<RgbaImage> = upscaled
        .into_iter()
        .enumerate()
        .map(|(i, img)| {
            img.ok_or_else(|| AppError::IoError(format!("missing AI output for miss index {i}")))
        })
        .collect::<Result<Vec<_>, _>>()?;

    if upscaled.len() != miss_total {
        return Err(AppError::IoError(format!(
            "upscaler returned {} images for {} miss sprites",
            upscaled.len(),
            miss_total
        )));
    }

    for (key, image) in miss_keys.into_iter().zip(upscaled.into_iter()) {
        check_cancel(cancel)?;
        let is_icon = uses_icon_upscale_pipeline(&pair.relative_dir, &key);
        let layers = finish_ai_upscaled_sprite_layers(
            &image,
            FinishPolicy::for_upscaled_sprite(is_icon, &key),
        );
        try_save_icon_debug_layers(layers_dir, &layer_dump_stem(&key), &layers);
        sprites.insert(key, layers.composed);
        let n = completed.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            format!("{sheet_label} (AI)"),
            n,
            total_units,
            plists_done,
            plists_total,
        ));
    }
    notes.push(ReportIssue {
        level: ReportLevel::Info,
        message: format!(
            "`{sheet_label}`: {} from cache, {miss_total} AI upscaled",
            hits.len()
        ),
        file: Some(format!("{sheet_label}.plist")),
    });
    Ok((hits, miss_total, notes))
}

fn process_one_sheet(
    pair: &SheetCandidate,
    upscaled_dir: &Path,
    opts: &UpscalerOptions,
    work_root: &Path,
    game_files: &GameFilesLayout,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    on_progress: &Arc<Mutex<dyn FnMut(OperationProgress) + Send>>,
    cancel: &AtomicBool,
) -> Result<(usize, usize, usize, Vec<ReportIssue>), AppError> {
    let mut issues = Vec::new();
    let (_tier, action) = plan_upscale_for_stem(&pair.stem, opts.target_graphics.clone());
    match action {
        UpscalePlanAction::SkipAlreadyAtTarget => {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!("Sheet `{}` already at target graphics; skipped.", pair.stem),
                file: Some(format!("{}.plist", pair.stem)),
            });
            let _ = plists_done_atomic.fetch_add(1, Ordering::Relaxed);
            return Ok((0, 0, 0, issues));
        }
        UpscalePlanAction::SkipDownscaleNotSupported => {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!(
                    "Sheet `{}` is UHD; downscale to HD is not supported by Upscaler (use Porter).",
                    pair.stem
                ),
                file: Some(format!("{}.plist", pair.stem)),
            });
            let _ = plists_done_atomic.fetch_add(1, Ordering::Relaxed);
            return Ok((0, 0, 0, issues));
        }
        UpscalePlanAction::Upscale {
            scale,
            output_stem: rename_kind,
        } => {
            let splitter_opts = phase_defaults().splitter;
            let mut split = split_sheet_candidate_memory(pair, &splitter_opts, &mut || {})?;
            issues.extend(split.issues.drain(..));

            let sheet_work = work_root.join(&pair.stem);
            fs::create_dir_all(&sheet_work)?;
            let output_stem = upscale_rename_identifier(&pair.stem, rename_kind);
            let layers_dir = upscaled_dir.join("_layers").join(&output_stem);
            let plists_done = plists_done_atomic.load(Ordering::Relaxed);
            let (cache_hits, ai_count, resolve_notes) = upscale_sprites_map(
                &mut split.sprites,
                opts.model.clone(),
                scale,
                &sheet_work,
                &layers_dir,
                &pair.stem,
                game_files,
                pair,
                opts.target_graphics.clone(),
                opts.cache_match_mode,
                rename_kind,
                completed.as_ref(),
                total_units,
                plists_done,
                plists_total,
                on_progress,
                cancel,
            )?;
            let cache_count = cache_hits.len();
            issues.extend(resolve_notes);

            scale_plist_geometry(&mut split.plist_root, scale as f32)?;
            // Restore target-tier geometry for cache hits (do not keep scaled low-tier offsets).
            for hit in &cache_hits {
                let _ = apply_extracted_geometry_to_frame(
                    &mut split.plist_root,
                    &hit.key,
                    &hit.extracted,
                );
            }

            upscale_rename_plist_and_sprites(
                &mut split.plist_root,
                &mut split.sprites,
                rename_kind,
            )?;

            // Re-apply geometry under renamed keys.
            for hit in &cache_hits {
                let new_key = upscale_rename_identifier(&hit.key, rename_kind);
                let _ = apply_extracted_geometry_to_frame(
                    &mut split.plist_root,
                    &new_key,
                    &hit.extracted,
                );
            }

            if output_stem.trim().is_empty() {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: "Upscale rename produced an empty stem; skipping save.".to_string(),
                    file: Some(format!("{}.plist", pair.stem)),
                });
                let _ = plists_done_atomic.fetch_add(1, Ordering::Relaxed);
                return Ok((0, cache_count, ai_count, issues));
            }

            let relative_sheet: PathBuf = if pair.relative_dir.as_os_str().is_empty() {
                PathBuf::from(&pair.stem)
            } else {
                pair.relative_dir.join(&pair.stem)
            };
            let pair_destination = flattened_bundle_output_dir(upscaled_dir, &relative_sheet);
            let merger_opts = merger_opts_for_upscaler();
            let label_stem = output_stem.clone();
            let completed_ref = Arc::clone(completed);
            let on_progress_ref = Arc::clone(on_progress);
            let plists_ref = Arc::clone(plists_done_atomic);
            let (atlas, _pw, _ph, _merged_count, merge_issues) = merge_plist_from_memory(
                &mut split.plist_root,
                &split.sprites,
                label_stem.as_str(),
                &merger_opts,
                &mut |_label| {
                    // Packing does not advance the sprite counter (already counted at upscale/cache).
                    on_progress_ref.lock().unwrap()(operation_progress(
                        format!("{label_stem} (pack)"),
                        completed_ref.load(Ordering::Relaxed),
                        total_units,
                        plists_ref.load(Ordering::Relaxed),
                        plists_total,
                    ));
                },
            )?;
            issues.extend(merge_issues);
            save_merged_sheet(
                &pair_destination,
                output_stem.as_str(),
                &split.plist_root,
                &atlas,
            )?;
            let _ = plists_done_atomic.fetch_add(1, Ordering::Relaxed);
            let _ = fs::remove_dir_all(&sheet_work);
            Ok((1, cache_count, ai_count, issues))
        }
    }
}

fn process_standalone_pngs_batched(
    png_paths: &[PathBuf],
    input_dir: &Path,
    upscaled_dir: &Path,
    opts: &UpscalerOptions,
    work_root: &Path,
    total_units: usize,
    completed: &AtomicUsize,
    plists_done: u32,
    plists_total: u32,
    on_progress: &Arc<Mutex<dyn FnMut(OperationProgress) + Send>>,
    cancel: &AtomicBool,
) -> Result<(usize, usize, Vec<ReportIssue>), AppError> {
    let mut issues = Vec::new();
    let mut written = 0usize;

    struct Job {
        png_path: PathBuf,
        source_stem: String,
        scale: u32,
        rename_kind: &'static str,
        image: RgbaImage,
    }

    let mut jobs: Vec<Job> = Vec::new();
    for png_path in png_paths {
        check_cancel(cancel)?;
        let source_stem = png_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let (_tier, action) = plan_upscale_for_stem(&source_stem, opts.target_graphics);
        match action {
            UpscalePlanAction::SkipAlreadyAtTarget
            | UpscalePlanAction::SkipDownscaleNotSupported => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: format!("Standalone PNG `{source_stem}` skipped for target graphics."),
                    file: Some(png_path.to_string_lossy().to_string()),
                });
            }
            UpscalePlanAction::Upscale {
                scale,
                output_stem: rename_kind,
            } => {
                let image = image::open(png_path)
                    .map_err(|e| AppError::IoError(e.to_string()))?
                    .to_rgba8();
                jobs.push(Job {
                    png_path: png_path.clone(),
                    source_stem,
                    scale,
                    rename_kind,
                    image,
                });
            }
        }
    }

    // Batch by scale, then by model (icons → AnimeVideo v3, others → default).
    for scale in [2u32, 4u32] {
        let batch_idxs: Vec<usize> = jobs
            .iter()
            .enumerate()
            .filter(|(_, j)| j.scale == scale)
            .map(|(i, _)| i)
            .collect();
        if batch_idxs.is_empty() {
            continue;
        }
        let mut icon_idxs = Vec::new();
        let mut other_idxs = Vec::new();
        for &job_idx in &batch_idxs {
            let job = &jobs[job_idx];
            let rel = job
                .png_path
                .strip_prefix(input_dir)
                .unwrap_or_else(|_| Path::new(job.png_path.file_name().unwrap_or_default()));
            let rel_dir = rel.parent().unwrap_or(Path::new(""));
            let file_name = job
                .png_path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            if ai_model_for_sprite(rel_dir, file_name, opts.model) == UpscalerModel::RealesrganAnime
            {
                icon_idxs.push(job_idx);
            } else {
                other_idxs.push(job_idx);
            }
        }

        for (group_idxs, group_model) in [
            (&icon_idxs[..], UpscalerModel::RealesrganAnime),
            (&other_idxs[..], opts.model),
        ] {
            if group_idxs.is_empty() {
                continue;
            }
            check_cancel(cancel)?;
            let images: Vec<RgbaImage> =
                group_idxs.iter().map(|&i| jobs[i].image.clone()).collect();
            on_progress.lock().unwrap()(operation_progress(
                format!(
                    "standalone PNGs (AI {} ×{})",
                    match group_model {
                        UpscalerModel::RealesrganAnime => "AnimeV3",
                        UpscalerModel::Waifu2x => "Waifu2x",
                    },
                    images.len()
                ),
                completed.load(Ordering::Relaxed),
                total_units,
                plists_done,
                plists_total,
            ));
            let batch_dir = work_root.join(format!(
                "standalone-batch-{scale}-{}",
                match group_model {
                    UpscalerModel::RealesrganAnime => "realesrgan",
                    UpscalerModel::Waifu2x => "waifu2x",
                }
            ));
            fs::create_dir_all(&batch_dir)?;
            let upscaled = upscale_rgba_images_batch(&images, group_model, scale, &batch_dir)?;
            for (job_idx, up_img) in group_idxs.iter().copied().zip(upscaled.into_iter()) {
                let job = &jobs[job_idx];
                let rel = job
                    .png_path
                    .strip_prefix(input_dir)
                    .unwrap_or_else(|_| Path::new(job.png_path.file_name().unwrap_or_default()));
                let rel_dir = rel.parent().unwrap_or(Path::new(""));
                let file_name = job
                    .png_path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                let is_icon = uses_icon_upscale_pipeline(rel_dir, file_name);
                let layers = finish_ai_upscaled_sprite_layers(
                    &up_img,
                    FinishPolicy::for_upscaled_sprite(is_icon, file_name),
                );
                let out_stem = upscale_rename_identifier(&job.source_stem, job.rename_kind);
                let dest_dir = if let Some(parent) = rel.parent() {
                    if parent.as_os_str().is_empty() {
                        upscaled_dir.to_path_buf()
                    } else {
                        upscaled_dir.join(parent)
                    }
                } else {
                    upscaled_dir.to_path_buf()
                };
                fs::create_dir_all(&dest_dir)?;
                let dest = dest_dir.join(format!("{out_stem}.png"));
                save_rgba_png_fast(&dest, &layers.composed)?;
                let layers_dir = dest_dir.join("_layers");
                try_save_icon_debug_layers(&layers_dir, &out_stem, &layers);
                written = written.saturating_add(1);
                let n = completed.fetch_add(1, Ordering::Relaxed) + 1;
                on_progress.lock().unwrap()(operation_progress(
                    dest.file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or(out_stem.as_str())
                        .to_string(),
                    n,
                    total_units,
                    plists_done,
                    plists_total,
                ));
            }
            let _ = fs::remove_dir_all(&batch_dir);
        }
    }

    Ok((written, written, issues))
}

pub fn execute_upscaler<F>(
    _plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    opts: &UpscalerOptions,
    game_files: &GameFilesLayout,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    if opts.convert_to_latest && opts.game_version.trim().is_empty() {
        return Err(AppError::InvalidOperation(
            "game version is required when convert to latest is enabled",
        ));
    }

    // Fail fast if sidecars/models are missing before discovering sheets.
    ensure_upscaler_sidecars_ready(opts.model.clone())?;
    reset_upscaler_run_state();

    let upscaled_dir = output_dir.join("Upscaled");
    fs::create_dir_all(&upscaled_dir)?;
    let work_root = create_upscaler_temp_dir(game_files)?;

    let progress: Arc<Mutex<dyn FnMut(OperationProgress) + Send>> = {
        let on_progress = Arc::clone(on_progress);
        Arc::new(Mutex::new(move |p: OperationProgress| {
            if let Ok(mut guard) = on_progress.lock() {
                (*guard)(p);
            }
        }))
    };

    check_cancel(cancel.as_ref())?;
    let sheet_pairs: Vec<SheetCandidate> =
        discover_sheet_pairs_with_game_plist_fallback(input_dir, game_files)?;
    let paired_pngs: HashSet<PathBuf> = sheet_pairs.iter().map(|p| p.png_path.clone()).collect();
    let standalone_pngs = discover_standalone_pngs(input_dir, &paired_pngs)?;

    let mut eligible_sheets = Vec::new();
    let mut issues: Vec<ReportIssue> = Vec::new();
    for pair in &sheet_pairs {
        if sheet_uses_external_plist(input_dir, pair) {
            issues.push(ReportIssue {
                level: ReportLevel::Info,
                message: format!("Using vanilla plist for {}", pair.stem),
                file: Some(pair.png_path.to_string_lossy().to_string()),
            });
        }
        let (_tier, action) = plan_upscale_for_stem(&pair.stem, opts.target_graphics.clone());
        match action {
            UpscalePlanAction::Upscale { .. } => eligible_sheets.push(pair.clone()),
            UpscalePlanAction::SkipAlreadyAtTarget => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: format!("Sheet `{}` already at target; skipped.", pair.stem),
                    file: Some(format!("{}.plist", pair.stem)),
                });
            }
            UpscalePlanAction::SkipDownscaleNotSupported => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: format!(
                        "Sheet `{}` cannot be downscaled by Upscaler; skipped.",
                        pair.stem
                    ),
                    file: Some(format!("{}.plist", pair.stem)),
                });
            }
        }
    }

    let plists_total = eligible_sheets.len() as u32;
    let mut total_units = 0usize;
    for pair in &eligible_sheets {
        // One progress unit per sprite (not ×2). Merge packing updates the label only.
        let n = count_frames_in_plist(&pair.plist_path).unwrap_or(0);
        total_units = total_units.saturating_add(n);
    }
    total_units = total_units.saturating_add(standalone_pngs.len());

    let completed = Arc::new(AtomicUsize::new(0));
    let plists_done_atomic = Arc::new(AtomicU32::new(0));
    progress.lock().unwrap()(operation_progress(
        String::new(),
        0,
        total_units,
        0,
        plists_total,
    ));

    // Always one sheet at a time — concurrent Vulkan jobs freeze the desktop and corrupt output.
    let concurrency = 1usize;
    let mut sheets_written = 0usize;
    let mut standalone_written = 0usize;
    let mut sprites_from_cache = 0usize;
    let mut sprites_ai_upscaled = 0usize;

    // Process sheets with limited concurrency (VRAM-safe).
    let mut index = 0usize;
    while index < eligible_sheets.len() {
        check_cancel(cancel.as_ref())?;
        let end = (index + concurrency).min(eligible_sheets.len());
        let batch = &eligible_sheets[index..end];
        if concurrency == 1 || batch.len() == 1 {
            for pair in batch {
                let (written, cache_n, ai_n, sheet_issues) = process_one_sheet(
                    pair,
                    &upscaled_dir,
                    opts,
                    &work_root,
                    game_files,
                    total_units,
                    &completed,
                    &plists_done_atomic,
                    plists_total,
                    &progress,
                    cancel.as_ref(),
                )?;
                sheets_written = sheets_written.saturating_add(written);
                sprites_from_cache = sprites_from_cache.saturating_add(cache_n);
                sprites_ai_upscaled = sprites_ai_upscaled.saturating_add(ai_n);
                issues.extend(sheet_issues);
            }
        } else {
            let results: Vec<Result<(usize, usize, usize, Vec<ReportIssue>), AppError>> =
                std::thread::scope(|scope| {
                    let mut handles = Vec::new();
                    for pair in batch {
                        let pair = pair.clone();
                        let upscaled_dir = upscaled_dir.clone();
                        let opts = opts.clone();
                        let work_root = work_root.clone();
                        let game_files_owned = game_files.clone();
                        let completed = Arc::clone(&completed);
                        let plists_done_atomic = Arc::clone(&plists_done_atomic);
                        let progress = Arc::clone(&progress);
                        let cancel = Arc::clone(&cancel);
                        handles.push(scope.spawn(move || {
                            process_one_sheet(
                                &pair,
                                &upscaled_dir,
                                &opts,
                                &work_root,
                                &game_files_owned,
                                total_units,
                                &completed,
                                &plists_done_atomic,
                                plists_total,
                                &progress,
                                cancel.as_ref(),
                            )
                        }));
                    }
                    handles
                        .into_iter()
                        .map(|h| match h.join() {
                            Ok(r) => r,
                            Err(_) => Err(AppError::IoError(
                                "upscaler worker thread panicked".to_string(),
                            )),
                        })
                        .collect()
                });
            for result in results {
                let (written, cache_n, ai_n, sheet_issues) = result?;
                sheets_written = sheets_written.saturating_add(written);
                sprites_from_cache = sprites_from_cache.saturating_add(cache_n);
                sprites_ai_upscaled = sprites_ai_upscaled.saturating_add(ai_n);
                issues.extend(sheet_issues);
            }
        }
        index = end;
    }

    let (standalone_written_n, standalone_ai_n, standalone_issues) =
        process_standalone_pngs_batched(
            &standalone_pngs,
            input_dir,
            &upscaled_dir,
            opts,
            &work_root,
            total_units,
            completed.as_ref(),
            plists_done_atomic.load(Ordering::Relaxed),
            plists_total,
            &progress,
            cancel.as_ref(),
        )?;
    standalone_written = standalone_written.saturating_add(standalone_written_n);
    sprites_ai_upscaled = sprites_ai_upscaled.saturating_add(standalone_ai_n);
    issues.extend(standalone_issues);

    if opts.convert_to_latest {
        check_cancel(cancel.as_ref())?;
        progress.lock().unwrap()(operation_progress(
            "Convert to latest…".to_string(),
            completed.load(Ordering::Relaxed),
            total_units.max(1),
            plists_total,
            plists_total,
        ));

        let convert_temp = create_upscaler_temp_dir(game_files)?;
        let convert_options = ConvertToNewVersionOptions {
            game_version: opts.game_version.trim().to_string(),
            sheet_concurrency: opts.sheet_concurrency.clamp(1, 4).max(1),
        };
        let convert_plan = OperationPlan {
            kind: OperationKind::ConvertToNewVersion,
            input_dir: upscaled_dir.to_string_lossy().into_owned(),
            output_dir: convert_temp.to_string_lossy().into_owned(),
            options: OperationOptions::ConvertToNewVersion(convert_options.clone()),
        };
        let convert_report = execute_convert_to_new_version(
            &convert_plan,
            &upscaled_dir,
            &convert_temp,
            Instant::now(),
            &convert_options,
            game_files,
            on_progress,
            Arc::clone(&cancel),
        )?;
        issues.extend(convert_report.issues);

        let converted_dir = convert_temp.join("ConvertedToLatestVersion");
        if converted_dir.is_dir() {
            overlay_directory_files(&converted_dir, &upscaled_dir)?;
        }
        let _ = fs::remove_dir_all(&convert_temp);
    }

    let _ = fs::remove_dir_all(&work_root);

    issues.insert(
        0,
        ReportIssue {
            level: ReportLevel::Info,
            message: format!(
                "Sprites: {sprites_ai_upscaled} AI upscaled, {sprites_from_cache} from cache ({})",
                last_upscaler_device_label()
            ),
            file: None,
        },
    );

    Ok(OperationReport {
        operation: "upscaler".to_string(),
        files_seen: sheet_pairs.len() + standalone_pngs.len(),
        files_processed: sheets_written + standalone_written,
        output_dir: upscaled_dir.to_string_lossy().into_owned(),
        elapsed_ms: started_at.elapsed().as_millis(),
        issues,
        sprites_ai_upscaled,
        sprites_from_cache,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn low_to_uhd_is_4x() {
        let (tier, action) = plan_upscale_for_stem("GJ_GameSheet", UpscalerTargetGraphics::Uhd);
        assert_eq!(tier, PortSourceGraphicsTier::Low);
        assert_eq!(
            action,
            UpscalePlanAction::Upscale {
                scale: 4,
                output_stem: "add_uhd"
            }
        );
        assert_eq!(
            upscale_rename_identifier("GJ_GameSheet", "add_uhd"),
            "GJ_GameSheet-uhd"
        );
    }

    #[test]
    fn hd_to_uhd_is_2x() {
        let (_tier, action) = plan_upscale_for_stem("player_01-hd", UpscalerTargetGraphics::Uhd);
        assert_eq!(
            action,
            UpscalePlanAction::Upscale {
                scale: 2,
                output_stem: "hd_to_uhd"
            }
        );
        assert_eq!(
            upscale_rename_identifier("player_01-hd", "hd_to_uhd"),
            "player_01-uhd"
        );
    }

    #[test]
    fn uhd_to_hd_skipped() {
        let (_tier, action) = plan_upscale_for_stem("sheet-uhd", UpscalerTargetGraphics::Hd);
        assert_eq!(action, UpscalePlanAction::SkipDownscaleNotSupported);
    }

    #[test]
    fn already_uhd_skipped() {
        let (_tier, action) = plan_upscale_for_stem("sheet-uhd", UpscalerTargetGraphics::Uhd);
        assert_eq!(action, UpscalePlanAction::SkipAlreadyAtTarget);
    }

    #[test]
    fn low_to_hd_adds_suffix() {
        assert_eq!(upscale_rename_identifier("icon", "add_hd"), "icon-hd");
    }

    #[test]
    fn icons_route_to_realesrgan_v3_non_icons_keep_default() {
        assert_eq!(
            ai_model_for_sprite(
                Path::new("icons"),
                "bird_18_001.png",
                UpscalerModel::Waifu2x
            ),
            UpscalerModel::RealesrganAnime
        );
        assert_eq!(
            ai_model_for_sprite(Path::new(""), "player_02_001.png", UpscalerModel::Waifu2x),
            UpscalerModel::RealesrganAnime
        );
        assert_eq!(
            ai_model_for_sprite(
                Path::new("icons"),
                "bird_18_glow_001.png",
                UpscalerModel::Waifu2x
            ),
            UpscalerModel::RealesrganAnime
        );
        assert_eq!(
            ai_model_for_sprite(
                Path::new(""),
                "player_02_glow_001.png",
                UpscalerModel::Waifu2x
            ),
            UpscalerModel::RealesrganAnime
        );
        assert_eq!(
            ai_model_for_sprite(
                Path::new(""),
                "robot_01_03_glow_001.png",
                UpscalerModel::Waifu2x
            ),
            UpscalerModel::RealesrganAnime
        );
        assert_eq!(
            ai_model_for_sprite(
                Path::new("icons"),
                "bird_18_3_001.png",
                UpscalerModel::Waifu2x
            ),
            UpscalerModel::RealesrganAnime
        );
        assert_eq!(
            ai_model_for_sprite(Path::new(""), "bird_01_3_001.png", UpscalerModel::Waifu2x),
            UpscalerModel::RealesrganAnime
        );
        assert_eq!(
            ai_model_for_sprite(Path::new(""), "ufo_01_3_001.png", UpscalerModel::Waifu2x),
            UpscalerModel::RealesrganAnime
        );
        assert_eq!(
            ai_model_for_sprite(
                Path::new(""),
                "bird_01_capsule_001.png",
                UpscalerModel::Waifu2x
            ),
            UpscalerModel::RealesrganAnime
        );
        assert_eq!(
            ai_model_for_sprite(
                Path::new(""),
                "edit_eAlphaBtn_001.png",
                UpscalerModel::Waifu2x
            ),
            UpscalerModel::Waifu2x
        );
    }
}
