use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use image::imageops::{self, FilterType};
use image::RgbaImage;
use plist::{Dictionary, Value};
use rayon::prelude::*;

use crate::core::contracts::{
    phase_defaults, ConvertToNewVersionOptions, GlowMakerOptions, MergerOptions, OperationKind,
    OperationOptions, OperationPlan, PorterOptions, SplitterOptions,
};
use crate::core::discovery::{
    discover_merge_source_dirs, discover_sheet_pairs, discover_standalone_fnts, discover_standalone_pngs,
    SheetCandidate,
};
use crate::core::errors::AppError;
use crate::core::glow::{glow_primary_name_for, render_icon_glow_from_primary};
use crate::core::merger::{direct_plist_files, merge_plist_from_memory, merge_sheet_directory};
use crate::core::plist::count_frames_in_plist;
use crate::core::porter::{
    downscale_sprites, flattened_bundle_output_dir, porter_medium_and_low_linear_scales,
    porter_options_to_merger_options, port_bitmap_fnt, port_rename_identifier,
    port_rename_identifier_force_low, port_rename_plist_and_sprites, porter_sheet_scale_factor,
    porter_stem_eligible, port_source_tier_from_stem, save_merged_sheet, scale_plist_geometry,
    standalone_asset_port_scale, PortPlistRenameMode, PortSourceGraphicsTier,
};
use crate::core::report::{OperationProgress, OperationReport, ReportIssue, ReportLevel};
use crate::core::splitter::{split_sheet_candidate, split_sheet_candidate_memory};

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

fn build_sheet_pool(concurrency: u32) -> Result<rayon::ThreadPool, AppError> {
    let n = concurrency.max(1).min(64) as usize;
    rayon::ThreadPoolBuilder::new()
        .num_threads(n)
        .build()
        .map_err(|_| AppError::InvalidOperation("failed to build thread pool"))
}

fn check_cancel(cancel: &AtomicBool) -> Result<(), AppError> {
    if cancel.load(Ordering::Relaxed) {
        return Err(AppError::Cancelled);
    }
    Ok(())
}

pub fn execute_operation_plan<F>(
    plan: &OperationPlan,
    on_progress: F,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send,
{
    let on_progress = Arc::new(Mutex::new(on_progress));
    let input_dir = Path::new(&plan.input_dir);
    let output_dir = Path::new(&plan.output_dir);

    check_cancel(cancel.as_ref())?;

    if !input_dir.exists() {
        return Err(AppError::InvalidPath("input directory does not exist"));
    }
    if !input_dir.is_dir() {
        return Err(AppError::InvalidPath("input path is not a directory"));
    }
    if !output_dir.exists() {
        fs::create_dir_all(output_dir)?;
    }

    let started_at = Instant::now();

    let report = match (&plan.kind, &plan.options) {
        (OperationKind::Splitter, OperationOptions::Splitter(options)) => {
            execute_splitter(plan, input_dir, output_dir, started_at, options, &on_progress, cancel)?
        }
        (OperationKind::PorterSplitter, OperationOptions::PorterSplitter(opts)) => {
            execute_porter_splitter(plan, input_dir, output_dir, started_at, opts, &on_progress, cancel)?
        }
        (OperationKind::Merger, OperationOptions::Merger(options)) => {
            execute_merger(plan, input_dir, output_dir, started_at, options, &on_progress, cancel)?
        }
        (OperationKind::ConvertToNewVersion, OperationOptions::ConvertToNewVersion(options)) => {
            execute_convert_to_new_version(
                plan,
                input_dir,
                output_dir,
                started_at,
                options,
                &on_progress,
                cancel,
            )?
        }
        (OperationKind::GlowMaker, OperationOptions::GlowMaker(options)) => {
            execute_glow_maker(plan, input_dir, output_dir, started_at, options, &on_progress, cancel)?
        }
        _ => {
            return Err(AppError::InvalidOperation(
                "executor currently supports splitter, porter, merger, convert to new version, and glow maker",
            ));
        }
    };

    Ok(report)
}

fn execute_splitter<F>(
    plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    options: &SplitterOptions,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send,
{
    let split_dir = output_dir.join("Split");
    fs::create_dir_all(&split_dir)?;

    check_cancel(cancel.as_ref())?;
    let sheet_pairs = discover_sheet_pairs(input_dir)?;
    let mut total_sprites = 0usize;
    for pair in &sheet_pairs {
        total_sprites = total_sprites.saturating_add(count_frames_in_plist(&pair.plist_path)?);
    }

    on_progress.lock().unwrap()(operation_progress(
        String::new(),
        0,
        total_sprites,
        0,
        0,
    ));

    let pool = build_sheet_pool(options.sheet_concurrency)?;
    let completed = Arc::new(AtomicUsize::new(0));

    check_cancel(cancel.as_ref())?;
    let cancel_for_pool = Arc::clone(&cancel);
    let sheet_results: Vec<Result<(usize, Vec<ReportIssue>), AppError>> = pool.install(|| {
        sheet_pairs
            .par_iter()
            .map(|pair| -> Result<(usize, Vec<ReportIssue>), AppError> {
                check_cancel(cancel_for_pool.as_ref())?;
                let pair_output = split_dir.join(&pair.relative_dir).join(&pair.stem);
                fs::create_dir_all(&pair_output)?;
                let stem = pair.stem.clone();
                let completed = Arc::clone(&completed);
                let on_progress = Arc::clone(on_progress);
                let split_result = split_sheet_candidate(pair, &pair_output, options, || {
                    let n = completed.fetch_add(1, Ordering::Relaxed) + 1;
                    on_progress.lock().unwrap()(operation_progress(
                        stem.clone(),
                        n,
                        total_sprites,
                        0,
                        0,
                    ));
                })?;
                Ok((split_result.files_processed, split_result.issues))
            })
            .collect()
    });

    let mut issues: Vec<ReportIssue> = Vec::new();
    let mut processed = 0_usize;
    for entry in sheet_results {
        let (count, mut local_issues) = match entry {
            Ok(v) => v,
            Err(e) => return Err(e),
        };
        processed += count;
        issues.append(&mut local_issues);
    }

    if sheet_pairs.is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "No plist/png sheet pairs discovered from generic matching rules.".to_string(),
            file: None,
        });
    }

    Ok(OperationReport {
        operation: format!("{:?}", plan.kind),
        files_seen: sheet_pairs.len(),
        files_processed: processed,
        output_dir: split_dir.to_string_lossy().to_string(),
        elapsed_ms: started_at.elapsed().as_millis(),
        issues,
    })
}

/// Output basename (no extension) for a plist-less png, using the same stem rename rules as packed sheets.
fn standalone_png_output_stem(source_stem: &str, porter_opts: &PorterOptions) -> Option<String> {
    let out = if porter_opts.low_port {
        port_rename_identifier_force_low(source_stem)
    } else {
        port_rename_identifier(source_stem, port_source_tier_from_stem(source_stem))
    };
    if out.trim().is_empty() {
        None
    } else {
        Some(out)
    }
}

/// Resize + rename standalone `.png` (no plist) like classic Porter, under `Ported/`.
fn save_standalone_png_to_ported(
    png_path: &Path,
    input_dir: &Path,
    porter_dir: &Path,
    destination_stem: &str,
    scale: f32,
) -> Result<(), AppError> {
    let relative_file = png_path
        .strip_prefix(input_dir)
        .map_err(|_| AppError::InvalidOperation("failed to compute relative png path"))?;
    let relative_dir = relative_file.parent().map(Path::to_path_buf).unwrap_or_default();
    let source_stem = png_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let relative_sheet: PathBuf = if relative_dir.as_os_str().is_empty() {
        PathBuf::from(source_stem)
    } else {
        relative_dir.join(source_stem)
    };
    let dest_dir = flattened_bundle_output_dir(porter_dir, &relative_sheet);
    fs::create_dir_all(&dest_dir)?;
    let dest_png = dest_dir.join(format!("{destination_stem}.png"));

    let img = image::open(png_path)
        .map_err(|e| AppError::IoError(e.to_string()))?
        .into_rgba8();
    let (w, h) = img.dimensions();
    let out = if (scale - 1.0).abs() < 1e-6 {
        img
    } else {
        let nw = ((w as f32) * scale).round().max(1.0) as u32;
        let nh = ((h as f32) * scale).round().max(1.0) as u32;
        if nw == w && nh == h {
            img
        } else {
            imageops::resize(&img, nw, nh, FilterType::Triangle)
        }
    };
    crate::core::image_io::save_rgba_png_fast(&dest_png, &out)?;
    Ok(())
}

struct PorterSheetWorkOutcome {
    sheets_written: usize,
    issues: Vec<ReportIssue>,
}

/// One plist/png gamesheet through split → (optional dual) merge → save. Invoked in parallel
/// with other gamesheets; `plists_done_atomic` counts finished gamesheets across the pool.
fn porter_process_one_sheet_candidate<F>(
    pair: &SheetCandidate,
    porter_dir: &Path,
    splitter_opts: &SplitterOptions,
    merger_opts: &MergerOptions,
    porter_opts: &PorterOptions,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    on_progress: &Arc<Mutex<F>>,
) -> Result<PorterSheetWorkOutcome, AppError>
where
    F: FnMut(OperationProgress) + Send,
{
    let mut issues: Vec<ReportIssue> = Vec::new();
    let stem = pair.stem.clone();
    let (sheet_w, sheet_h) = image::image_dimensions(&pair.png_path)
        .map_err(|e| AppError::IoError(e.to_string()))?;

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
    issues.extend(split.issues);
    if split.files_processed == 0 {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "No sprites extracted from sheet; skipping merge.".to_string(),
            file: Some(format!("{stem}.plist")),
        });
        let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            stem.clone(),
            completed.load(Ordering::Relaxed),
            total_units,
            plist_done_now,
            plists_total,
        ));
        return Ok(PorterSheetWorkOutcome {
            sheets_written: 0,
            issues,
        });
    }

    let tier = port_source_tier_from_stem(&pair.stem);
    let relative_sheet: PathBuf = if pair.relative_dir.as_os_str().is_empty() {
        PathBuf::from(&pair.stem)
    } else {
        pair.relative_dir.join(&pair.stem)
    };
    let pair_destination = flattened_bundle_output_dir(porter_dir, &relative_sheet);

    if let Some((scale_medium, scale_low)) =
        porter_medium_and_low_linear_scales(sheet_w, sheet_h, tier, porter_opts)
    {
        let stem_medium = match tier {
            PortSourceGraphicsTier::Uhd => {
                port_rename_identifier(&pair.stem, PortSourceGraphicsTier::Uhd)
            }
            PortSourceGraphicsTier::Hd => pair.stem.clone(),
            PortSourceGraphicsTier::Low => pair.stem.clone(),
        };
        let stem_low = port_rename_identifier_force_low(&pair.stem);
        if stem_medium.trim().is_empty() || stem_low.trim().is_empty() {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "Port rename produced an empty stem; skipping save.".to_string(),
                file: Some(format!("{}.plist", pair.stem)),
            });
            let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress.lock().unwrap()(operation_progress(
                stem.clone(),
                completed.load(Ordering::Relaxed),
                total_units,
                plist_done_now,
                plists_total,
            ));
            return Ok(PorterSheetWorkOutcome {
                sheets_written: 0,
                issues,
            });
        }

        let rename_medium = match tier {
            PortSourceGraphicsTier::Uhd => PortPlistRenameMode::MediumFromUhd,
            PortSourceGraphicsTier::Hd => PortPlistRenameMode::MediumFromHd,
            PortSourceGraphicsTier::Low => PortPlistRenameMode::TierFromStem,
        };

        let mut plist_medium = split.plist_root.clone();
        let mut sprites_medium = split.sprites.clone();
        downscale_sprites(&mut sprites_medium, scale_medium);
        scale_plist_geometry(&mut plist_medium, scale_medium)?;
        port_rename_plist_and_sprites(
            &mut plist_medium,
            &mut sprites_medium,
            &pair.stem,
            rename_medium,
        )?;

        let completed_ref = Arc::clone(completed);
        let on_progress_ref = Arc::clone(on_progress);
        let plists_ref = Arc::clone(plists_done_atomic);
        let label_medium = stem_medium.clone();
        let (atlas_medium, _pw, _ph, _merged_count, merge_issues_medium) = merge_plist_from_memory(
            &mut plist_medium,
            &sprites_medium,
            stem_medium.as_str(),
            merger_opts,
            &mut |_label| {
                let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
                on_progress_ref.lock().unwrap()(operation_progress(
                    format!("{label_medium} (pack)"),
                    n,
                    total_units,
                    plists_ref.load(Ordering::Relaxed),
                    plists_total,
                ));
            },
        )?;
        issues.extend(merge_issues_medium);
        save_merged_sheet(
            &pair_destination,
            stem_medium.as_str(),
            &plist_medium,
            &atlas_medium,
        )?;

        let mut plist_low = split.plist_root.clone();
        let mut sprites_low = split.sprites.clone();
        downscale_sprites(&mut sprites_low, scale_low);
        scale_plist_geometry(&mut plist_low, scale_low)?;
        port_rename_plist_and_sprites(
            &mut plist_low,
            &mut sprites_low,
            &pair.stem,
            PortPlistRenameMode::ForceLow,
        )?;

        let completed_ref = Arc::clone(completed);
        let on_progress_ref = Arc::clone(on_progress);
        let plists_ref = Arc::clone(plists_done_atomic);
        let label_low = stem_low.clone();
        let (atlas_low, _pw2, _ph2, _merged_count2, merge_issues_low) = merge_plist_from_memory(
            &mut plist_low,
            &sprites_low,
            stem_low.as_str(),
            merger_opts,
            &mut |_label| {
                let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
                on_progress_ref.lock().unwrap()(operation_progress(
                    format!("{label_low} (pack)"),
                    n,
                    total_units,
                    plists_ref.load(Ordering::Relaxed),
                    plists_total,
                ));
            },
        )?;
        issues.extend(merge_issues_low);
        save_merged_sheet(&pair_destination, stem_low.as_str(), &plist_low, &atlas_low)?;
        let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            stem.clone(),
            completed.load(Ordering::Relaxed),
            total_units,
            plist_done_now,
            plists_total,
        ));
        Ok(PorterSheetWorkOutcome {
            sheets_written: 2,
            issues,
        })
    } else {
        let scale = porter_sheet_scale_factor(sheet_w, sheet_h, porter_opts);
        downscale_sprites(&mut split.sprites, scale);
        scale_plist_geometry(&mut split.plist_root, scale)?;

        let rename_mode = if porter_opts.low_port {
            PortPlistRenameMode::ForceLow
        } else {
            PortPlistRenameMode::TierFromStem
        };
        port_rename_plist_and_sprites(
            &mut split.plist_root,
            &mut split.sprites,
            &pair.stem,
            rename_mode,
        )?;

        let output_stem = if porter_opts.low_port {
            port_rename_identifier_force_low(&pair.stem)
        } else {
            port_rename_identifier(&pair.stem, port_source_tier_from_stem(&pair.stem))
        };
        if output_stem.trim().is_empty() {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "Port rename produced an empty stem; skipping save.".to_string(),
                file: Some(format!("{}.plist", pair.stem)),
            });
            let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress.lock().unwrap()(operation_progress(
                stem.clone(),
                completed.load(Ordering::Relaxed),
                total_units,
                plist_done_now,
                plists_total,
            ));
            return Ok(PorterSheetWorkOutcome {
                sheets_written: 0,
                issues,
            });
        }

        let completed_ref = Arc::clone(completed);
        let on_progress_ref = Arc::clone(on_progress);
        let plists_ref = Arc::clone(plists_done_atomic);
        let label_stem = output_stem.clone();
        let (atlas, _pw, _ph, _merged_count, merge_issues) = merge_plist_from_memory(
            &mut split.plist_root,
            &split.sprites,
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

        save_merged_sheet(&pair_destination, output_stem.as_str(), &split.plist_root, &atlas)?;
        let plist_done_now = plists_done_atomic.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress.lock().unwrap()(operation_progress(
            stem.clone(),
            completed.load(Ordering::Relaxed),
            total_units,
            plist_done_now,
            plists_total,
        ));
        Ok(PorterSheetWorkOutcome {
            sheets_written: 1,
            issues,
        })
    }
}

fn porter_process_one_standalone_png<F>(
    png_path: &Path,
    input_dir: &Path,
    porter_dir: &Path,
    porter_opts: &PorterOptions,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    gamesheets_done: u32,
    plists_total: u32,
    on_progress: &Arc<Mutex<F>>,
) -> Result<(usize, Vec<ReportIssue>), AppError>
where
    F: FnMut(OperationProgress) + Send,
{
    let mut issues: Vec<ReportIssue> = Vec::new();
    let source_stem = png_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let out_stem = standalone_png_output_stem(source_stem, porter_opts);
    let Some(out_stem) = out_stem else {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "Port rename produced an empty stem; skipping standalone png.".to_string(),
            file: Some(png_path.to_string_lossy().to_string()),
        });
        return Ok((0, issues));
    };
    let (w, h) = image::image_dimensions(png_path).map_err(|e| AppError::IoError(e.to_string()))?;
    let Some(scale) = standalone_asset_port_scale(w, h, source_stem, porter_opts) else {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "Could not compute port scale for standalone png; skipping.".to_string(),
            file: Some(png_path.to_string_lossy().to_string()),
        });
        return Ok((0, issues));
    };
    let label = png_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| png_path.to_string_lossy().to_string());
    save_standalone_png_to_ported(png_path, input_dir, porter_dir, &out_stem, scale)?;
    let n = completed.fetch_add(1, Ordering::Relaxed) + 1;
    on_progress.lock().unwrap()(operation_progress(
        label,
        n,
        total_units,
        gamesheets_done,
        plists_total,
    ));
    Ok((1, issues))
}

fn execute_porter_splitter<F>(
    plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    porter_opts: &PorterOptions,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send,
{
    let porter_dir = output_dir.join("Ported");
    fs::create_dir_all(&porter_dir)?;

    let splitter_opts = phase_defaults().splitter;
    let merger_opts = porter_options_to_merger_options(porter_opts);

    check_cancel(cancel.as_ref())?;
    let sheet_pairs: Vec<SheetCandidate> = discover_sheet_pairs(input_dir)?
        .into_iter()
        .filter(|p| porter_stem_eligible(&p.stem))
        .collect();
    let paired_pngs: HashSet<PathBuf> = sheet_pairs.iter().map(|p| p.png_path.clone()).collect();
    let standalone_pngs = discover_standalone_pngs(input_dir, &paired_pngs)?;
    let standalone_fnts = discover_standalone_fnts(input_dir)?;
    let plists_total = sheet_pairs.len() as u32;
    let mut total_units = 0usize;
    for pair in &sheet_pairs {
        check_cancel(cancel.as_ref())?;
        let n = count_frames_in_plist(&pair.plist_path)?;
        let (sheet_w, sheet_h) = image::image_dimensions(&pair.png_path)
            .map_err(|e| AppError::IoError(e.to_string()))?;
        let tier = port_source_tier_from_stem(&pair.stem);
        let merge_passes =
            if porter_medium_and_low_linear_scales(sheet_w, sheet_h, tier, porter_opts).is_some() {
                2
            } else {
                1
            };
        total_units = total_units.saturating_add(n.saturating_mul(1 + merge_passes));
    }
    total_units = total_units.saturating_add(standalone_pngs.len());
    total_units = total_units.saturating_add(standalone_fnts.len());
    let completed = Arc::new(AtomicUsize::new(0));

    on_progress.lock().unwrap()(operation_progress(
        String::new(),
        0,
        total_units,
        0,
        plists_total,
    ));

    let mut issues: Vec<ReportIssue> = Vec::new();
    let mut sheets_written = 0_usize;
    let mut standalone_written = 0_usize;
    let mut fnts_written = 0_usize;
    let plists_done_atomic = Arc::new(AtomicU32::new(0));

    let pool = build_sheet_pool(porter_opts.sheet_concurrency)?;
    check_cancel(cancel.as_ref())?;
    let cancel_for_pool = Arc::clone(&cancel);
    let completed_for_sheets = Arc::clone(&completed);
    let on_progress_for_sheets = Arc::clone(on_progress);
    let plists_atomic_for_sheets = Arc::clone(&plists_done_atomic);
    let sheet_results: Vec<Result<PorterSheetWorkOutcome, AppError>> = pool.install(|| {
        sheet_pairs
            .par_iter()
            .map(|pair| -> Result<PorterSheetWorkOutcome, AppError> {
                check_cancel(cancel_for_pool.as_ref())?;
                porter_process_one_sheet_candidate(
                    pair,
                    porter_dir.as_path(),
                    &splitter_opts,
                    &merger_opts,
                    porter_opts,
                    total_units,
                    &completed_for_sheets,
                    &plists_atomic_for_sheets,
                    plists_total,
                    &on_progress_for_sheets,
                )
            })
            .collect()
    });

    for entry in sheet_results {
        let outcome = match entry {
            Ok(v) => v,
            Err(e) => return Err(e),
        };
        sheets_written = sheets_written.saturating_add(outcome.sheets_written);
        issues.extend(outcome.issues);
    }

    let gamesheets_done = plists_done_atomic.load(Ordering::Relaxed);
    check_cancel(cancel.as_ref())?;
    let cancel_for_standalone = Arc::clone(&cancel);
    let completed_for_standalone = Arc::clone(&completed);
    let on_progress_for_standalone = Arc::clone(on_progress);
    let standalone_results: Vec<Result<(usize, Vec<ReportIssue>), AppError>> = pool.install(|| {
        standalone_pngs
            .par_iter()
            .map(|png_path| -> Result<(usize, Vec<ReportIssue>), AppError> {
                check_cancel(cancel_for_standalone.as_ref())?;
                porter_process_one_standalone_png(
                    png_path.as_path(),
                    input_dir,
                    porter_dir.as_path(),
                    porter_opts,
                    total_units,
                    &completed_for_standalone,
                    gamesheets_done,
                    plists_total,
                    &on_progress_for_standalone,
                )
            })
            .collect()
    });

    for entry in standalone_results {
        let (written, mut local_issues) = match entry {
            Ok(v) => v,
            Err(e) => return Err(e),
        };
        standalone_written = standalone_written.saturating_add(written);
        issues.append(&mut local_issues);
    }

    check_cancel(cancel.as_ref())?;
    let cancel_for_fnt = Arc::clone(&cancel);
    let completed_for_fnt = Arc::clone(&completed);
    let on_progress_for_fnt = Arc::clone(on_progress);
    let porter_dir_for_fnt = porter_dir.clone();
    let input_dir_for_fnt = input_dir.to_path_buf();
    let porter_opts_for_fnt = porter_opts.clone();
    let fnt_results: Vec<Result<(usize, Vec<ReportIssue>), AppError>> = pool.install(|| {
        standalone_fnts
            .par_iter()
            .map(|fnt_path| -> Result<(usize, Vec<ReportIssue>), AppError> {
                check_cancel(cancel_for_fnt.as_ref())?;
                let mut local_issues: Vec<ReportIssue> = Vec::new();
                let label = fnt_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(str::to_string)
                    .unwrap_or_else(|| fnt_path.to_string_lossy().to_string());
                match port_bitmap_fnt(
                    fnt_path.as_path(),
                    input_dir_for_fnt.as_path(),
                    porter_dir_for_fnt.as_path(),
                    &porter_opts_for_fnt,
                ) {
                    Ok(()) => {
                        let n = completed_for_fnt.fetch_add(1, Ordering::Relaxed) + 1;
                        on_progress_for_fnt.lock().unwrap()(operation_progress(
                            label,
                            n,
                            total_units,
                            gamesheets_done,
                            plists_total,
                        ));
                        Ok((1, local_issues))
                    }
                    Err(e) => {
                        local_issues.push(ReportIssue {
                            level: ReportLevel::Warning,
                            message: format!("Failed to port .fnt: {e}"),
                            file: Some(fnt_path.to_string_lossy().to_string()),
                        });
                        let n = completed_for_fnt.fetch_add(1, Ordering::Relaxed) + 1;
                        on_progress_for_fnt.lock().unwrap()(operation_progress(
                            label,
                            n,
                            total_units,
                            gamesheets_done,
                            plists_total,
                        ));
                        Ok((0, local_issues))
                    }
                }
            })
            .collect()
    });

    for entry in fnt_results {
        let (written, mut local_issues) = match entry {
            Ok(v) => v,
            Err(e) => return Err(e),
        };
        fnts_written = fnts_written.saturating_add(written);
        issues.append(&mut local_issues);
    }

    if sheet_pairs.is_empty() && standalone_pngs.is_empty() && standalone_fnts.is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "No eligible plist/png pairs, standalone .png, or .fnt files (-hd / -uhd) for porter."
                .to_string(),
            file: None,
        });
    }

    Ok(OperationReport {
        operation: format!("{:?}", plan.kind),
        files_seen: sheet_pairs.len() + standalone_pngs.len() + standalone_fnts.len(),
        files_processed: sheets_written + standalone_written + fnts_written,
        output_dir: porter_dir.to_string_lossy().to_string(),
        elapsed_ms: started_at.elapsed().as_millis(),
        issues,
    })
}

fn resolve_latest_placeholder_split_dir() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(env_override) = std::env::var("TM_LATEST_SPLIT_DIR") {
        if !env_override.trim().is_empty() {
            candidates.push(PathBuf::from(env_override));
        }
    }
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // Prefer sibling `Default` next to the app repo (e.g. `Texture Manager 2/Default`).
    candidates.push(manifest_dir.join("..").join("..").join("Default"));
    candidates.push(manifest_dir.join("..").join("..").join("Default").join("Split"));
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
        .ok_or_else(|| AppError::ParseError("plist missing top-level `frames` dictionary".to_string()))
}

fn frames_dictionary_mut<'a>(plist_root: &'a mut Value) -> Result<&'a mut Dictionary, AppError> {
    plist_root
        .as_dictionary_mut()
        .and_then(|root| root.get_mut("frames"))
        .and_then(Value::as_dictionary_mut)
        .ok_or_else(|| AppError::ParseError("plist missing top-level `frames` dictionary".to_string()))
}

fn frame_name_set(plist_root: &Value) -> Result<HashSet<String>, AppError> {
    let frames = frames_dictionary(plist_root)?;
    Ok(frames.keys().cloned().collect())
}

fn missing_frame_keys(latest_frames: &Dictionary, input_frame_names: &HashSet<String>) -> Vec<String> {
    let mut missing: Vec<String> = latest_frames
        .keys()
        .filter(|name| !input_frame_names.contains(*name))
        .cloned()
        .collect();
    missing.sort();
    missing
}

fn path_from_slashes(value: &str) -> PathBuf {
    value
        .split('/')
        .fold(PathBuf::new(), |mut acc, part| {
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
    let parent = latest_plist_path
        .parent()
        .ok_or(AppError::InvalidPath("latest plist has no parent directory"))?;
    let direct = latest_plist_path.with_extension("png");
    if direct.exists() {
        return Ok(direct);
    }

    let root = Value::from_file(latest_plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse latest plist: {err}")))?;
    let root_dict = root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("latest plist root must be a dictionary".to_string()))?;
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
        .ok_or(AppError::InvalidPath("latest placeholder plist has invalid file stem"))?
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

    let parts: Vec<&str> = normalized.split('/').filter(|part| !part.is_empty()).collect();
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

fn sheet_is_under_icons(relative_dir: &Path) -> bool {
    relative_dir.components().any(|component| match component {
        Component::Normal(name) => name.to_string_lossy().eq_ignore_ascii_case("icons"),
        _ => false,
    })
}

struct ConvertSheetWorkOutcome {
    sheets_written: usize,
    issues: Vec<ReportIssue>,
}

fn convert_process_one_sheet_candidate<F>(
    pair: &SheetCandidate,
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
    F: FnMut(OperationProgress) + Send,
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
                        message: "missing sprite payload in latest placeholder split data".to_string(),
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
            message: "sheet has missing frame keys but no mergeable payloads; keeping original sheet content".to_string(),
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

fn execute_convert_to_new_version<F>(
    plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    options: &ConvertToNewVersionOptions,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send,
{
    let converted_dir = output_dir.join("ConvertedToLatestVersion");
    fs::create_dir_all(&converted_dir)?;

    let latest_split_dir = resolve_latest_placeholder_split_dir()
        .ok_or(AppError::InvalidPath("latest placeholder split directory not found"))?;
    let latest_plists_by_stem = build_latest_plist_index(&latest_split_dir)?;
    let splitter_opts = phase_defaults().splitter;
    let merger_opts = MergerOptions {
        include_outside_plist_files: false,
        dimensions: None,
        sheet_concurrency: 1,
    };

    check_cancel(cancel.as_ref())?;
    let sheet_pairs: Vec<SheetCandidate> = discover_sheet_pairs(input_dir)?
        .into_iter()
        .filter(|pair| !sheet_is_under_icons(&pair.relative_dir))
        .collect();
    let plists_total = sheet_pairs.len() as u32;
    let mut input_total_sprites = 0usize;
    for pair in &sheet_pairs {
        input_total_sprites = input_total_sprites.saturating_add(count_frames_in_plist(&pair.plist_path)?);
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

    let pool = build_sheet_pool(options.sheet_concurrency)?;
    let latest_sheet_sprite_cache: Arc<Mutex<HashMap<String, HashMap<String, RgbaImage>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    check_cancel(cancel.as_ref())?;
    let cancel_for_pool = Arc::clone(&cancel);
    let completed_for_pool = Arc::clone(&completed);
    let plists_for_pool = Arc::clone(&plists_done_atomic);
    let progress_for_pool = Arc::clone(on_progress);
    let latest_sheet_sprite_cache_for_pool = Arc::clone(&latest_sheet_sprite_cache);
    let results: Vec<Result<ConvertSheetWorkOutcome, AppError>> = pool.install(|| {
        sheet_pairs
            .par_iter()
            .map(|pair| -> Result<ConvertSheetWorkOutcome, AppError> {
                check_cancel(cancel_for_pool.as_ref())?;
                convert_process_one_sheet_candidate(
                    pair,
                    &splitter_opts,
                    &merger_opts,
                    &latest_plists_by_stem,
                    &latest_sheet_sprite_cache_for_pool,
                    converted_dir.as_path(),
                    total_units,
                    &completed_for_pool,
                    &plists_for_pool,
                    plists_total,
                    &progress_for_pool,
                )
            })
            .collect()
    });

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

fn execute_glow_maker<F>(
    plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    options: &GlowMakerOptions,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send,
{
    let input_is_icons = input_dir
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.eq_ignore_ascii_case("icons"))
        .unwrap_or(false);
    let icons_dir = if input_is_icons {
        input_dir.to_path_buf()
    } else {
        input_dir.join("icons")
    };
    if !icons_dir.exists() || !icons_dir.is_dir() {
        return Err(AppError::InvalidPath(
            "glow maker expects the input to be `icons` or contain an `icons` folder",
        ));
    }
    let output_is_icons = output_dir
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.eq_ignore_ascii_case("icons"))
        .unwrap_or(false);
    let generated_glow_dir = if output_is_icons {
        output_dir.join("GeneratedGlow")
    } else {
        output_dir.join("icons").join("GeneratedGlow")
    };
    fs::create_dir_all(&generated_glow_dir)?;

    check_cancel(cancel.as_ref())?;
    let sheet_pairs = discover_sheet_pairs(&icons_dir)?;
    let plists_total = sheet_pairs.len() as u32;
    let mut total_units = 0usize;
    for pair in &sheet_pairs {
        check_cancel(cancel.as_ref())?;
        let n = count_frames_in_plist(&pair.plist_path)?;
        total_units = total_units.saturating_add(n.saturating_mul(2));
    }
    let completed = Arc::new(AtomicUsize::new(0));

    on_progress.lock().unwrap()(operation_progress(
        String::new(),
        0,
        total_units,
        0,
        plists_total,
    ));

    let splitter_opts = phase_defaults().splitter;
    let merger_opts = MergerOptions {
        include_outside_plist_files: false,
        dimensions: options.dimensions.clone(),
        sheet_concurrency: 1,
    };

    let mut issues: Vec<ReportIssue> = Vec::new();
    let mut sheets_written = 0usize;
    let mut plists_done = 0u32;

    for pair in &sheet_pairs {
        check_cancel(cancel.as_ref())?;
        let stem = pair.stem.clone();
        let completed_ref = Arc::clone(&completed);
        let on_progress_ref = Arc::clone(on_progress);
        let mut split = split_sheet_candidate_memory(pair, &splitter_opts, || {
            let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress_ref.lock().unwrap()(operation_progress(
                stem.clone(),
                n,
                total_units,
                plists_done,
                plists_total,
            ));
        })?;
        issues.extend(split.issues);

        if split.files_processed == 0 {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "No sprites extracted from icons sheet; skipping glow generation.".to_string(),
                file: Some(format!("{}.plist", pair.stem)),
            });
            plists_done = plists_done.saturating_add(1);
            on_progress.lock().unwrap()(operation_progress(
                stem,
                completed.load(Ordering::Relaxed),
                total_units,
                plists_done,
                plists_total,
            ));
            continue;
        }

        let frame_names: Vec<String> = split.sprites.keys().cloned().collect();
        for frame_name in frame_names {
            check_cancel(cancel.as_ref())?;
            if !frame_name.contains("_glow_") {
                continue;
            }
            let Some(primary_name) = glow_primary_name_for(&frame_name) else {
                continue;
            };
            let Some(primary_sprite) = split.sprites.get(&primary_name).cloned() else {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: "glow sprite has no matching primary sprite in sheet".to_string(),
                    file: Some(frame_name.clone()),
                });
                continue;
            };
            let generated = render_icon_glow_from_primary(&primary_sprite, options);
            split.sprites.insert(frame_name.clone(), generated);
        }

        let completed_ref = Arc::clone(&completed);
        let on_progress_ref = Arc::clone(on_progress);
        let (atlas, _w, _h, _count, merge_issues) = merge_plist_from_memory(
            &mut split.plist_root,
            &split.sprites,
            pair.stem.as_str(),
            &merger_opts,
            &mut |label| {
                let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
                on_progress_ref.lock().unwrap()(operation_progress(
                    label,
                    n,
                    total_units,
                    plists_done,
                    plists_total,
                ));
            },
        )?;
        issues.extend(merge_issues);

        save_merged_sheet(&generated_glow_dir, pair.stem.as_str(), &split.plist_root, &atlas)?;
        sheets_written = sheets_written.saturating_add(1);
        plists_done = plists_done.saturating_add(1);
        on_progress.lock().unwrap()(operation_progress(
            pair.stem.clone(),
            completed.load(Ordering::Relaxed),
            total_units,
            plists_done,
            plists_total,
        ));
    }

    if sheet_pairs.is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "No plist/png icon sheet pairs discovered under `icons`.".to_string(),
            file: None,
        });
    }

    Ok(OperationReport {
        operation: format!("{:?}", plan.kind),
        files_seen: sheet_pairs.len(),
        files_processed: sheets_written,
        output_dir: generated_glow_dir.to_string_lossy().to_string(),
        elapsed_ms: started_at.elapsed().as_millis(),
        issues,
    })
}

fn execute_merger<F>(
    plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    options: &MergerOptions,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send,
{
    let merged_dir = output_dir.join("Merged");
    fs::create_dir_all(&merged_dir)?;

    check_cancel(cancel.as_ref())?;
    let source_dirs = discover_merge_source_dirs(input_dir)?;
    let mut total_sprites = 0usize;
    for source in &source_dirs {
        check_cancel(cancel.as_ref())?;
        let plists = direct_plist_files(source)?;
        for plist in &plists {
            total_sprites = total_sprites.saturating_add(count_frames_in_plist(plist)?);
        }
    }
    on_progress.lock().unwrap()(operation_progress(
        String::new(),
        0,
        total_sprites,
        0,
        0,
    ));

    let pool = build_sheet_pool(options.sheet_concurrency)?;
    let completed = Arc::new(AtomicUsize::new(0));

    check_cancel(cancel.as_ref())?;
    let cancel_for_pool = Arc::clone(&cancel);
    let merge_results: Vec<Result<(usize, Vec<ReportIssue>), AppError>> = pool.install(|| {
        source_dirs
            .par_iter()
            .map(|source| -> Result<(usize, Vec<ReportIssue>), AppError> {
                check_cancel(cancel_for_pool.as_ref())?;
                let relative_dir = source.strip_prefix(input_dir).map_err(|_| {
                    AppError::InvalidOperation("failed to compute merger relative dir")
                })?;
                let destination = flattened_bundle_output_dir(&merged_dir, relative_dir);
                let completed = Arc::clone(&completed);
                let on_progress = Arc::clone(on_progress);
                let merge_result = merge_sheet_directory(
                    source.as_path(),
                    &destination,
                    options,
                    move |gamesheet_name| {
                        let n = completed.fetch_add(1, Ordering::Relaxed) + 1;
                        on_progress.lock().unwrap()(operation_progress(
                            gamesheet_name,
                            n,
                            total_sprites,
                            0,
                            0,
                        ));
                    },
                )?;
                Ok((merge_result.files_processed, merge_result.issues))
            })
            .collect()
    });

    let mut issues: Vec<ReportIssue> = Vec::new();
    let mut processed = 0_usize;
    for entry in merge_results {
        let (count, mut local_issues) = match entry {
            Ok(v) => v,
            Err(e) => return Err(e),
        };
        processed += count;
        issues.append(&mut local_issues);
    }

    if source_dirs.is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "No merger source directories with plist files were discovered.".to_string(),
            file: None,
        });
    }

    Ok(OperationReport {
        operation: format!("{:?}", plan.kind),
        files_seen: processed,
        files_processed: processed,
        output_dir: merged_dir.to_string_lossy().to_string(),
        elapsed_ms: started_at.elapsed().as_millis(),
        issues,
    })
}

#[cfg(test)]
mod convert_to_new_version_tests {
    use std::collections::HashSet;
    use std::path::Path;

    use plist::{Dictionary, Value};

    use super::{missing_frame_keys, sheet_is_under_icons};

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
}
