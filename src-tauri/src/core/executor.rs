use std::collections::{HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use image::imageops::{self, FilterType};
use rayon::prelude::*;

use crate::core::contracts::{
    phase_defaults, GeodeButtonsOptions, MergerOptions, OperationKind, OperationOptions,
    OperationPlan, PorterOptions, SplitterOptions,
};
use crate::core::convert_to_new_version::{
    execute_convert_to_new_version as run_convert_to_new_version, sheet_is_under_icons,
};
use crate::core::discovery::{
    discover_merge_source_dirs, discover_standalone_fnts, discover_standalone_pngs, SheetCandidate,
};
use crate::core::errors::AppError;
use crate::core::game_files::{
    discover_sheet_pairs_with_game_plist_fallback, sheet_uses_external_plist, GameFilesLayout,
};
use crate::core::geode_buttons::run_geode_buttons;
use crate::core::glow_maker::execute_glow_maker as run_glow_maker;
use crate::core::merger::{direct_plist_files, merge_one_plist_file, merge_plist_from_memory};
use crate::core::plist::count_frames_in_plist;
use crate::core::porter::{
    downscale_sprites, flattened_bundle_output_dir, port_bitmap_fnt, port_rename_identifier,
    port_rename_identifier_force_low, port_rename_plist_and_sprites, port_source_tier_from_stem,
    porter_medium_and_low_linear_scales, porter_options_to_merger_options,
    porter_sheet_scale_factor, porter_stem_eligible, save_merged_sheet, scale_plist_geometry,
    standalone_asset_port_scale, PortPlistRenameMode, PortSourceGraphicsTier,
};
use crate::core::randomizer::execute_randomizer;
use crate::core::report::{OperationProgress, OperationReport, ReportIssue, ReportLevel};
use crate::core::splitter::{split_sheet_candidate, split_sheet_candidate_memory};
use crate::core::upscaler::execute_upscaler;

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

fn append_vanilla_plist_fallback_issues(
    input_dir: &Path,
    pairs: &[SheetCandidate],
    issues: &mut Vec<ReportIssue>,
) {
    for pair in pairs {
        if sheet_uses_external_plist(input_dir, pair) {
            issues.push(ReportIssue {
                level: ReportLevel::Info,
                message: format!("Using vanilla plist for {}", pair.stem),
                file: Some(pair.png_path.to_string_lossy().to_string()),
            });
        }
    }
}

/// Heuristic input size for a gamesheet (plist + png on disk). Used to order parallel merge-related work.
fn sheet_input_weight_bytes(pair: &SheetCandidate) -> u64 {
    let plist_bytes = fs::metadata(&pair.plist_path).map(|m| m.len()).unwrap_or(0);
    let png_bytes = fs::metadata(&pair.png_path).map(|m| m.len()).unwrap_or(0);
    plist_bytes.saturating_add(png_bytes)
}

/// Run `jobs` on `concurrency` OS threads: jobs sorted ascending by weight; half the workers drain
/// largest-first (`pop_back`), half smallest-first (`pop_front`), so heavy sheets start early while
/// light work fills the tail (same strategy as merger plist scheduling).
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

pub fn execute_operation_plan<F>(
    plan: &OperationPlan,
    game_files: &GameFilesLayout,
    on_progress: F,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
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
        (OperationKind::Splitter, OperationOptions::Splitter(options)) => execute_splitter(
            plan,
            input_dir,
            output_dir,
            started_at,
            options,
            game_files,
            &on_progress,
            cancel,
        )?,
        (OperationKind::PorterSplitter, OperationOptions::PorterSplitter(opts)) => {
            execute_porter_splitter(
                plan,
                input_dir,
                output_dir,
                started_at,
                opts,
                game_files,
                &on_progress,
                cancel,
            )?
        }
        (OperationKind::Merger, OperationOptions::Merger(options)) => execute_merger(
            plan,
            input_dir,
            output_dir,
            started_at,
            options,
            &on_progress,
            cancel,
        )?,
        (OperationKind::ConvertToNewVersion, OperationOptions::ConvertToNewVersion(options)) => {
            run_convert_to_new_version(
                plan,
                input_dir,
                output_dir,
                started_at,
                options,
                game_files,
                &on_progress,
                cancel,
            )?
        }
        (OperationKind::GlowMaker, OperationOptions::GlowMaker(options)) => run_glow_maker(
            plan,
            input_dir,
            output_dir,
            started_at,
            options,
            game_files,
            &on_progress,
            cancel,
        )?,
        (OperationKind::Randomizer, OperationOptions::Randomizer(options)) => execute_randomizer(
            plan,
            input_dir,
            output_dir,
            started_at,
            options,
            game_files,
            &on_progress,
            cancel,
        )?,
        (OperationKind::GeodeButtons, OperationOptions::GeodeButtons(options)) => {
            execute_geode_buttons(
                plan,
                input_dir,
                output_dir,
                started_at,
                options,
                game_files,
                &on_progress,
                cancel,
            )?
        }
        (OperationKind::Upscaler, OperationOptions::Upscaler(options)) => execute_upscaler(
            plan,
            input_dir,
            output_dir,
            started_at,
            options,
            game_files,
            &on_progress,
            cancel,
        )?,
        _ => {
            return Err(AppError::InvalidOperation(
                "executor currently supports splitter, porter, merger, convert to new version, glow maker, randomizer, geode buttons, and upscaler",
            ));
        }
    };

    Ok(report)
}

fn execute_geode_buttons<F>(
    _plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    options: &GeodeButtonsOptions,
    game_files: &GameFilesLayout,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    check_cancel(cancel.as_ref())?;

    let mut candidates = discover_sheet_pairs_with_game_plist_fallback(input_dir, game_files)?;
    let stem_filter = options.sheet_stem.trim().to_ascii_lowercase();
    if !stem_filter.is_empty() {
        candidates.retain(|c| c.stem.to_ascii_lowercase() == stem_filter);
    }

    if candidates.is_empty() {
        return Ok(OperationReport {
            operation: "geodeButtons".to_string(),
            files_seen: 0,
            files_processed: 0,
            output_dir: output_dir.to_string_lossy().to_string(),
            elapsed_ms: started_at.elapsed().as_millis(),
            issues: vec![ReportIssue {
                level: ReportLevel::Warning,
                message: "No matching sheets found for Geode Buttons.".to_string(),
                file: None,
            }],
            ..Default::default()
        });
    }

    let mut combined_issues: Vec<ReportIssue> = Vec::new();
    append_vanilla_plist_fallback_issues(input_dir, &candidates, &mut combined_issues);
    let mut processed_total = 0usize;
    let mut out_label = output_dir.to_string_lossy().to_string();

    // Sequential: most users run this for a single BlankSheet.
    for candidate in candidates {
        check_cancel(cancel.as_ref())?;
        let mut progress = on_progress.lock().unwrap();
        let report = run_geode_buttons(
            "geodeButtons",
            &candidate,
            output_dir,
            options,
            &mut *progress,
            Arc::clone(&cancel),
        )?;
        processed_total = processed_total.saturating_add(report.files_processed);
        out_label = report.output_dir.clone();
        combined_issues.extend(report.issues);
    }

    Ok(OperationReport {
        operation: "geodeButtons".to_string(),
        files_seen: 1,
        files_processed: processed_total,
        output_dir: out_label,
        elapsed_ms: started_at.elapsed().as_millis(),
        issues: combined_issues,
        ..Default::default()
    })
}

fn execute_splitter<F>(
    plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    options: &SplitterOptions,
    game_files: &GameFilesLayout,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let split_dir = output_dir.join("Split");
    fs::create_dir_all(&split_dir)?;

    check_cancel(cancel.as_ref())?;
    let mut sheet_pairs = discover_sheet_pairs_with_game_plist_fallback(input_dir, game_files)?;
    if options.skip_icons {
        sheet_pairs.retain(|pair| !sheet_is_under_icons(&pair.relative_dir));
    }
    let mut total_sprites = 0usize;
    for pair in &sheet_pairs {
        total_sprites = total_sprites.saturating_add(count_frames_in_plist(&pair.plist_path)?);
    }

    on_progress.lock().unwrap()(operation_progress(String::new(), 0, total_sprites, 0, 0));

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
    append_vanilla_plist_fallback_issues(input_dir, &sheet_pairs, &mut issues);
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
        ..Default::default()
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
    let relative_dir = relative_file
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    let source_stem = png_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
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
    F: FnMut(OperationProgress) + Send + 'static,
{
    let mut issues: Vec<ReportIssue> = Vec::new();
    let stem = pair.stem.clone();
    let (sheet_w, sheet_h) =
        image::image_dimensions(&pair.png_path).map_err(|e| AppError::IoError(e.to_string()))?;

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

        save_merged_sheet(
            &pair_destination,
            output_stem.as_str(),
            &split.plist_root,
            &atlas,
        )?;
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
    F: FnMut(OperationProgress) + Send + 'static,
{
    let mut issues: Vec<ReportIssue> = Vec::new();
    let source_stem = png_path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
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

pub fn execute_porter_splitter<F>(
    plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    porter_opts: &PorterOptions,
    game_files: &GameFilesLayout,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let porter_dir = output_dir.join("Ported");
    fs::create_dir_all(&porter_dir)?;

    let splitter_opts = phase_defaults().splitter;
    let merger_opts = porter_options_to_merger_options(porter_opts);

    check_cancel(cancel.as_ref())?;
    let sheet_pairs: Vec<SheetCandidate> =
        discover_sheet_pairs_with_game_plist_fallback(input_dir, game_files)?
            .into_iter()
            .filter(|p| porter_stem_eligible(&p.stem))
            .collect();
    let paired_pngs: HashSet<PathBuf> = sheet_pairs.iter().map(|p| p.png_path.clone()).collect();
    let standalone_pngs = discover_standalone_pngs(input_dir, &paired_pngs)?;
    let standalone_fnts = discover_standalone_fnts(input_dir)?;
    let plists_total = sheet_pairs.len() as u32;
    let mut total_units = 0usize;
    let mut porter_sheet_jobs: Vec<(u64, SheetCandidate)> = Vec::with_capacity(sheet_pairs.len());
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
        let weight = sheet_input_weight_bytes(pair).saturating_mul(merge_passes as u64);
        porter_sheet_jobs.push((weight, pair.clone()));
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
    append_vanilla_plist_fallback_issues(input_dir, &sheet_pairs, &mut issues);
    let mut sheets_written = 0_usize;
    let mut standalone_written = 0_usize;
    let mut fnts_written = 0_usize;
    let plists_done_atomic = Arc::new(AtomicU32::new(0));

    let pool = build_sheet_pool(porter_opts.sheet_concurrency)?;
    check_cancel(cancel.as_ref())?;
    let cancel_for_sheets = Arc::clone(&cancel);
    let completed_for_sheets = Arc::clone(&completed);
    let on_progress_for_sheets = Arc::clone(on_progress);
    let plists_atomic_for_sheets = Arc::clone(&plists_done_atomic);
    let porter_dir_for_sheets = porter_dir.clone();
    let splitter_opts_for_sheets = splitter_opts.clone();
    let merger_opts_for_sheets = merger_opts.clone();
    let porter_opts_for_sheets = porter_opts.clone();
    let sheet_results: Vec<(String, Result<PorterSheetWorkOutcome, AppError>)> =
        scope_run_weighted_job_queue(
            porter_sheet_jobs,
            porter_opts.sheet_concurrency,
            Arc::clone(&cancel),
            Arc::new(move |pair: SheetCandidate| {
                let sheet_label = format!("{}.plist", pair.stem);
                if let Err(e) = check_cancel(cancel_for_sheets.as_ref()) {
                    return (sheet_label, Err(e));
                }
                let result = porter_process_one_sheet_candidate(
                    &pair,
                    porter_dir_for_sheets.as_path(),
                    &splitter_opts_for_sheets,
                    &merger_opts_for_sheets,
                    &porter_opts_for_sheets,
                    total_units,
                    &completed_for_sheets,
                    &plists_atomic_for_sheets,
                    plists_total,
                    &on_progress_for_sheets,
                );
                (sheet_label, result)
            }),
        )?;

    for (sheet_label, entry) in sheet_results {
        let outcome = match entry {
            Ok(v) => v,
            Err(e) => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: format!("porter sheet failed; continuing with remaining files: {e}"),
                    file: Some(sheet_label),
                });
                continue;
            }
        };
        sheets_written = sheets_written.saturating_add(outcome.sheets_written);
        issues.extend(outcome.issues);
    }

    let gamesheets_done = plists_done_atomic.load(Ordering::Relaxed);
    check_cancel(cancel.as_ref())?;
    let cancel_for_standalone = Arc::clone(&cancel);
    let completed_for_standalone = Arc::clone(&completed);
    let on_progress_for_standalone = Arc::clone(on_progress);
    let standalone_results: Vec<(String, Result<(usize, Vec<ReportIssue>), AppError>)> = pool
        .install(|| {
            standalone_pngs
                .par_iter()
                .map(
                    |png_path| -> (String, Result<(usize, Vec<ReportIssue>), AppError>) {
                        let label = png_path
                            .file_name()
                            .and_then(|v| v.to_str())
                            .map(str::to_string)
                            .unwrap_or_else(|| png_path.to_string_lossy().to_string());
                        if let Err(e) = check_cancel(cancel_for_standalone.as_ref()) {
                            return (label, Err(e));
                        }
                        let result = porter_process_one_standalone_png(
                            png_path.as_path(),
                            input_dir,
                            porter_dir.as_path(),
                            porter_opts,
                            total_units,
                            &completed_for_standalone,
                            gamesheets_done,
                            plists_total,
                            &on_progress_for_standalone,
                        );
                        (label, result)
                    },
                )
                .collect()
        });

    for (label, entry) in standalone_results {
        let (written, mut local_issues) = match entry {
            Ok(v) => v,
            Err(e) => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: format!("porter standalone png failed; continuing: {e}"),
                    file: Some(label),
                });
                continue;
            }
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
    let fnt_results: Vec<(String, Result<(usize, Vec<ReportIssue>), AppError>)> =
        pool.install(|| {
            standalone_fnts
                .par_iter()
                .map(
                    |fnt_path| -> (String, Result<(usize, Vec<ReportIssue>), AppError>) {
                        let mut local_issues: Vec<ReportIssue> = Vec::new();
                        let label = fnt_path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .map(str::to_string)
                            .unwrap_or_else(|| fnt_path.to_string_lossy().to_string());
                        if let Err(e) = check_cancel(cancel_for_fnt.as_ref()) {
                            return (label, Err(e));
                        }
                        match port_bitmap_fnt(
                            fnt_path.as_path(),
                            input_dir_for_fnt.as_path(),
                            porter_dir_for_fnt.as_path(),
                            &porter_opts_for_fnt,
                        ) {
                            Ok(()) => {
                                let n = completed_for_fnt.fetch_add(1, Ordering::Relaxed) + 1;
                                on_progress_for_fnt.lock().unwrap()(operation_progress(
                                    label.clone(),
                                    n,
                                    total_units,
                                    gamesheets_done,
                                    plists_total,
                                ));
                                (label, Ok((1, local_issues)))
                            }
                            Err(e) => {
                                local_issues.push(ReportIssue {
                                    level: ReportLevel::Warning,
                                    message: format!("Failed to port .fnt: {e}"),
                                    file: Some(fnt_path.to_string_lossy().to_string()),
                                });
                                let n = completed_for_fnt.fetch_add(1, Ordering::Relaxed) + 1;
                                on_progress_for_fnt.lock().unwrap()(operation_progress(
                                    label.clone(),
                                    n,
                                    total_units,
                                    gamesheets_done,
                                    plists_total,
                                ));
                                (label, Ok((0, local_issues)))
                            }
                        }
                    },
                )
                .collect()
        });

    for (label, entry) in fnt_results {
        let (written, mut local_issues) = match entry {
            Ok(v) => v,
            Err(e) => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: format!("porter bitmap font failed; continuing: {e}"),
                    file: Some(label),
                });
                continue;
            }
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
        ..Default::default()
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
    F: FnMut(OperationProgress) + Send + 'static,
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
    on_progress.lock().unwrap()(operation_progress(String::new(), 0, total_sprites, 0, 0));

    let mut plist_jobs: Vec<(u64, PathBuf, PathBuf, PathBuf)> = Vec::new();
    for source in &source_dirs {
        let relative_dir = source
            .strip_prefix(input_dir)
            .map_err(|_| AppError::InvalidOperation("failed to compute merger relative dir"))?;
        let destination = flattened_bundle_output_dir(&merged_dir, relative_dir);
        for plist_path in direct_plist_files(source)? {
            let plist_size_bytes = fs::metadata(&plist_path)
                .map(|meta| meta.len())
                .unwrap_or(0);
            plist_jobs.push((
                plist_size_bytes,
                source.clone(),
                destination.clone(),
                plist_path,
            ));
        }
    }
    let completed = Arc::new(AtomicUsize::new(0));
    check_cancel(cancel.as_ref())?;
    let merger_options = options.clone();
    let completed_for_jobs = Arc::clone(&completed);
    let on_progress_for_jobs = Arc::clone(on_progress);
    let merge_results = scope_run_weighted_job_queue(
        plist_jobs
            .into_iter()
            .map(|(w, s, d, p)| (w, (s, d, p)))
            .collect(),
        options.sheet_concurrency,
        Arc::clone(&cancel),
        Arc::new(move |(source_dir, destination_dir, plist_path)| {
            let plist_display = plist_path.to_string_lossy().to_string();
            let mut emit = |gamesheet_name: String| {
                let n = completed_for_jobs.fetch_add(1, Ordering::Relaxed) + 1;
                on_progress_for_jobs.lock().unwrap()(operation_progress(
                    gamesheet_name,
                    n,
                    total_sprites,
                    0,
                    0,
                ));
            };
            match merge_one_plist_file(
                source_dir.as_path(),
                destination_dir.as_path(),
                plist_path.as_path(),
                &merger_options,
                &mut emit,
            ) {
                Ok(pair) => pair,
                Err(e) => (
                    0,
                    vec![ReportIssue {
                        level: ReportLevel::Error,
                        message: e.to_string(),
                        file: Some(plist_display),
                    }],
                ),
            }
        }),
    )?;

    let mut issues: Vec<ReportIssue> = Vec::new();
    let mut processed = 0_usize;
    for (count, mut local_issues) in merge_results {
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
        ..Default::default()
    })
}
