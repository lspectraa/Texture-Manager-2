//! AI upscaler: split → cache/AI upscale → optional latest-frame copy → merge once.
//! Icon glow is generated with Glow Maker from the upscaled primary (not AI-upscaled).

use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use image::RgbaImage;
use plist::Value;

use crate::core::contracts::{
    phase_defaults, GlowMakerOptions, MergerOptions, OperationPlan, UpscalerCacheMatchMode,
    UpscalerModel, UpscalerOptions, UpscalerTargetGraphics,
};
use crate::core::convert_to_new_version::{
    find_legacy_glow_sheet_pair, icon_sheet_id_from_frame_name, insert_missing_latest_frames,
    is_convert_from_2_0, is_excluded_legacy_icon_id, is_gamesheet04_stem, is_glow_frame_name,
    is_icon_sprite, is_legacy_combined_icon_sheet, is_legacy_icon_glow_sheet,
    is_legacy_icon_split_version, pack_uses_legacy_combined_icons, sheet_may_hold_legacy_icons,
    take_gamesheet04_menu_buttons, target_graphics_quality_suffix,
    write_converted_legacy_icons_from_memory, write_modern_gamesheet04,
};
use crate::core::discovery::{discover_standalone_pngs, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::game_files::{
    discover_sheet_pairs_with_game_plist_fallback, locate_current_sheet_pair,
    sheet_uses_external_plist, GameFilesLayout,
};
use crate::core::glow::glow_primary_name_for;
use crate::core::glow::render_icon_glow_from_primary;
use crate::core::glow_composite::{composite_icon_layers_for_glow, icon_stem_from_frame_name};
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
use crate::core::splitter::{split_sheet_candidate_memory, SplitMemoryResult};
use crate::core::sprite_index::{
    apply_extracted_geometry_to_frame, extract_indexed_sprites_batch,
    find_best_loose_match_in_batch, find_byte_identical_sheet, find_hash_in_batch,
    index_sheet_pairs_batch, load_index_snapshot, lookup_hash_any_in_index, prepare_batch_from_images,
    prepare_frame, probe_and_index_likely_sheets, same_tier_vanilla_batch, stem_for_tier,
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

/// Icon sprites use Real-ESRGAN AnimeVideo v3 (not glow — Glow Maker).
/// Everything else keeps the user/default model (Waifu2x).
fn uses_icon_upscale_pipeline(relative_dir: &Path, frame_name: &str) -> bool {
    is_icon_sprite(relative_dir, frame_name) && !is_glow_frame_name(frame_name)
}

fn is_icon_glow_frame(relative_dir: &Path, frame_name: &str) -> bool {
    is_glow_frame_name(frame_name) && is_icon_sprite(relative_dir, frame_name)
}

fn upscaler_icon_glow_options(opts: &UpscalerOptions) -> GlowMakerOptions {
    GlowMakerOptions {
        thickness: opts.glow_thickness.clamp(1, 128),
        tolerance: opts.glow_tolerance,
        dimensions: None,
        rainbow_glow: false,
        composite_layers: true,
    }
}

fn generate_icon_glows_in_sprites(
    relative_dir: &Path,
    plist_root: &Value,
    sprites: &mut BTreeMap<String, RgbaImage>,
    extra_primaries: &BTreeMap<String, RgbaImage>,
    options: &GlowMakerOptions,
) -> usize {
    let glow_keys: Vec<String> = sprites
        .keys()
        .filter(|key| is_icon_glow_frame(relative_dir, key))
        .cloned()
        .collect();
    if glow_keys.is_empty() {
        return 0;
    }
    let mut generated = 0usize;
    for glow_key in glow_keys {
        let Some(primary_name) = glow_primary_name_for(&glow_key) else {
            continue;
        };
        let Some(primary) = sprites
            .get(&primary_name)
            .cloned()
            .or_else(|| extra_primaries.get(&primary_name).cloned())
        else {
            continue;
        };
        let mut layer_map = BTreeMap::new();
        let lookup = |name: &str| {
            sprites
                .get(name)
                .cloned()
                .or_else(|| extra_primaries.get(name).cloned())
        };
        if let Some(img) = lookup(&primary_name) {
            layer_map.insert(primary_name.clone(), img);
        }
        if let Some(stem) = icon_stem_from_frame_name(&primary_name) {
            for suffix in ["_001.png", "_2_001.png", "_extra_001.png"] {
                let key = format!("{stem}{suffix}");
                if let Some(img) = lookup(&key) {
                    layer_map.insert(key, img);
                }
            }
        }
        let glow_source =
            match composite_icon_layers_for_glow(&layer_map, plist_root, &primary_name) {
                Ok(Some((composite, _, _))) => composite,
                _ => primary,
            };
        sprites.insert(
            glow_key,
            render_icon_glow_from_primary(&glow_source, options),
        );
        generated = generated.saturating_add(1);
    }
    generated
}

fn sheet_upscale_order(pair: &SheetCandidate) -> u8 {
    if is_legacy_combined_icon_sheet(&pair.stem).is_some() {
        0
    } else if is_legacy_icon_glow_sheet(&pair.stem).is_some() {
        2
    } else {
        1
    }
}

fn remember_icon_primaries(
    relative_dir: &Path,
    sprites: &BTreeMap<String, RgbaImage>,
    icon_primaries: &Mutex<BTreeMap<String, RgbaImage>>,
) {
    let mut cache = icon_primaries.lock().unwrap();
    for (key, image) in sprites {
        if is_icon_sprite(relative_dir, key) && !is_glow_frame_name(key) {
            cache.insert(key.clone(), image.clone());
        }
    }
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

fn unique_legacy_icon_ids(
    frame_names: impl IntoIterator<Item = impl AsRef<str>>,
) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    for name in frame_names {
        let Some(icon_id) = icon_sheet_id_from_frame_name(name.as_ref()) else {
            continue;
        };
        if is_excluded_legacy_icon_id(&icon_id) {
            continue;
        }
        ids.insert(icon_id);
    }
    ids
}

/// Old 2.1 / 2.2 packs keep cubes in `GJ_GameSheet02`. Index the modern `icons/{id}`
/// sheets so those frames cache-hit instead of stalling the AnimeVideo sidecar.
fn probe_modern_icon_sheets_for_legacy_gamesheet(
    layout: &GameFilesLayout,
    sprites: &BTreeMap<String, RgbaImage>,
    pack_stem: &str,
    sheet_label: &str,
    completed: &AtomicUsize,
    total_units: usize,
    plists_done: u32,
    plists_total: u32,
    on_progress: &Arc<Mutex<dyn FnMut(OperationProgress) + Send>>,
    cancel: &AtomicBool,
    notes: &mut Vec<ReportIssue>,
) -> Result<usize, AppError> {
    let icon_ids = unique_legacy_icon_ids(sprites.keys());
    if icon_ids.is_empty() {
        return Ok(0);
    }
    let total = icon_ids.len();
    on_progress.lock().unwrap()(operation_progress(
        format!("{sheet_label} (cache index {total} icon sheets)"),
        completed.load(Ordering::Relaxed),
        total_units,
        plists_done,
        plists_total,
    ));

    let pack_tier = port_source_tier_from_stem(pack_stem);
    let icons_dir = PathBuf::from("icons");
    let mut sheets: Vec<(PathBuf, String, PathBuf, PathBuf)> = Vec::new();
    let mut seen = HashSet::new();
    for (i, icon_id) in icon_ids.iter().enumerate() {
        check_cancel(cancel)?;
        if i == 0 || i + 1 == total || i % 32 == 0 {
            on_progress.lock().unwrap()(operation_progress(
                format!("{sheet_label} (cache locate icons {}/{total})", i + 1),
                completed.load(Ordering::Relaxed),
                total_units,
                plists_done,
                plists_total,
            ));
        }
        let stems = [
            stem_for_tier(icon_id, pack_tier),
            icon_id.clone(),
            format!("{icon_id}-hd"),
            format!("{icon_id}-uhd"),
        ];
        for stem in stems {
            if !seen.insert(stem.clone()) {
                continue;
            }
            match locate_current_sheet_pair(layout, &icons_dir, &stem) {
                Ok(Some(pair)) => {
                    sheets.push((
                        icons_dir.clone(),
                        pair.stem,
                        pair.plist_path,
                        pair.png_path,
                    ));
                    break;
                }
                Ok(None) => {}
                Err(err) => {
                    if notes.len() < 8 {
                        notes.push(ReportIssue {
                            level: ReportLevel::Warning,
                            message: format!(
                                "Sprite index locate failed for icons `{icon_id}`: {err}"
                            ),
                            file: Some(format!("icons/{icon_id}")),
                        });
                    }
                }
            }
        }
    }

    match index_sheet_pairs_batch(layout, &sheets) {
        Ok(n) => Ok(n),
        Err(err) => {
            notes.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!("Sprite index batch failed for legacy `{sheet_label}`: {err}"),
                file: Some(format!("{sheet_label}.plist")),
            });
            Ok(0)
        }
    }
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

    let hint = SheetProbeHint {
        relative_dir: pair.relative_dir.clone(),
        stem: pair.stem.clone(),
    };
    let skip_identical_sheet = sheet_may_hold_legacy_icons(&pair.stem)
        && !unique_legacy_icon_ids(sprites.keys()).is_empty();

    // 2.0/legacy GS02 icons live on modern `icons/{id}` sheets. Indexing today's
    // object GJ_GameSheet02 (and re-decoding it for same-tier match) is wasted I/O.
    if !skip_identical_sheet {
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
    }

    if sheet_may_hold_legacy_icons(&pair.stem) {
        let icon_indexed = probe_modern_icon_sheets_for_legacy_gamesheet(
            layout,
            sprites,
            &pair.stem,
            sheet_label,
            completed,
            total_units,
            plists_done,
            plists_total,
            on_progress,
            cancel,
            &mut notes,
        )?;
        if icon_indexed > 0 {
            notes.push(ReportIssue {
                level: ReportLevel::Info,
                message: format!(
                    "Sprite index: added/updated {icon_indexed} icon-sheet hashes for legacy `{}` frames.",
                    pair.stem
                ),
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
    // Skip it for old-layout GS02: icon names are not on today's object sheet.
    if !skip_identical_sheet {
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
    }

    // Preprocess pack + same-tier vanilla once (exact hash + loose dHash features).
    on_progress.lock().unwrap()(operation_progress(
        format!("{sheet_label} (cache preprocess)"),
        completed.load(Ordering::Relaxed),
        total_units,
        plists_done,
        plists_total,
    ));

    // Hash the in-memory split sprites — do not re-decode the pack atlas from disk.
    let working_batch = prepare_batch_from_images(sprites);
    let vanilla_batch = if skip_identical_sheet {
        None
    } else {
        same_tier_vanilla_batch(layout, &hint)?
    };

    let mut pending = Vec::new();
    let mut misses = Vec::new();
    let mut tier_mismatches = 0usize;
    let mut resolved = 0usize;

    for key in sprites.keys() {
        check_cancel(cancel)?;
        if is_icon_glow_frame(&pair.relative_dir, key) {
            continue;
        }
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

        let working_frame = working_batch.get(key);
        let mut candidates = Vec::new();
        if let Some(f) = working_frame {
            candidates.push(f.hash.clone());
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

        // Icon frames on legacy GS02/glow belong in modern `icons/{id}` sheets, not
        // today's object GS02. Skip same-sheet vanilla matching so they cache via
        // the icon index (or AI) instead of hanging on a huge loose compare.
        let legacy_icon_frame = sheet_may_hold_legacy_icons(&pair.stem)
            && uses_icon_upscale_pipeline(&pair.relative_dir, key);

        // 2) Exact hash against the loaded same-tier vanilla sheet (any frame name).
        if !legacy_icon_frame {
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
        }

        if lookup_hash_any_in_index(&index_file, &candidates, None).is_some() {
            tier_mismatches = tier_mismatches.saturating_add(1);
        }

        // 3) Loose image match only when enabled — name-agnostic, strict thresholds.
        if allow_loose && !legacy_icon_frame {
            if let Some((sheet_hit, batch)) = vanilla_batch.as_ref() {
                let needle = working_frame;
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
    miss_keys.retain(|key| !is_icon_glow_frame(&pair.relative_dir, key));
    // Any split sprite not covered by a hit or miss must AI — except icon glow (Glow Maker).
    {
        let hit_keys: HashSet<String> = hits.iter().map(|h| h.key.clone()).collect();
        let miss_set: HashSet<String> = miss_keys.iter().cloned().collect();
        for key in sprites.keys() {
            if is_icon_glow_frame(&pair.relative_dir, key) {
                continue;
            }
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

struct UpscaleRun<'a> {
    upscaled_dir: &'a Path,
    opts: &'a UpscalerOptions,
    work_root: &'a Path,
    game_files: &'a GameFilesLayout,
    all_sheet_pairs: &'a [SheetCandidate],
    icon_primaries: &'a Mutex<BTreeMap<String, RgbaImage>>,
    gs04_frames: &'a Mutex<BTreeMap<String, (Value, RgbaImage)>>,
    total_units: usize,
    completed: &'a Arc<AtomicUsize>,
    plists_done_atomic: &'a Arc<AtomicU32>,
    plists_total: u32,
    on_progress: &'a Arc<Mutex<dyn FnMut(OperationProgress) + Send>>,
    cancel: &'a AtomicBool,
}

fn pack_legacy_icon_convert(opts: &UpscalerOptions, pairs: &[SheetCandidate]) -> bool {
    opts.convert_to_latest
        && (is_legacy_icon_split_version(&opts.game_version)
            || pack_uses_legacy_combined_icons(pairs))
}

fn glow_consumed_by_gs02_convert(
    opts: &UpscalerOptions,
    pair: &SheetCandidate,
    all_pairs: &[SheetCandidate],
) -> bool {
    pack_legacy_icon_convert(opts, all_pairs)
        && is_legacy_icon_glow_sheet(&pair.stem).is_some()
        && all_pairs.iter().any(|other| {
            other.relative_dir == pair.relative_dir
                && is_legacy_combined_icon_sheet(&other.stem).is_some()
        })
}

fn emit_generated_icon_glows(
    pair: &SheetCandidate,
    split: &mut SplitMemoryResult,
    extra_primaries: &BTreeMap<String, RgbaImage>,
    run: &UpscaleRun<'_>,
) -> usize {
    let glow_pending = split
        .sprites
        .keys()
        .filter(|key| is_icon_glow_frame(&pair.relative_dir, key))
        .count();
    let options = upscaler_icon_glow_options(run.opts);
    let glow_n = generate_icon_glows_in_sprites(
        &pair.relative_dir,
        &split.plist_root,
        &mut split.sprites,
        extra_primaries,
        &options,
    );
    if glow_pending > 0 {
        let _ = run.completed.fetch_add(glow_pending, Ordering::Relaxed);
    }
    glow_n
}

fn prepare_sheet_sprites(
    pair: &SheetCandidate,
    scale: Option<u32>,
    rename_kind: Option<&str>,
    run: &UpscaleRun<'_>,
    extra_primaries: &BTreeMap<String, RgbaImage>,
) -> Result<(SplitMemoryResult, usize, usize, Vec<ReportIssue>), AppError> {
    let splitter_opts = phase_defaults().splitter;
    let mut split = split_sheet_candidate_memory(pair, &splitter_opts, &mut || {})?;
    let mut issues = split.issues.drain(..).collect::<Vec<_>>();
    let mut cache_count = 0usize;
    let mut ai_count = 0usize;
    let glow_generated;

    if let (Some(scale), Some(rename_kind)) = (scale, rename_kind) {
        let sheet_work = run.work_root.join(&pair.stem);
        fs::create_dir_all(&sheet_work)?;
        let output_stem = upscale_rename_identifier(&pair.stem, rename_kind);
        let layers_dir = run.upscaled_dir.join("_layers").join(&output_stem);
        let plists_done = run.plists_done_atomic.load(Ordering::Relaxed);
        let (cache_hits, ai_n, resolve_notes) = upscale_sprites_map(
            &mut split.sprites,
            run.opts.model.clone(),
            scale,
            &sheet_work,
            &layers_dir,
            &pair.stem,
            run.game_files,
            pair,
            run.opts.target_graphics.clone(),
            run.opts.cache_match_mode,
            rename_kind,
            run.completed.as_ref(),
            run.total_units,
            plists_done,
            run.plists_total,
            run.on_progress,
            run.cancel,
        )?;
        cache_count = cache_hits.len();
        ai_count = ai_n;
        issues.extend(resolve_notes);

        scale_plist_geometry(&mut split.plist_root, scale as f32)?;
        for hit in &cache_hits {
            let _ = apply_extracted_geometry_to_frame(
                &mut split.plist_root,
                &hit.key,
                &hit.extracted,
            );
        }
        let glow_n = emit_generated_icon_glows(pair, &mut split, extra_primaries, run);
        glow_generated = glow_n;
        remember_icon_primaries(
            &pair.relative_dir,
            &split.sprites,
            run.icon_primaries,
        );
        upscale_rename_plist_and_sprites(
            &mut split.plist_root,
            &mut split.sprites,
            rename_kind,
        )?;
        for hit in &cache_hits {
            let new_key = upscale_rename_identifier(&hit.key, rename_kind);
            let _ = apply_extracted_geometry_to_frame(
                &mut split.plist_root,
                &new_key,
                &hit.extracted,
            );
        }
        let _ = fs::remove_dir_all(&sheet_work);
    } else {
        let glow_n = emit_generated_icon_glows(pair, &mut split, extra_primaries, run);
        glow_generated = glow_n;
        remember_icon_primaries(
            &pair.relative_dir,
            &split.sprites,
            run.icon_primaries,
        );
    }

    if glow_generated > 0 {
        issues.push(ReportIssue {
            level: ReportLevel::Info,
            message: format!(
                "`{}`: generated {glow_generated} icon glow sprite(s) with Glow Maker",
                pair.stem
            ),
            file: Some(format!("{}.plist", pair.stem)),
        });
    }
    Ok((split, cache_count, ai_count, issues))
}

fn merge_and_save_sheet(
    split: &mut SplitMemoryResult,
    output_stem: &str,
    relative_sheet: &Path,
    run: &UpscaleRun<'_>,
    issues: &mut Vec<ReportIssue>,
) -> Result<usize, AppError> {
    let pair_destination = flattened_bundle_output_dir(run.upscaled_dir, relative_sheet);
    let merger_opts = merger_opts_for_upscaler();
    let label_stem = output_stem.to_string();
    let completed_ref = Arc::clone(run.completed);
    let on_progress_ref = Arc::clone(run.on_progress);
    let plists_ref = Arc::clone(run.plists_done_atomic);
    let total_units = run.total_units;
    let plists_total = run.plists_total;
    let (atlas, _pw, _ph, _merged_count, merge_issues) = merge_plist_from_memory(
        &mut split.plist_root,
        &split.sprites,
        label_stem.as_str(),
        &merger_opts,
        &mut |_label| {
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
        output_stem,
        &split.plist_root,
        &atlas,
    )?;
    let _ = run.plists_done_atomic.fetch_add(1, Ordering::Relaxed);
    Ok(1)
}

fn process_one_sheet(
    pair: &SheetCandidate,
    run: &UpscaleRun<'_>,
) -> Result<(usize, usize, usize, Vec<ReportIssue>), AppError> {
    let mut issues = Vec::new();
    if glow_consumed_by_gs02_convert(run.opts, pair, run.all_sheet_pairs) {
        let _ = run.plists_done_atomic.fetch_add(1, Ordering::Relaxed);
        return Ok((0, 0, 0, issues));
    }

    let (_tier, action) = plan_upscale_for_stem(&pair.stem, run.opts.target_graphics.clone());
    let (scale, rename_kind, output_stem) = match action {
        UpscalePlanAction::SkipDownscaleNotSupported => {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!(
                    "Sheet `{}` is UHD; downscale to HD is not supported by Upscaler (use Porter).",
                    pair.stem
                ),
                file: Some(format!("{}.plist", pair.stem)),
            });
            let _ = run.plists_done_atomic.fetch_add(1, Ordering::Relaxed);
            return Ok((0, 0, 0, issues));
        }
        UpscalePlanAction::SkipAlreadyAtTarget if !run.opts.convert_to_latest => {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!("Sheet `{}` already at target graphics; skipped.", pair.stem),
                file: Some(format!("{}.plist", pair.stem)),
            });
            let _ = run.plists_done_atomic.fetch_add(1, Ordering::Relaxed);
            return Ok((0, 0, 0, issues));
        }
        UpscalePlanAction::SkipAlreadyAtTarget => (None, None, pair.stem.clone()),
        UpscalePlanAction::Upscale {
            scale,
            output_stem: rename_kind,
        } => {
            let output_stem = upscale_rename_identifier(&pair.stem, rename_kind);
            (Some(scale), Some(rename_kind), output_stem)
        }
    };

    if output_stem.trim().is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "Upscale rename produced an empty stem; skipping save.".to_string(),
            file: Some(format!("{}.plist", pair.stem)),
        });
        let _ = run.plists_done_atomic.fetch_add(1, Ordering::Relaxed);
        return Ok((0, 0, 0, issues));
    }

    let extras = run.icon_primaries.lock().unwrap().clone();
    let (mut split, cache_count, ai_count, prep_issues) =
        prepare_sheet_sprites(pair, scale, rename_kind, run, &extras)?;
    issues.extend(prep_issues);

    let relative_sheet: PathBuf = if pair.relative_dir.as_os_str().is_empty() {
        PathBuf::from(&pair.stem)
    } else {
        pair.relative_dir.join(&pair.stem)
    };

    if pack_legacy_icon_convert(run.opts, run.all_sheet_pairs) {
        if let Some(quality_suffix) = is_legacy_combined_icon_sheet(&output_stem) {
            let source_suffix = is_legacy_combined_icon_sheet(&pair.stem)
                .unwrap_or_else(|| quality_suffix.clone());
            let glow_pair =
                find_legacy_glow_sheet_pair(run.all_sheet_pairs, &pair.relative_dir, &source_suffix)
                    .cloned();
            let glow_prepared = if let Some(glow_src) = glow_pair.as_ref() {
                let extras = run.icon_primaries.lock().unwrap().clone();
                let (glow_split, glow_cache, glow_ai, glow_issues) =
                    prepare_sheet_sprites(glow_src, scale, rename_kind, run, &extras)?;
                issues.extend(glow_issues);
                let mut glow_out = glow_src.clone();
                glow_out.stem = match rename_kind {
                    Some(kind) => upscale_rename_identifier(&glow_src.stem, kind),
                    None => glow_src.stem.clone(),
                };
                Some((glow_out, glow_split, glow_cache, glow_ai))
            } else {
                None
            };
            let (glow_arg, extra_cache, extra_ai) = match glow_prepared {
                Some((candidate, split, cache, ai)) => {
                    (Some((candidate, split.plist_root, split.sprites)), cache, ai)
                }
                None => (None, 0, 0),
            };
            if run.opts.convert_to_latest && !is_gamesheet04_stem(output_stem.as_str()) {
                let taken =
                    take_gamesheet04_menu_buttons(&mut split.plist_root, &mut split.sprites);
                run.gs04_frames.lock().unwrap().extend(taken);
            }
            let (written, write_issues) = write_converted_legacy_icons_from_memory(
                output_stem.as_str(),
                &relative_sheet,
                quality_suffix.as_str(),
                split.plist_root,
                split.sprites,
                glow_arg,
                run.game_files,
                run.upscaled_dir,
                &merger_opts_for_upscaler(),
                run.total_units,
                run.completed,
                run.plists_done_atomic,
                run.plists_total,
                run.on_progress,
                run.cancel,
            )?;
            let _ = run.plists_done_atomic.fetch_add(1, Ordering::Relaxed);
            issues.extend(write_issues);
            return Ok((
                written,
                cache_count.saturating_add(extra_cache),
                ai_count.saturating_add(extra_ai),
                issues,
            ));
        }
    }

    if run.opts.convert_to_latest {
        let splitter_opts = phase_defaults().splitter;
        let (_added, convert_issues) = insert_missing_latest_frames(
            output_stem.as_str(),
            &pair.relative_dir,
            &mut split.plist_root,
            &mut split.sprites,
            run.game_files,
            &splitter_opts,
        )?;
        issues.extend(convert_issues);
        if !is_gamesheet04_stem(output_stem.as_str()) {
            let taken = take_gamesheet04_menu_buttons(&mut split.plist_root, &mut split.sprites);
            run.gs04_frames.lock().unwrap().extend(taken);
        }
    }

    let written = merge_and_save_sheet(
        &mut split,
        output_stem.as_str(),
        &relative_sheet,
        run,
        &mut issues,
    )?;
    Ok((written, cache_count, ai_count, issues))
}

fn process_standalone_pngs_batched(
    png_paths: &[PathBuf],
    input_dir: &Path,
    upscaled_dir: &Path,
    opts: &UpscalerOptions,
    work_root: &Path,
    extra_primaries: &BTreeMap<String, RgbaImage>,
    total_units: usize,
    completed: &AtomicUsize,
    plists_done: u32,
    plists_total: u32,
    on_progress: &Arc<Mutex<dyn FnMut(OperationProgress) + Send>>,
    cancel: &AtomicBool,
) -> Result<(usize, usize, Vec<ReportIssue>), AppError> {
    let mut issues = Vec::new();
    let mut written = 0usize;
    let mut ai_written = 0usize;

    struct Job {
        png_path: PathBuf,
        source_stem: String,
        scale: u32,
        rename_kind: &'static str,
        image: RgbaImage,
    }

    struct GlowStandalone {
        png_path: PathBuf,
        source_stem: String,
        rename_kind: &'static str,
    }

    let mut jobs: Vec<Job> = Vec::new();
    let mut glow_jobs: Vec<GlowStandalone> = Vec::new();
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
                let rel = png_path
                    .strip_prefix(input_dir)
                    .unwrap_or_else(|_| Path::new(png_path.file_name().unwrap_or_default()));
                let rel_dir = rel.parent().unwrap_or(Path::new(""));
                let file_name = png_path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("");
                if is_icon_glow_frame(rel_dir, file_name) {
                    glow_jobs.push(GlowStandalone {
                        png_path: png_path.clone(),
                        source_stem,
                        rename_kind,
                    });
                    continue;
                }
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

    let mut upscaled_by_file_name: BTreeMap<String, RgbaImage> = BTreeMap::new();

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
                upscaled_by_file_name.insert(file_name.to_string(), layers.composed.clone());
                let layers_dir = dest_dir.join("_layers");
                try_save_icon_debug_layers(&layers_dir, &out_stem, &layers);
                written = written.saturating_add(1);
                ai_written = ai_written.saturating_add(1);
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

    let glow_options = upscaler_icon_glow_options(opts);
    for glow_job in glow_jobs {
        check_cancel(cancel)?;
        let rel = glow_job
            .png_path
            .strip_prefix(input_dir)
            .unwrap_or_else(|_| Path::new(glow_job.png_path.file_name().unwrap_or_default()));
        let file_name = glow_job
            .png_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let Some(primary_name) = glow_primary_name_for(file_name) else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!("Standalone glow `{file_name}` has no primary sprite name."),
                file: Some(glow_job.png_path.to_string_lossy().to_string()),
            });
            let _ = completed.fetch_add(1, Ordering::Relaxed);
            continue;
        };
        let renamed_primary = upscale_rename_identifier(&primary_name, glow_job.rename_kind);
        let Some(primary) = upscaled_by_file_name
            .get(&primary_name)
            .cloned()
            .or_else(|| extra_primaries.get(&primary_name).cloned())
            .or_else(|| extra_primaries.get(&renamed_primary).cloned())
        else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!(
                    "Standalone glow `{file_name}` skipped: upscaled primary `{primary_name}` was not found."
                ),
                file: Some(glow_job.png_path.to_string_lossy().to_string()),
            });
            let _ = completed.fetch_add(1, Ordering::Relaxed);
            continue;
        };
        let glow_image = render_icon_glow_from_primary(&primary, &glow_options);
        let out_stem = upscale_rename_identifier(&glow_job.source_stem, glow_job.rename_kind);
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
        save_rgba_png_fast(&dest, &glow_image)?;
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

    Ok((written, ai_written, issues))
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
            UpscalePlanAction::SkipAlreadyAtTarget if opts.convert_to_latest => {
                eligible_sheets.push(pair.clone());
            }
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
    let mut sheets_written = 0usize;
    let mut standalone_written = 0usize;
    let mut sprites_from_cache = 0usize;
    let mut sprites_ai_upscaled = 0usize;
    let icon_primaries = Mutex::new(BTreeMap::<String, RgbaImage>::new());
    let gs04_frames = Mutex::new(BTreeMap::<String, (Value, RgbaImage)>::new());
    eligible_sheets.sort_by_key(sheet_upscale_order);
    let run = UpscaleRun {
        upscaled_dir: &upscaled_dir,
        opts,
        work_root: &work_root,
        game_files,
        all_sheet_pairs: &sheet_pairs,
        icon_primaries: &icon_primaries,
        gs04_frames: &gs04_frames,
        total_units,
        completed: &completed,
        plists_done_atomic: &plists_done_atomic,
        plists_total,
        on_progress: &progress,
        cancel: cancel.as_ref(),
    };

    for pair in &eligible_sheets {
        check_cancel(cancel.as_ref())?;
        let (written, cache_n, ai_n, sheet_issues) = process_one_sheet(pair, &run)?;
        sheets_written = sheets_written.saturating_add(written);
        sprites_from_cache = sprites_from_cache.saturating_add(cache_n);
        sprites_ai_upscaled = sprites_ai_upscaled.saturating_add(ai_n);
        issues.extend(sheet_issues);
    }

    if opts.convert_to_latest {
        let relocated = std::mem::take(&mut *gs04_frames.lock().unwrap());
        let gs04_written = write_modern_gamesheet04(
            target_graphics_quality_suffix(opts.target_graphics),
            &relocated,
            is_convert_from_2_0(&opts.game_version),
            game_files,
            &upscaled_dir,
            total_units,
            &completed,
            &plists_done_atomic,
            plists_total,
            &progress,
            &mut issues,
        )?;
        sheets_written = sheets_written.saturating_add(gs04_written);
    }

    let extras = icon_primaries.lock().unwrap().clone();
    let (standalone_written_n, standalone_ai_n, standalone_issues) =
        process_standalone_pngs_batched(
            &standalone_pngs,
            input_dir,
            &upscaled_dir,
            opts,
            &work_root,
            &extras,
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
    use std::path::{Path, PathBuf};

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
            UpscalerModel::Waifu2x
        );
        assert_eq!(
            ai_model_for_sprite(
                Path::new(""),
                "player_02_glow_001.png",
                UpscalerModel::Waifu2x
            ),
            UpscalerModel::Waifu2x
        );
        assert_eq!(
            ai_model_for_sprite(
                Path::new(""),
                "robot_01_03_glow_001.png",
                UpscalerModel::Waifu2x
            ),
            UpscalerModel::Waifu2x
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
        assert_eq!(
            ai_model_for_sprite(Path::new(""), "square_01_001.png", UpscalerModel::Waifu2x),
            UpscalerModel::Waifu2x
        );
        assert_eq!(
            ai_model_for_sprite(Path::new(""), "ship_03_001.png", UpscalerModel::Waifu2x),
            UpscalerModel::RealesrganAnime
        );
    }

    #[test]
    fn unique_legacy_icon_ids_collects_gs02_icon_families() {
        let ids = unique_legacy_icon_ids([
            "player_02_001.png",
            "player_02_glow_001.png",
            "ship_03_001.png",
            "portal_01_front_001.png",
            "edit_eAlphaBtn_001.png",
            "square_01_001.png",
        ]);
        assert!(ids.contains("player_02"));
        assert!(ids.contains("ship_03"));
        assert!(!ids.contains("portal_01"));
        assert!(!ids.contains("square_01"));
        assert_eq!(ids.len(), 2);
    }

    fn blob_primary() -> RgbaImage {
        let mut img = RgbaImage::from_pixel(8, 8, image::Rgba([0, 0, 0, 0]));
        for y in 2..6 {
            for x in 2..6 {
                img.put_pixel(x, y, image::Rgba([80, 160, 255, 255]));
            }
        }
        img
    }

    #[test]
    fn icon_glow_frames_are_detected_and_not_ai_pipeline() {
        assert!(is_icon_glow_frame(Path::new(""), "player_02_glow_001.png"));
        assert!(is_icon_glow_frame(
            Path::new("icons"),
            "bird_18_glow_001.png"
        ));
        assert!(!is_icon_glow_frame(Path::new(""), "player_02_001.png"));
        assert!(!is_icon_glow_frame(Path::new(""), "square_01_glow_001.png"));
        assert!(!uses_icon_upscale_pipeline(
            Path::new(""),
            "player_02_glow_001.png"
        ));
    }

    fn glow_test_plist() -> Value {
        let mut root = plist::Dictionary::new();
        root.insert(
            "frames".to_string(),
            Value::Dictionary(plist::Dictionary::new()),
        );
        Value::Dictionary(root)
    }

    fn glow_test_options() -> GlowMakerOptions {
        GlowMakerOptions {
            thickness: 4,
            tolerance: 32,
            dimensions: None,
            rainbow_glow: false,
            composite_layers: true,
        }
    }

    #[test]
    fn generate_icon_glows_replaces_glow_from_same_sheet_primary() {
        let mut sprites = BTreeMap::new();
        sprites.insert("player_01_001.png".to_string(), blob_primary());
        sprites.insert(
            "player_01_glow_001.png".to_string(),
            RgbaImage::from_pixel(8, 8, image::Rgba([9, 9, 9, 9])),
        );
        let generated = generate_icon_glows_in_sprites(
            Path::new(""),
            &glow_test_plist(),
            &mut sprites,
            &BTreeMap::new(),
            &glow_test_options(),
        );
        assert_eq!(generated, 1);
        let glow = sprites.get("player_01_glow_001.png").expect("glow");
        assert!(glow.width() > 8 || glow.height() > 8);
        assert!(glow.pixels().any(|p| p.0[3] > 0));
        assert!(glow.pixels().all(|p| p.0[0] == 255 || p.0[3] == 0));
    }

    #[test]
    fn generate_icon_glows_uses_cached_primaries_from_other_sheets() {
        let mut sprites = BTreeMap::new();
        sprites.insert(
            "ship_03_glow_001.png".to_string(),
            RgbaImage::from_pixel(4, 4, image::Rgba([1, 2, 3, 4])),
        );
        let mut extras = BTreeMap::new();
        extras.insert("ship_03_001.png".to_string(), blob_primary());
        let generated = generate_icon_glows_in_sprites(
            Path::new(""),
            &glow_test_plist(),
            &mut sprites,
            &extras,
            &glow_test_options(),
        );
        assert_eq!(generated, 1);
        let glow = sprites.get("ship_03_glow_001.png").expect("glow");
        assert_ne!(glow.get_pixel(0, 0).0, [1, 2, 3, 4]);
    }

    #[test]
    fn sheet_upscale_order_runs_legacy_gs02_before_other_sheets_then_glow() {
        let gs02 = SheetCandidate {
            stem: "GJ_GameSheet02-hd".to_string(),
            relative_dir: PathBuf::new(),
            plist_path: PathBuf::new(),
            png_path: PathBuf::new(),
        };
        let glow = SheetCandidate {
            stem: "GJ_GameSheetGlow-hd".to_string(),
            relative_dir: PathBuf::new(),
            plist_path: PathBuf::new(),
            png_path: PathBuf::new(),
        };
        let other = SheetCandidate {
            stem: "GJ_GameSheet-hd".to_string(),
            relative_dir: PathBuf::new(),
            plist_path: PathBuf::new(),
            png_path: PathBuf::new(),
        };
        assert_eq!(sheet_upscale_order(&gs02), 0);
        assert_eq!(sheet_upscale_order(&other), 1);
        assert_eq!(sheet_upscale_order(&glow), 2);
    }

    #[test]
    fn glow_sheet_is_consumed_when_legacy_gs02_convert_is_on() {
        let opts = UpscalerOptions {
            model: UpscalerModel::Waifu2x,
            target_graphics: UpscalerTargetGraphics::Uhd,
            convert_to_latest: true,
            game_version: "2.11".to_string(),
            sheet_concurrency: 1,
            cache_match_mode: Default::default(),
            glow_thickness: 4,
            glow_tolerance: 32,
        };
        let pairs = vec![
            SheetCandidate {
                stem: "GJ_GameSheet02-hd".to_string(),
                relative_dir: PathBuf::new(),
                plist_path: PathBuf::new(),
                png_path: PathBuf::new(),
            },
            SheetCandidate {
                stem: "GJ_GameSheetGlow-hd".to_string(),
                relative_dir: PathBuf::new(),
                plist_path: PathBuf::new(),
                png_path: PathBuf::new(),
            },
        ];
        assert!(glow_consumed_by_gs02_convert(&opts, &pairs[1], &pairs));
        assert!(!glow_consumed_by_gs02_convert(&opts, &pairs[0], &pairs));
    }
}
