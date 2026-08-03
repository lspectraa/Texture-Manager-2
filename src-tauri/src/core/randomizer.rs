use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use plist::{Dictionary, Value};
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::{RngExt, SeedableRng};
use regex::Regex;

use crate::core::contracts::{OperationPlan, RandomizerOptions};
use crate::core::discovery::SheetCandidate;
use crate::core::errors::AppError;
use crate::core::game_files::{
    discover_sheet_pairs_with_game_plist_fallback, sheet_uses_external_plist, GameFilesLayout,
};
use crate::core::report::{OperationProgress, OperationReport, ReportIssue, ReportLevel};

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

fn frames_dictionary_mut<'a>(plist_root: &'a mut Value) -> Result<&'a mut Dictionary, AppError> {
    plist_root
        .as_dictionary_mut()
        .and_then(|root| root.get_mut("frames"))
        .and_then(Value::as_dictionary_mut)
        .ok_or_else(|| {
            AppError::ParseError("plist missing top-level `frames` dictionary".to_string())
        })
}

fn hash_seed_text(seed: &str) -> u64 {
    let mut hash: u64 = 14695981039346656037;
    for byte in seed.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    hash
}

fn resolve_randomizer_seed(seed: Option<String>) -> (u64, String) {
    if let Some(raw) = seed {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            if let Ok(integer) = i64::from_str(trimmed) {
                return (integer as u64, trimmed.to_string());
            }
            if let Ok(float_value) = f64::from_str(trimmed) {
                return (float_value.to_bits(), trimmed.to_string());
            }
            return (hash_seed_text(trimmed), trimmed.to_string());
        }
    }

    let generated = rand::rng().random::<u64>();
    (generated, generated.to_string())
}

fn shuffle_with_seed<T>(items: &mut [T], seed: u64) {
    let mut rng = StdRng::seed_from_u64(seed);
    items.shuffle(&mut rng);
}

fn extract_texture_rect_size(texture_rect: &str) -> Option<(u32, u32)> {
    let re = Regex::new(r"\{\{-?\d+,-?\d+\},\{(\d+),(\d+)\}\}").ok()?;
    let captures = re.captures(texture_rect)?;
    let width = captures.get(1)?.as_str().parse::<u32>().ok()?;
    let height = captures.get(2)?.as_str().parse::<u32>().ok()?;
    Some((width, height))
}

fn rounded_size_bucket(texture_rect: &str, size_diff: u32) -> Option<String> {
    let (width, height) = extract_texture_rect_size(texture_rect)?;
    let d = size_diff.max(1);
    let rounded_width = ((width + (d / 2)) / d) * d;
    let rounded_height = ((height + (d / 2)) / d) * d;
    Some(format!("{rounded_width},{rounded_height}"))
}

fn dictionary_rename_keys(frames: &mut Dictionary, mapping: &HashMap<String, String>) {
    if mapping.is_empty() {
        return;
    }
    let original = frames.clone();
    frames.clear();
    for (key, value) in original {
        let renamed = mapping.get(&key).cloned().unwrap_or(key);
        frames.insert(renamed, value);
    }
}

fn is_icon_sheet(pair: &SheetCandidate) -> bool {
    if pair.relative_dir.components().any(|component| {
        component
            .as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case("icons")
    }) {
        return true;
    }
    let lower = pair.stem.to_ascii_lowercase();
    lower.starts_with("player")
        || lower.starts_with("ship")
        || lower.starts_with("bird")
        || lower.starts_with("dart")
        || lower.starts_with("robot")
        || lower.starts_with("spider")
        || lower.contains("icon")
}

fn is_randomizer_sheet(pair: &SheetCandidate) -> bool {
    !is_icon_sheet(pair)
}

pub fn execute_randomizer<F>(
    plan: &OperationPlan,
    input_dir: &Path,
    output_dir: &Path,
    started_at: Instant,
    options: &RandomizerOptions,
    game_files: &GameFilesLayout,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let randomized_dir = output_dir.join("Randomized");
    fs::create_dir_all(&randomized_dir)?;

    let (seed_value, seed_display) = resolve_randomizer_seed(options.seed.clone());
    let mut size_overrides: HashMap<&str, u32> = HashMap::new();
    size_overrides.insert("FireSheet_01-uhd", 40);
    size_overrides.insert("GauntletSheet-uhd", 50);
    size_overrides.insert("GJ_GameSheet-uhd", 30);
    size_overrides.insert("GJ_GameSheet03-uhd", 30);
    size_overrides.insert("GJ_GameSheet04-uhd", 25);
    size_overrides.insert("GJ_LaunchSheet-uhd", 150);
    size_overrides.insert("GJ_ShopSheet-uhd", 60);
    size_overrides.insert("SecretSheet-uhd", 150);

    let sprite_patterns: [(&str, Option<&str>); 8] = [
        ("dialogIcon_#", None),
        ("game_bg_#_001", None),
        ("GJ_button_#", None),
        ("GJ_square#", None),
        ("groundSquare_#_2_001", Some("*")),
        ("tutorial_#", None),
        ("groundSquare_#_001", Some("g1")),
        ("groundSquare_#_001", Some("g2")),
    ];

    let top_level_entries: Vec<std::fs::DirEntry> =
        fs::read_dir(input_dir)?.filter_map(Result::ok).collect();
    let resources: Vec<String> = top_level_entries
        .iter()
        .filter_map(|entry| entry.file_name().to_str().map(str::to_string))
        .collect();
    let sheet_pairs: Vec<SheetCandidate> =
        discover_sheet_pairs_with_game_plist_fallback(input_dir, game_files)?
            .into_iter()
            .filter(is_randomizer_sheet)
            .collect();

    let mut issues: Vec<ReportIssue> = vec![ReportIssue {
        level: ReportLevel::Info,
        message: format!("Randomizer seed: {seed_display}"),
        file: None,
    }];
    for pair in &sheet_pairs {
        if sheet_uses_external_plist(input_dir, pair) {
            issues.push(ReportIssue {
                level: ReportLevel::Info,
                message: format!("Using vanilla plist for {}", pair.stem),
                file: Some(pair.png_path.to_string_lossy().to_string()),
            });
        }
    }
    let mut completed_units = 0usize;
    let estimated_units = sheet_pairs.len() + sprite_patterns.len();
    on_progress.lock().unwrap()(operation_progress(
        "starting".to_string(),
        0,
        estimated_units,
        0,
        0,
    ));

    for pair in &sheet_pairs {
        check_cancel(cancel.as_ref())?;
        let mut plist_root = match Value::from_file(&pair.plist_path) {
            Ok(value) => value,
            Err(err) => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: format!("failed to parse plist for randomizer: {err}"),
                    file: Some(pair.plist_path.to_string_lossy().to_string()),
                });
                continue;
            }
        };
        let frames = match frames_dictionary_mut(&mut plist_root) {
            Ok(dict) => dict,
            Err(err) => {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: format!("plist has no usable frames dictionary: {err}"),
                    file: Some(pair.plist_path.to_string_lossy().to_string()),
                });
                continue;
            }
        };

        let mut groups: HashMap<String, Vec<String>> = HashMap::new();
        let frame_names: Vec<String> = frames.keys().cloned().collect();
        for frame_name in frame_names {
            let bucket = if pair.stem.starts_with("PlayerExplosion") {
                Some("deatheffect".to_string())
            } else {
                let size_diff = size_overrides
                    .get(pair.stem.as_str())
                    .copied()
                    .unwrap_or(30);
                frames
                    .get(&frame_name)
                    .and_then(Value::as_dictionary)
                    .and_then(|entry| entry.get("textureRect"))
                    .and_then(Value::as_string)
                    .and_then(|texture_rect| rounded_size_bucket(texture_rect, size_diff))
            };
            let Some(bucket) = bucket else {
                continue;
            };
            groups.entry(bucket).or_default().push(frame_name);
        }

        let mut sheet_rename_map: HashMap<String, String> = HashMap::new();
        for (_group_key, group_frames) in groups {
            let old_names = group_frames.clone();
            let mut new_names = old_names.clone();
            shuffle_with_seed(&mut new_names, seed_value);
            for (old_name, new_name) in old_names.into_iter().zip(new_names.into_iter()) {
                if old_name != new_name {
                    sheet_rename_map.insert(old_name, new_name);
                }
            }
        }
        dictionary_rename_keys(frames, &sheet_rename_map);

        let out_dir = randomized_dir.join(&pair.relative_dir);
        fs::create_dir_all(&out_dir)?;
        let out_path = out_dir.join(format!("{}.plist", pair.stem));
        let out_png_path = out_dir.join(format!("{}.png", pair.stem));
        plist_root
            .to_file_xml(&out_path)
            .map_err(|err| AppError::IoError(format!("failed to write randomized plist: {err}")))?;
        if let Err(err) = fs::copy(&pair.png_path, &out_png_path) {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!("failed to copy gamesheet png for randomized output: {err}"),
                file: Some(pair.png_path.to_string_lossy().to_string()),
            });
        }
        completed_units = completed_units.saturating_add(1);
        on_progress.lock().unwrap()(operation_progress(
            pair.stem.clone(),
            completed_units,
            estimated_units,
            0,
            0,
        ));
    }

    let mut special_ground_prefixes: Vec<String> = Vec::new();
    for (pattern, mode) in sprite_patterns {
        check_cancel(cancel.as_ref())?;
        let regex_pattern = format!(
            "^{}-uhd\\.png$",
            regex::escape(pattern).replace("\\#", r"\d+")
        );
        let matcher =
            Regex::new(&regex_pattern).map_err(|err| AppError::ParseError(err.to_string()))?;
        let mut found_textures: Vec<String> = resources
            .iter()
            .filter(|resource| matcher.is_match(resource))
            .cloned()
            .collect();
        if mode == Some("*") {
            for texture_name in &found_textures {
                let prefix = texture_name.chars().take(15).collect::<String>();
                special_ground_prefixes.push(prefix);
            }
        } else if mode == Some("g1") {
            found_textures.retain(|name| {
                !special_ground_prefixes
                    .iter()
                    .any(|prefix| name.starts_with(prefix))
            });
        } else if mode == Some("g2") {
            found_textures.retain(|name| {
                special_ground_prefixes
                    .iter()
                    .any(|prefix| name.starts_with(prefix))
            });
        }

        let mut shuffled = found_textures.clone();
        shuffle_with_seed(&mut shuffled, seed_value);
        for (source_name, destination_name) in found_textures.iter().zip(shuffled.iter()) {
            let source_path = input_dir.join(source_name);
            let destination_path = randomized_dir.join(destination_name);
            if let Err(err) = fs::copy(&source_path, &destination_path) {
                issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: format!("failed to copy randomized sprite: {err}"),
                    file: Some(source_path.to_string_lossy().to_string()),
                });
            }
        }
        completed_units = completed_units.saturating_add(1);
        on_progress.lock().unwrap()(operation_progress(
            pattern.to_string(),
            completed_units,
            estimated_units,
            0,
            0,
        ));
    }

    if sheet_pairs.is_empty() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "No eligible menu plist/png sheets discovered (icons are skipped)."
                .to_string(),
            file: None,
        });
    }

    Ok(OperationReport {
        operation: format!("{:?}", plan.kind),
        files_seen: sheet_pairs.len(),
        files_processed: completed_units,
        output_dir: randomized_dir.to_string_lossy().to_string(),
        elapsed_ms: started_at.elapsed().as_millis(),
        issues,
    })
}
