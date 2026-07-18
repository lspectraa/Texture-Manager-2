use std::collections::BTreeMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;

use plist::{Dictionary, Value};
use regex::Regex;
use serde::Serialize;

use crate::core::contracts::phase_defaults;
use crate::core::errors::AppError;
use crate::core::game_files::{
    ensure_sheet_split_cached, find_current_sheet_for_input, find_current_sheet_for_plist,
    png_path_to_data_url, resolve_cached_split_sprite, GameFilesLayout,
};
use crate::core::icon_editor::icon_editor_extract_frames;
use crate::core::merger::merge_plist_from_memory;
use crate::core::porter::save_merged_sheet;
use crate::core::report::{OperationProgress, OperationReport, ReportIssue, ReportLevel};
use crate::core::safe_fs::{ensure_readable_image_file, ensure_user_absolute_path};
use crate::core::splitter::split_sheet_candidate_memory;
use crate::core::{
    contracts::GeodeButtonsOptions,
    discovery::{discover_sheet_pairs, SheetCandidate},
};
use image::imageops::resize;
use image::{imageops::FilterType, ImageFormat, RgbaImage};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeodeButtonsTargetSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeodeButtonsTargetFrame {
    pub name: String,
    pub sprite_size: GeodeButtonsTargetSize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeodeButtonsTargetGroup {
    /// Stable programmatic identifier (used for UI grouping).
    pub id: String,
    pub label: String,
    pub frames: Vec<GeodeButtonsTargetFrame>,
    pub preview_png_data_url: Option<String>,
}

fn frame_base_type(frame_name: &str) -> Option<&'static str> {
    if frame_name.starts_with("geode.loader/baseTab_Normal_") {
        return Some("tabs");
    }
    if frame_name.starts_with("geode.loader/baseEditor_Normal_") {
        return Some("editorBase");
    }
    if frame_name.starts_with("geode.loader/baseAccount_Normal_") {
        return Some("accountBase");
    }
    if frame_name.starts_with("geode.loader/baseCross_") {
        return Some("cross");
    }
    if frame_name.starts_with("geode.loader/baseCategory_") {
        return Some("category");
    }
    if frame_name.starts_with("geode.loader/baseLeaderboard_") {
        return Some("leaderboard");
    }
    if frame_name.starts_with("geode.loader/baseIconSelect_") {
        return Some("iconSelect");
    }
    if frame_name.starts_with("geode.loader/baseCircle_") {
        return Some("circle");
    }
    None
}

fn variant_slug(variant: &crate::core::contracts::GeodeButtonsVariant) -> &'static str {
    use crate::core::contracts::GeodeButtonsVariant as V;
    match variant {
        V::Primary => "primary",
        V::Secondary => "secondary",
        V::DarkAqua => "darkAqua",
        V::DarkPurple => "darkPurple",
        V::Gray => "gray",
        V::Error => "error",
        V::Info => "info",
        V::Pink => "pink",
    }
}

fn variant_label(variant: &crate::core::contracts::GeodeButtonsVariant) -> &'static str {
    use crate::core::contracts::GeodeButtonsVariant as V;
    match variant {
        V::Primary => "Primary",
        V::Secondary => "Secondary",
        V::DarkAqua => "Dark Aqua",
        V::DarkPurple => "Dark Purple",
        V::Gray => "Gray",
        V::Error => "Error",
        V::Info => "Info",
        V::Pink => "Pink",
    }
}

fn base_type_label(base_type: &str) -> &'static str {
    match base_type {
        "tabs" => "Tabs",
        "editorBase" => "Editor Base",
        "accountBase" => "Account Base",
        "iconSelect" => "Icon Button",
        "cross" => "Cross",
        "category" => "Category",
        "leaderboard" => "Leaderboard",
        "circle" => "Circle",
        _ => "Unknown",
    }
}

fn frames_dictionary<'a>(root: &'a Value) -> Result<&'a Dictionary, AppError> {
    root.as_dictionary()
        .and_then(|dict| dict.get("frames"))
        .and_then(Value::as_dictionary)
        .ok_or_else(|| AppError::ParseError("plist missing top-level `frames` dictionary".to_string()))
}

fn parse_two_uints_loose(raw: &str) -> Option<(u32, u32)> {
    let trimmed = raw.trim().trim_start_matches('{').trim_end_matches('}');
    let mut parts = trimmed.split(',');
    let a = parts.next()?.trim().parse::<f64>().ok()?;
    let b = parts.next()?.trim().parse::<f64>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((a.floor().max(0.0) as u32, b.floor().max(0.0) as u32))
}

fn sprite_size_from_frame_dict(frame_dict: &Dictionary) -> Option<GeodeButtonsTargetSize> {
    let raw = frame_dict.get("spriteSize")?.as_string()?;
    let (w, h) = parse_two_uints_loose(raw)?;
    Some(GeodeButtonsTargetSize { width: w, height: h })
}

fn push_frame(
    groups: &mut BTreeMap<String, GeodeButtonsTargetGroup>,
    group_id: &str,
    group_label: &str,
    frame_name: &str,
    sprite_size: GeodeButtonsTargetSize,
) {
    let entry = groups.entry(group_id.to_string()).or_insert_with(|| GeodeButtonsTargetGroup {
        id: group_id.to_string(),
        label: group_label.to_string(),
        frames: Vec::new(),
        preview_png_data_url: None,
    });
    entry.frames.push(GeodeButtonsTargetFrame {
        name: frame_name.to_string(),
        sprite_size,
    });
}

fn trailing_token_from_frame_name(frame_name: &str) -> Option<&str> {
    let suffix = frame_name.rsplit_once('_').map(|(_, right)| right)?;
    Some(suffix.strip_suffix(".png").unwrap_or(suffix))
}

fn humanize_camel_token(token: &str) -> String {
    if token.is_empty() {
        return String::new();
    }
    let mut out = String::with_capacity(token.len() + 8);
    let mut prev_is_lower_or_digit = false;
    for ch in token.chars() {
        let curr_is_upper = ch.is_ascii_uppercase();
        if curr_is_upper && prev_is_lower_or_digit {
            out.push(' ');
        }
        out.push(ch);
        prev_is_lower_or_digit = ch.is_ascii_lowercase() || ch.is_ascii_digit();
    }
    out
}

fn individual_frame_label(base_type: &str, frame_name: &str) -> String {
    let base = base_type_label(base_type);
    let token = trailing_token_from_frame_name(frame_name).unwrap_or("Unknown");
    format!("{base} {}", humanize_camel_token(token))
}

fn individual_frame_group_id(base_type: &str, frame_name: &str) -> String {
    format!("{base_type}:{frame_name}")
}

/// Builds a structured index of the Geode loader UI primitives we generate for.
/// This is used by the Create Geode Buttons tool to power the grid and ensure we only target frames
/// that actually exist in the loaded sheet.
///
/// When `use_game_files_cache` is true (vanilla BlankSheet), previews go through the split-cache
/// pipeline with hash-based update checks. When false (custom user plist), the sheet is read
/// directly from disk and never written into or remapped through game-files cache.
pub fn geode_buttons_target_index(
    plist_path: &Path,
    layout: &GameFilesLayout,
    use_game_files_cache: bool,
) -> Result<Vec<GeodeButtonsTargetGroup>, AppError> {
    crate::core::safe_fs::ensure_existing_user_file(plist_path)?;
    if use_game_files_cache && !layout.geometry_dash_found() {
        return Err(crate::core::game_files::geometry_dash_required_error());
    }
    let root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;

    let frames = frames_dictionary(&root)?;
    let circle_re =
        Regex::new(r"^geode\.loader/baseCircle_(?P<size>[A-Za-z]+?)(?P<alt>Alt)?_(?P<color>[A-Za-z]+)\.png$")
            .map_err(|err| AppError::ParseError(format!("failed to compile regex: {err}")))?;

    let mut groups: BTreeMap<String, GeodeButtonsTargetGroup> = BTreeMap::new();

    for (frame_name, frame_value) in frames.iter() {
        let Some(frame_dict) = frame_value.as_dictionary() else {
            continue;
        };
        let Some(sprite_size) = sprite_size_from_frame_dict(frame_dict) else {
            continue;
        };
        let Some(base_type) = frame_base_type(frame_name.as_str()) else {
            continue;
        };
        if base_type == "tabs"
            || base_type == "iconSelect"
            || base_type == "editorBase"
            || base_type == "accountBase"
        {
            let group_id = individual_frame_group_id(base_type, frame_name);
            let group_label = individual_frame_label(base_type, frame_name);
            push_frame(
                &mut groups,
                group_id.as_str(),
                group_label.as_str(),
                frame_name,
                sprite_size,
            );
            continue;
        }
        if base_type == "circle" && circle_re.captures(frame_name.as_str()).is_none() {
            continue;
        }
        let Some(variant) = frame_variant_from_color_suffix(frame_name.as_str()) else {
            continue;
        };
        let group_id = format!("{base_type}:{}", variant_slug(&variant));
        let group_label = format!("{} {}", base_type_label(base_type), variant_label(&variant));
        push_frame(
            &mut groups,
            group_id.as_str(),
            group_label.as_str(),
            frame_name,
            sprite_size,
        );
    }

    for group in groups.values_mut() {
        group.frames.sort_by(|a, b| a.name.cmp(&b.name));
    }

    if use_game_files_cache {
        fill_previews_from_game_files_cache(layout, plist_path, &mut groups)?;
    }

    let needs_direct_previews = groups.values().any(|g| g.preview_png_data_url.is_none());
    if needs_direct_previews {
        fill_previews_from_direct_extract(plist_path, &mut groups);
    }

    Ok(groups.into_values().collect())
}

fn fill_previews_from_game_files_cache(
    layout: &GameFilesLayout,
    plist_path: &Path,
    groups: &mut BTreeMap<String, GeodeButtonsTargetGroup>,
) -> Result<(), AppError> {
    // Vanilla BlankSheet: resolve through Steam/Geode layout, then hash-check/rebuild split cache.
    let source_pair = match resolve_geode_buttons_cached_sheet_candidate(layout, plist_path)? {
        Some(pair) => pair,
        None => resolve_geode_buttons_default_sheet(layout)?.ok_or_else(|| {
            AppError::InvalidPath(
                "could not resolve vanilla BlankSheet for geode buttons cache pipeline",
            )
        })?,
    };
    let splitter_opts = phase_defaults().splitter;
    let split_dir = ensure_sheet_split_cached(layout, &source_pair, &splitter_opts)?;
    for group in groups.values_mut() {
        let biggest_name = group
            .frames
            .iter()
            .max_by_key(|f| (f.sprite_size.width as u64) * (f.sprite_size.height as u64))
            .map(|f| f.name.clone());
        let Some(frame_name) = biggest_name else {
            continue;
        };
        if let Some(sprite_path) = resolve_cached_split_sprite(&split_dir, frame_name.as_str()) {
            if let Ok(data_url) = png_path_to_data_url(&sprite_path) {
                group.preview_png_data_url = Some(data_url);
            }
        }
    }
    Ok(())
}

fn fill_previews_from_direct_extract(
    plist_path: &Path,
    groups: &mut BTreeMap<String, GeodeButtonsTargetGroup>,
) {
    let Ok(extracted) = icon_editor_extract_frames(plist_path) else {
        return;
    };
    let by_name: BTreeMap<String, String> = extracted
        .into_iter()
        .map(|frame| (frame.name, frame.png_data_url))
        .collect();
    for group in groups.values_mut() {
        if group.preview_png_data_url.is_some() {
            continue;
        }
        let biggest_name = group
            .frames
            .iter()
            .max_by_key(|f| (f.sprite_size.width as u64) * (f.sprite_size.height as u64))
            .map(|f| f.name.as_str());
        if let Some(frame_name) = biggest_name {
            group.preview_png_data_url = by_name.get(frame_name).cloned();
        }
    }
}

/// Resolve the BlankSheet used by Geode Buttons from Steam/Geode game files.
/// Prefers `geode/resources/geode.loader`, then vanilla `Resources`.
pub fn resolve_geode_buttons_default_sheet(
    layout: &GameFilesLayout,
) -> Result<Option<SheetCandidate>, AppError> {
    if !layout.geometry_dash_found() {
        return Ok(None);
    }
    const STEMS: [&str; 3] = ["BlankSheet-uhd", "BlankSheet-hd", "BlankSheet"];
    for stem in STEMS {
        if let Some(pair) =
            find_current_sheet_for_input(layout, Path::new("geode.loader"), stem)?
        {
            return Ok(Some(pair));
        }
    }
    for stem in STEMS {
        if let Some(pair) = find_current_sheet_for_input(layout, Path::new(""), stem)? {
            return Ok(Some(pair));
        }
    }
    Ok(None)
}

pub fn resolve_geode_buttons_default_input_dir(layout: &GameFilesLayout) -> String {
    if !layout.geometry_dash_found() {
        return String::new();
    }
    layout
        .geode_resources
        .join("geode.loader")
        .to_string_lossy()
        .to_string()
}

fn path_is_under(parent: &Path, child: &Path) -> bool {
    let parent_norm = parent.canonicalize().unwrap_or_else(|_| parent.to_path_buf());
    let child_norm = child.canonicalize().unwrap_or_else(|_| child.to_path_buf());
    child_norm.strip_prefix(&parent_norm).is_ok()
}

/// True when `plist_path` lives under Steam/Geode game-files roots (safe for split-cache).
fn geode_buttons_plist_is_under_game_files(layout: &GameFilesLayout, plist_path: &Path) -> bool {
    let normalized = plist_path
        .canonicalize()
        .unwrap_or_else(|_| plist_path.to_path_buf());
    let Some(parent) = normalized.parent() else {
        return false;
    };
    if path_is_under(&layout.resources, parent) {
        return true;
    }
    if path_is_under(&layout.geode_resources, parent) {
        return true;
    }
    if path_is_under(&layout.geode_unzipped, parent) {
        return true;
    }
    false
}

/// Resolve a sheet through the game-files cache/retrieve pipeline only when the plist is under
/// Steam/Geode roots. Custom user paths return `None` so callers read the file directly.
fn resolve_geode_buttons_cached_sheet_candidate(
    layout: &GameFilesLayout,
    plist_path: &Path,
) -> Result<Option<SheetCandidate>, AppError> {
    if !geode_buttons_plist_is_under_game_files(layout, plist_path) {
        return Ok(None);
    }
    find_current_sheet_for_plist(layout, plist_path)
}

/// Auto-select BlankSheet plist with priority: `-uhd` -> `-hd` -> no suffix.
pub fn resolve_geode_buttons_plist(input_dir: &Path) -> Result<Option<String>, AppError> {
    let pairs = discover_sheet_pairs(input_dir)?;
    let mut best_path: Option<String> = None;
    let mut best_rank: i32 = -1;

    for pair in pairs {
        let stem_lower = pair.stem.to_ascii_lowercase();
        if !stem_lower.contains("blanksheet") {
            continue;
        }
        let rank = if stem_lower.ends_with("-uhd") {
            3
        } else if stem_lower.ends_with("-hd") {
            2
        } else {
            1
        };
        if rank > best_rank {
            best_rank = rank;
            best_path = Some(pair.plist_path.to_string_lossy().to_string());
        }
    }

    Ok(best_path)
}

fn progress_total_as_u32(total: usize) -> u32 {
    total.max(1).min(u32::MAX as usize) as u32
}

fn progress_done_as_u32(done: usize, total: usize) -> u32 {
    done.min(total.max(1)).min(u32::MAX as usize) as u32
}

fn operation_progress(gamesheet_name: String, done: usize, total: usize) -> OperationProgress {
    OperationProgress {
        gamesheet_name,
        sprites_completed: progress_done_as_u32(done, total),
        sprites_total: progress_total_as_u32(total),
        plists_completed: 0,
        plists_total: 0,
    }
}

fn check_cancel(cancel: &AtomicBool) -> Result<(), AppError> {
    if cancel.load(Ordering::Relaxed) {
        return Err(AppError::Cancelled);
    }
    Ok(())
}

fn rgb_to_hsv(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g.max(b));
    let min = r.min(g.min(b));
    let delta = max - min;
    let v = max;
    let s = if max <= 1e-6 { 0.0 } else { delta / max };
    let mut h = if delta <= 1e-6 {
        0.0
    } else if max == r {
        ((g - b) / delta) % 6.0
    } else if max == g {
        ((b - r) / delta) + 2.0
    } else {
        ((r - g) / delta) + 4.0
    };
    h /= 6.0;
    if h < 0.0 {
        h += 1.0;
    }
    (h, s, v)
}

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> (f32, f32, f32) {
    let h6 = (h.fract() * 6.0).max(0.0);
    let i = h6.floor();
    let f = h6 - i;
    let p = v * (1.0 - s);
    let q = v * (1.0 - f * s);
    let t = v * (1.0 - (1.0 - f) * s);
    match i as i32 {
        0 => (v, t, p),
        1 => (q, v, p),
        2 => (p, v, t),
        3 => (p, q, v),
        4 => (t, p, v),
        _ => (v, p, q),
    }
}

fn clamp01(v: f32) -> f32 {
    v.max(0.0).min(1.0)
}

fn apply_value_delta_rgb(r: f32, g: f32, b: f32, val_delta: f32) -> (f32, f32, f32) {
    let d = clamp01(val_delta.abs());
    if val_delta >= 0.0 {
        // Photoshop-like brightness: +1.0 pushes every channel to white.
        (
            r + (1.0 - r) * d,
            g + (1.0 - g) * d,
            b + (1.0 - b) * d,
        )
    } else {
        // -1.0 pushes every channel to black.
        (r * (1.0 - d), g * (1.0 - d), b * (1.0 - d))
    }
}

fn apply_hsv_delta(img: &mut RgbaImage, hue_deg: f32, sat_delta: f32, val_delta: f32) {
    if hue_deg.abs() < 1e-6 && sat_delta.abs() < 1e-6 && val_delta.abs() < 1e-6 {
        return;
    }
    let hue_delta = hue_deg / 360.0;
    for pixel in img.pixels_mut() {
        let a = pixel[3];
        if a == 0 {
            continue;
        }
        let r = pixel[0] as f32 / 255.0;
        let g = pixel[1] as f32 / 255.0;
        let b = pixel[2] as f32 / 255.0;
        let (mut h, mut s, mut v) = rgb_to_hsv(r, g, b);
        h = (h + hue_delta).rem_euclid(1.0);
        // Do not introduce saturation into fully desaturated pixels (white/black/gray).
        if s <= 1e-6 && sat_delta > 0.0 {
            s = 0.0;
        } else {
            s = clamp01(s + sat_delta);
        }
        v = clamp01(v);
        let (nr, ng, nb) = hsv_to_rgb(h, s, v);
        let (vr, vg, vb) = apply_value_delta_rgb(clamp01(nr), clamp01(ng), clamp01(nb), val_delta);
        pixel[0] = (clamp01(vr) * 255.0).round() as u8;
        pixel[1] = (clamp01(vg) * 255.0).round() as u8;
        pixel[2] = (clamp01(vb) * 255.0).round() as u8;
    }
}

fn resize_preserve_aspect_fit(base: &RgbaImage, target_w: u32, target_h: u32) -> RgbaImage {
    let tw = target_w.max(1);
    let th = target_h.max(1);
    if base.width() == tw && base.height() == th {
        return base.clone();
    }
    let bw = base.width().max(1) as f32;
    let bh = base.height().max(1) as f32;
    let scale = ((tw as f32) / bw).min((th as f32) / bh);
    let nw = ((bw * scale).round() as u32).max(1).min(tw);
    let nh = ((bh * scale).round() as u32).max(1).min(th);
    let resized = resize(base, nw, nh, FilterType::CatmullRom);
    let mut out = RgbaImage::from_pixel(tw, th, image::Rgba([0, 0, 0, 0]));
    let ox = (tw - nw) / 2;
    let oy = (th - nh) / 2;
    for y in 0..nh {
        for x in 0..nw {
            out.put_pixel(ox + x, oy + y, *resized.get_pixel(x, y));
        }
    }
    out
}

fn build_family_largest_dims(source_sprites: &BTreeMap<String, RgbaImage>) -> BTreeMap<String, (u32, u32)> {
    let mut out: BTreeMap<String, (u32, u32)> = BTreeMap::new();
    for (name, img) in source_sprites {
        let Some(family_id) = frame_family_id(name.as_str()) else {
            continue;
        };
        let area = (img.width() as u64) * (img.height() as u64);
        match out.get(&family_id) {
            None => {
                out.insert(family_id, (img.width(), img.height()));
            }
            Some((w, h)) => {
                let best_area = (*w as u64) * (*h as u64);
                if area > best_area {
                    out.insert(family_id, (img.width(), img.height()));
                }
            }
        }
    }
    out
}

fn scale_by_family_factor(
    normalized_base: &RgbaImage,
    factor: f32,
    target_w: u32,
    target_h: u32,
) -> RgbaImage {
    let tw = target_w.max(1);
    let th = target_h.max(1);
    let f = factor.max(0.01).min(1.0);
    let sw = ((normalized_base.width() as f32) * f).round().max(1.0) as u32;
    let sh = ((normalized_base.height() as f32) * f).round().max(1.0) as u32;
    let resized = resize(normalized_base, sw.min(tw), sh.min(th), FilterType::CatmullRom);
    let mut out = RgbaImage::from_pixel(tw, th, image::Rgba([0, 0, 0, 0]));
    let ox = (tw.saturating_sub(resized.width())) / 2;
    let oy = (th.saturating_sub(resized.height())) / 2;
    for y in 0..resized.height() {
        for x in 0..resized.width() {
            out.put_pixel(ox + x, oy + y, *resized.get_pixel(x, y));
        }
    }
    out
}

fn frame_family_id(frame_name: &str) -> Option<String> {
    let base_type = frame_base_type(frame_name)?;
    if base_type == "tabs"
        || base_type == "iconSelect"
        || base_type == "editorBase"
        || base_type == "accountBase"
    {
        return Some(individual_frame_group_id(base_type, frame_name));
    }
    let variant = frame_variant_from_color_suffix(frame_name)?;
    Some(format!("{base_type}:{}", variant_slug(&variant)))
}

fn frame_variant_from_color_suffix(frame_name: &str) -> Option<crate::core::contracts::GeodeButtonsVariant> {
    use crate::core::contracts::GeodeButtonsVariant as V;
    let suffix = frame_name
        .rsplit_once('_')
        .map(|(_, right)| right)
        .unwrap_or("");
    let color = suffix.strip_suffix(".png").unwrap_or(suffix);
    match color {
        "Green" => Some(V::Primary),
        "Cyan" => Some(V::Secondary),
        "DarkAqua" => Some(V::DarkAqua),
        "DarkPurple" => Some(V::DarkPurple),
        "Gray" => Some(V::Gray),
        "Red" => Some(V::Error),
        "Blue" => Some(V::Info),
        "Pink" => Some(V::Pink),
        _ => None,
    }
}

fn resolve_hsv_delta(
    options: &GeodeButtonsOptions,
    family_id: &str,
    variant: crate::core::contracts::GeodeButtonsVariant,
) -> (f32, f32, f32) {
    if let Some(by_family) = &options.family_variant_rules {
        if let Some(map) = by_family.get(family_id) {
            if let Some(delta) = map.get(&variant) {
                return (delta.hue_deg, delta.sat_delta, delta.val_delta);
            }
        }
    }
    for rule in &options.variant_rules {
        if rule.variant == variant {
            return (
                rule.hsv.hue_deg,
                rule.hsv.sat_delta,
                rule.hsv.val_delta,
            );
        }
    }
    (0.0, 0.0, 0.0)
}

fn largest_family_sprite(
    family_id: &str,
    source_sprites: &BTreeMap<String, RgbaImage>,
) -> Option<RgbaImage> {
    let mut best: Option<(&String, &RgbaImage, u64)> = None;
    for (name, img) in source_sprites.iter() {
        if frame_family_id(name.as_str()).as_deref() != Some(family_id) {
            continue;
        }
        let area = (img.width() as u64) * (img.height() as u64);
        match best {
            None => best = Some((name, img, area)),
            Some((best_name, _best_img, best_area)) => {
                if area > best_area || (area == best_area && name < best_name) {
                    best = Some((name, img, area));
                }
            }
        }
    }
    best.map(|(_, img, _)| img.clone())
}

fn normalize_user_template_path(path: &str) -> PathBuf {
    let mut s = path.trim().to_string();
    const PREFIX: &str = "file://";
    if s.len() >= PREFIX.len() && s[..PREFIX.len()].eq_ignore_ascii_case(PREFIX) {
        s = s[PREFIX.len()..].to_string();
        if cfg!(windows) && s.starts_with('/') && s.len() > 2 {
            let b = s.as_bytes();
            if b[0] == b'/' && b[2] == b':' {
                s.remove(0);
            }
        }
    }
    PathBuf::from(s)
}

fn load_template_rgba(path: &str) -> Result<RgbaImage, AppError> {
    let p = normalize_user_template_path(path);
    ensure_user_absolute_path(&p)?;
    ensure_readable_image_file(&p)?;
    let img = image::open(&p).map_err(|err| {
        AppError::ParseError(format!(
            "failed to open template png `{}`: {err}",
            p.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("template")
        ))
    })?;
    Ok(img.to_rgba8())
}

/// PNG data URL for webview previews — same path rules as export (`load_template_rgba`).
pub fn geode_buttons_template_preview_data_url(path: &str) -> Result<String, AppError> {
    let p = normalize_user_template_path(path);
    ensure_user_absolute_path(&p)?;
    ensure_readable_image_file(&p)?;
    let img = image::open(&p).map_err(|err| {
        AppError::ParseError(format!(
            "failed to open template image `{}`: {err}",
            p.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("template")
        ))
    })?;
    let mut bytes = Vec::new();
    {
        let mut cursor = Cursor::new(&mut bytes);
        img.write_to(&mut cursor, ImageFormat::Png).map_err(|err| {
            AppError::ParseError(format!(
                "failed to encode template preview `{}`: {err}",
                p.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("template")
            ))
        })?;
    }
    let b64 = BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{b64}"))
}

fn template_path_for_frame(options: &GeodeButtonsOptions, frame_name: &str) -> Option<String> {
    if let Some(family) = frame_family_id(frame_name) {
        if let Some(path) = options.templates.family_templates.get(&family) {
            return Some(path.clone());
        }
    }
    if frame_name == "geode.loader/baseTab_Normal_Selected.png" {
        return options
            .templates
            .tab_selected
            .clone()
            .or_else(|| options.templates.family_templates.get("tabs").cloned());
    }
    if frame_name == "geode.loader/baseTab_Normal_Unselected.png" {
        return options
            .templates
            .tab_unselected
            .clone()
            .or_else(|| options.templates.family_templates.get("tabs").cloned());
    }
    if frame_name == "geode.loader/baseTab_Normal_UnselectedDark.png" {
        return options
            .templates
            .tab_unselected_dark
            .clone()
            .or_else(|| options.templates.family_templates.get("tabs").cloned());
    }
    let family = frame_family_id(frame_name)?;
    options.templates.family_templates.get(&family).cloned()
}

pub fn run_geode_buttons<F>(
    plan_kind_label: &str,
    candidate: &SheetCandidate,
    output_dir: &Path,
    options: &GeodeButtonsOptions,
    on_progress: &mut F,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress) + Send,
{
    let started_at = Instant::now();
    let splitter_opts = crate::core::contracts::SplitterOptions { sheet_concurrency: 1 };
    check_cancel(cancel.as_ref())?;

    let total_frames = crate::core::plist::count_frames_in_plist(&candidate.plist_path)?;
    on_progress(operation_progress(candidate.stem.clone(), 0, total_frames));

    let completed = AtomicUsize::new(0);
    let split = split_sheet_candidate_memory(candidate, &splitter_opts, || {
        let n = completed.fetch_add(1, Ordering::Relaxed) + 1;
        on_progress(operation_progress(candidate.stem.clone(), n, total_frames));
    })?;

    let mut issues: Vec<ReportIssue> = split.issues;
    let mut plist_root = split.plist_root;
    let mut sprites = split.sprites;
    let source_sprites = sprites.clone();
    let family_largest_dims = build_family_largest_dims(&source_sprites);

    // Cache templates by path.
    let mut template_cache: BTreeMap<String, RgbaImage> = BTreeMap::new();
    // Cache largest source sprite per family.
    let mut family_base_cache: BTreeMap<String, RgbaImage> = BTreeMap::new();

    // Replace frames.
    let mut replaced = 0usize;
    let mut targeted = 0usize;
    for (frame_name, frame_value) in sprites.iter_mut() {
        check_cancel(cancel.as_ref())?;

        // Only act on known families.
        let Some(family_id) = frame_family_id(frame_name.as_str()) else {
            continue;
        };

        let base_type = frame_base_type(frame_name.as_str()).unwrap_or("");
        let variant = frame_variant_from_color_suffix(frame_name.as_str());
        let requires_variant = matches!(base_type, "circle" | "cross" | "category" | "leaderboard");

        if requires_variant && variant.is_none() {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: "frame color suffix not mapped to a UI variant; leaving original pixels".to_string(),
                file: Some(frame_name.clone()),
            });
            continue;
        }

        targeted += 1;
        let base_raw = if let Some(template_path) = template_path_for_frame(options, frame_name.as_str()) {
            if let Some(img) = template_cache.get(&template_path) {
                img.clone()
            } else {
                let loaded = load_template_rgba(&template_path)?;
                template_cache.insert(template_path.clone(), loaded.clone());
                loaded
            }
        } else {
            if let Some(img) = family_base_cache.get(&family_id) {
                img.clone()
            } else {
                let Some(fallback) = largest_family_sprite(&family_id, &source_sprites) else {
                    issues.push(ReportIssue {
                        level: ReportLevel::Warning,
                        message: format!("no source frames found for family `{family_id}`"),
                        file: Some(frame_name.clone()),
                    });
                    continue;
                };
                family_base_cache.insert(family_id.to_string(), fallback.clone());
                fallback
            }
        };

        let target_size = frame_value.dimensions();
        let Some((largest_w, largest_h)) = family_largest_dims.get(&family_id).copied() else {
            issues.push(ReportIssue {
                level: ReportLevel::Warning,
                message: format!("missing largest-dimension mapping for family `{family_id}`"),
                file: Some(frame_name.clone()),
            });
            continue;
        };
        let normalized_base = resize_preserve_aspect_fit(&base_raw, largest_w, largest_h);
        let factor_w = target_size.0 as f32 / largest_w.max(1) as f32;
        let factor_h = target_size.1 as f32 / largest_h.max(1) as f32;
        let factor = factor_w.min(factor_h);
        let mut out = scale_by_family_factor(&normalized_base, factor, target_size.0, target_size.1);

        let effective_variant = variant.unwrap_or(crate::core::contracts::GeodeButtonsVariant::Primary);
        let (h, s, val) = resolve_hsv_delta(options, family_id.as_str(), effective_variant);
        apply_hsv_delta(&mut out, h, s, val);

        *frame_value = out;
        replaced += 1;
    }

    if targeted == 0 {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "no target frames found in this sheet".to_string(),
            file: Some(candidate.stem.clone()),
        });
    } else if replaced == 0 {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "no frames were replaced (likely missing templates)".to_string(),
            file: Some(candidate.stem.clone()),
        });
    }

    let merger_options = crate::core::contracts::MergerOptions {
        include_outside_plist_files: false,
        dimensions: None,
        sheet_concurrency: 1,
    };
    let sheet_label = candidate.stem.clone();
    let mut on_sprite_loaded = |_label: String| {};
    let (atlas, _w, _h, _count, mut merge_issues) = merge_plist_from_memory(
        &mut plist_root,
        &sprites,
        sheet_label.as_str(),
        &merger_options,
        &mut on_sprite_loaded,
    )?;
    issues.append(&mut merge_issues);

    let out_dir = output_dir.join(&candidate.relative_dir);
    save_merged_sheet(&out_dir, candidate.stem.as_str(), &plist_root, &atlas)?;

    Ok(OperationReport {
        operation: plan_kind_label.to_string(),
        files_seen: 1,
        files_processed: replaced,
        output_dir: out_dir.to_string_lossy().to_string(),
        elapsed_ms: started_at.elapsed().as_millis(),
        issues,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        std::env::temp_dir().join(format!("tm2-geode-buttons-{label}-{nanos}"))
    }

    fn test_layout(root: &Path, gd: &Path) -> GameFilesLayout {
        GameFilesLayout {
            root: root.to_path_buf(),
            geometry_dash_dir: gd.to_path_buf(),
            resources: gd.join("Resources"),
            geode_resources: gd.join("geode").join("resources"),
            geode_unzipped: gd.join("geode").join("unzipped"),
            current_split: root.join("split-cache"),
            legacy: root.join("legacy"),
        }
    }

    #[test]
    fn custom_plist_outside_game_files_skips_cache_pipeline() {
        let root = unique_temp_dir("root");
        let gd = unique_temp_dir("gd");
        let custom = unique_temp_dir("custom");
        fs::create_dir_all(gd.join("Resources")).expect("resources");
        fs::create_dir_all(gd.join("geode").join("resources").join("geode.loader")).expect("loader");
        fs::create_dir_all(&custom).expect("custom");

        let layout = test_layout(&root, &gd);
        let custom_plist = custom.join("BlankSheet-uhd.plist");
        fs::write(&custom_plist, "unused").expect("write custom");

        assert!(
            !geode_buttons_plist_is_under_game_files(&layout, &custom_plist),
            "custom path must not be treated as game-files"
        );
        assert!(
            resolve_geode_buttons_cached_sheet_candidate(&layout, &custom_plist)
                .expect("resolve")
                .is_none(),
            "custom BlankSheet must not remap into Steam/Geode cache"
        );

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&gd);
        let _ = fs::remove_dir_all(&custom);
    }

    #[test]
    fn geode_loader_plist_uses_cache_pipeline() {
        let root = unique_temp_dir("root2");
        let gd = unique_temp_dir("gd2");
        fs::create_dir_all(gd.join("Resources")).expect("resources");
        let loader = gd.join("geode").join("resources").join("geode.loader");
        fs::create_dir_all(&loader).expect("loader");
        let layout = test_layout(&root, &gd);
        let plist = loader.join("BlankSheet-uhd.plist");
        let png = loader.join("BlankSheet-uhd.png");
        fs::write(&plist, "unused").expect("write plist");
        fs::write(&png, "unused").expect("write png");

        assert!(layout.geometry_dash_found());
        assert!(geode_buttons_plist_is_under_game_files(&layout, &plist));
        let cached = resolve_geode_buttons_cached_sheet_candidate(&layout, &plist).expect("resolve");
        let default = resolve_geode_buttons_default_sheet(&layout).expect("default");
        assert!(
            cached.is_some() || default.is_some(),
            "vanilla geode.loader plist should resolve via cache candidate or default sheet lookup"
        );

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&gd);
    }

    #[test]
    fn vanilla_cache_flag_requires_resolvable_blank_sheet() {
        let root = unique_temp_dir("root3");
        let gd = unique_temp_dir("gd3");
        fs::create_dir_all(gd.join("Resources")).expect("resources");
        fs::create_dir_all(gd.join("geode").join("resources").join("geode.loader")).expect("loader");
        let layout = test_layout(&root, &gd);
        let missing = gd
            .join("geode")
            .join("resources")
            .join("geode.loader")
            .join("BlankSheet-uhd.plist");
        // Plist path is under game files but the sheet files do not exist yet.
        let mut groups: BTreeMap<String, GeodeButtonsTargetGroup> = BTreeMap::new();
        let err = fill_previews_from_game_files_cache(&layout, &missing, &mut groups);
        assert!(
            err.is_err(),
            "vanilla cache pipeline should error when BlankSheet cannot be resolved"
        );

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&gd);
    }
}

