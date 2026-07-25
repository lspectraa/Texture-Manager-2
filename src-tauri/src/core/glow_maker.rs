use std::collections::VecDeque;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use crate::core::contracts::{
    phase_defaults, GlowMakerOptions, MergerOptions, OperationPlan, SplitterOptions,
};
use crate::core::discovery::{discover_sheet_pairs, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::glow::{glow_primary_name_for, render_icon_glow_from_primary};
use crate::core::glow_composite::composite_icon_layers_for_glow;
use crate::core::merger::merge_plist_from_memory;
use crate::core::plist::count_frames_in_plist;
use crate::core::report::{OperationProgress, OperationReport, ReportIssue, ReportLevel};
use crate::core::splitter::split_sheet_candidate_memory;

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

struct GlowSheetWorkOutcome {
    sheets_written: usize,
    issues: Vec<ReportIssue>,
}

fn save_merged_sheet(
    destination_dir: &Path,
    stem: &str,
    plist_root: &plist::Value,
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

fn glow_maker_process_one_sheet_candidate<F>(
    pair: &SheetCandidate,
    splitter_opts: &SplitterOptions,
    merger_opts: &MergerOptions,
    options: &GlowMakerOptions,
    generated_glow_dir: &Path,
    total_units: usize,
    completed: &Arc<AtomicUsize>,
    plists_done_atomic: &Arc<AtomicU32>,
    plists_total: u32,
    on_progress: &Arc<Mutex<F>>,
    cancel: &Arc<AtomicBool>,
) -> Result<GlowSheetWorkOutcome, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    check_cancel(cancel.as_ref())?;
    let mut issues: Vec<ReportIssue> = Vec::new();
    let stem = pair.stem.clone();
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
            message: "No sprites extracted from icons sheet; skipping glow generation.".to_string(),
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
        return Ok(GlowSheetWorkOutcome {
            sheets_written: 0,
            issues,
        });
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
        let glow_source = if options.composite_layers {
            match composite_icon_layers_for_glow(
                &split.sprites,
                &split.plist_root,
                &primary_name,
            ) {
                Ok(Some((composite, _, _))) => composite,
                Ok(None) => primary_sprite.clone(),
                Err(err) => {
                    issues.push(ReportIssue {
                        level: ReportLevel::Warning,
                        message: format!(
                            "composite glow fallback to primary for `{frame_name}`: {err}"
                        ),
                        file: Some(frame_name.clone()),
                    });
                    primary_sprite.clone()
                }
            }
        } else {
            primary_sprite.clone()
        };

        // Discard the original glow sprite entirely; regenerate only from primary/composite.
        split.sprites.remove(&frame_name);
        let generated = render_icon_glow_from_primary(&glow_source, options);
        split.sprites.insert(frame_name.clone(), generated);
    }

    let completed_ref = Arc::clone(completed);
    let on_progress_ref = Arc::clone(on_progress);
    let plists_ref = Arc::clone(plists_done_atomic);
    let (atlas, _w, _h, _count, merge_issues) = merge_plist_from_memory(
        &mut split.plist_root,
        &split.sprites,
        pair.stem.as_str(),
        merger_opts,
        &mut |label| {
            let n = completed_ref.fetch_add(1, Ordering::Relaxed) + 1;
            on_progress_ref.lock().unwrap()(operation_progress(
                label,
                n,
                total_units,
                plists_ref.load(Ordering::Relaxed),
                plists_total,
            ));
        },
    )?;
    issues.extend(merge_issues);

    save_merged_sheet(
        generated_glow_dir,
        pair.stem.as_str(),
        &split.plist_root,
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

    Ok(GlowSheetWorkOutcome {
        sheets_written: 1,
        issues,
    })
}

pub fn execute_glow_maker<F>(
    plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    options: &GlowMakerOptions,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
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

    let glow_sheet_jobs: Vec<(u64, SheetCandidate)> = sheet_pairs
        .iter()
        .map(|pair| (sheet_input_weight_bytes(pair), pair.clone()))
        .collect();
    let sheet_concurrency = phase_defaults().merger.sheet_concurrency;

    let mut issues: Vec<ReportIssue> = Vec::new();
    let mut sheets_written = 0usize;
    let plists_done_atomic = Arc::new(AtomicU32::new(0));

    check_cancel(cancel.as_ref())?;
    let cancel_for_glow = Arc::clone(&cancel);
    let completed_for_glow = Arc::clone(&completed);
    let on_progress_for_glow = Arc::clone(on_progress);
    let generated_glow_dir_for_glow = generated_glow_dir.clone();
    let options_for_glow = options.clone();
    let splitter_opts_for_glow = splitter_opts.clone();
    let merger_opts_for_glow = merger_opts.clone();

    let glow_results: Vec<Result<GlowSheetWorkOutcome, AppError>> = scope_run_weighted_job_queue(
        glow_sheet_jobs,
        sheet_concurrency,
        Arc::clone(&cancel),
        Arc::new(move |pair: SheetCandidate| {
            glow_maker_process_one_sheet_candidate(
                &pair,
                &splitter_opts_for_glow,
                &merger_opts_for_glow,
                &options_for_glow,
                generated_glow_dir_for_glow.as_path(),
                total_units,
                &completed_for_glow,
                &plists_done_atomic,
                plists_total,
                &on_progress_for_glow,
                &cancel_for_glow,
            )
        }),
    )?;

    for entry in glow_results {
        let outcome = entry?;
        sheets_written = sheets_written.saturating_add(outcome.sheets_written);
        issues.extend(outcome.issues);
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
