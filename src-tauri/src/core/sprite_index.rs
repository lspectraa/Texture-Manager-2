//! Durable trimmed-sprite hash index for reusing vanilla higher-tier frames.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use image::imageops::FilterType;
use image::{DynamicImage, Rgba, RgbaImage};
use plist::{Dictionary, Value};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::core::contracts::UpscalerTargetGraphics;
use crate::core::errors::AppError;
use crate::core::game_files::{
    locate_current_sheet_pair, resolve_current_source_dir, GameFilesLayout,
};
use crate::core::merger::trim_transparent_rgba;
use crate::core::plist::normalize_plist_frames_to_format3;
use crate::core::porter::{port_source_tier_from_stem, PortSourceGraphicsTier};
use crate::core::safe_fs::ensure_no_parent_dir_components;

const INDEX_FILE_NAME: &str = "sprite-index.json";
/// Bump when the sprite pixel-hash algorithm changes so sheets are forced to rebuild.
const INDEX_VERSION: u32 = 3;
/// Stored on each sheet entry; must match for skip-if-unchanged.
const CONTENT_HASH_VERSION: u32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SpriteIndexFile {
    pub version: u32,
    #[serde(default)]
    pub indexed_sheets: BTreeMap<String, IndexedSheetMeta>,
    #[serde(default)]
    pub sprites: BTreeMap<String, IndexedSpriteMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IndexedSheetMeta {
    pub plist_sha256: String,
    pub png_sha256: String,
    pub relative_dir: String,
    pub stem: String,
    pub base_stem: String,
    pub tier: String,
    /// Pixel-hash algorithm version used for this sheet's sprite entries.
    #[serde(default)]
    pub content_hash_version: u32,
    /// Number of sprite hashes written for this sheet (0 means rebuild required).
    #[serde(default)]
    pub sprite_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IndexedSpriteMeta {
    pub sheet_key: String,
    pub sprite_name: String,
    pub tier: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone)]
pub struct SpriteIndexHit {
    pub sheet_key: String,
    pub sprite_name: String,
    pub tier: PortSourceGraphicsTier,
    pub relative_dir: PathBuf,
    pub base_stem: String,
    pub source_stem: String,
}

#[derive(Debug, Clone)]
pub struct ExtractedIndexedSprite {
    pub image: RgbaImage,
    pub sprite_offset: (f32, f32),
    pub sprite_size: (u32, u32),
    pub sprite_source_size: (u32, u32),
    pub frame_key: String,
}

#[derive(Debug, Clone)]
pub struct SheetProbeHint {
    pub relative_dir: PathBuf,
    pub stem: String,
}

fn index_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub fn index_path(layout: &GameFilesLayout) -> PathBuf {
    layout.root.join(INDEX_FILE_NAME)
}

pub fn sheet_key(relative_dir: &Path, stem: &str) -> String {
    let rel = relative_dir
        .to_string_lossy()
        .replace('\\', "/")
        .trim_matches('/')
        .to_string();
    if rel.is_empty() {
        stem.to_string()
    } else {
        format!("{rel}/{stem}")
    }
}

pub fn base_stem_from_stem(stem: &str) -> String {
    if let Some(base) = stem.strip_suffix("-uhd") {
        return base.to_string();
    }
    if let Some(base) = stem.strip_suffix("-hd") {
        return base.to_string();
    }
    stem.to_string()
}

pub fn stem_for_tier(base: &str, tier: PortSourceGraphicsTier) -> String {
    match tier {
        PortSourceGraphicsTier::Low => base.to_string(),
        PortSourceGraphicsTier::Hd => format!("{base}-hd"),
        PortSourceGraphicsTier::Uhd => format!("{base}-uhd"),
    }
}

pub fn target_tier_from_graphics(target: UpscalerTargetGraphics) -> PortSourceGraphicsTier {
    match target {
        UpscalerTargetGraphics::Hd => PortSourceGraphicsTier::Hd,
        UpscalerTargetGraphics::Uhd => PortSourceGraphicsTier::Uhd,
    }
}

pub fn tier_label(tier: PortSourceGraphicsTier) -> &'static str {
    match tier {
        PortSourceGraphicsTier::Low => "low",
        PortSourceGraphicsTier::Hd => "hd",
        PortSourceGraphicsTier::Uhd => "uhd",
    }
}

fn parse_tier_label(label: &str) -> PortSourceGraphicsTier {
    match label {
        "hd" => PortSourceGraphicsTier::Hd,
        "uhd" => PortSourceGraphicsTier::Uhd,
        _ => PortSourceGraphicsTier::Low,
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{digest:x}")
}

fn sha256_file(path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(path).map_err(|err| {
        AppError::IoError(format!(
            "failed to read `{}` for hashing: {err}",
            path.to_string_lossy()
        ))
    })?;
    Ok(sha256_hex(&bytes))
}

/// SHA-256 of merger-style edge-trimmed sprite image data.
/// Trims fully transparent rows/columns first (same as merge offset trim), then hashes
/// `width_le || height_le || rgba_bytes` of the reduced canvas.
pub fn hash_trimmed_rgba(image: &RgbaImage) -> String {
    hash_rgba_canvas(&trim_transparent_rgba(image))
}

fn hash_rgba_canvas(image: &RgbaImage) -> String {
    let mut payload = Vec::with_capacity(8 + image.as_raw().len());
    payload.extend_from_slice(&image.width().to_le_bytes());
    payload.extend_from_slice(&image.height().to_le_bytes());
    payload.extend_from_slice(image.as_raw());
    sha256_hex(&payload)
}

/// One sprite preprocessed for in-memory exact/loose matching (sheet IO already done).
#[derive(Clone, Debug)]
pub struct PreparedFrame {
    pub trimmed: RgbaImage,
    pub hash: String,
    pub dhash: u64,
}

/// All frames from one sheet, hashed/dhashed once for batch matching.
#[derive(Clone, Debug, Default)]
pub struct PreparedSheetBatch {
    pub frames: BTreeMap<String, PreparedFrame>,
}

impl PreparedSheetBatch {
    pub fn get(&self, name: &str) -> Option<&PreparedFrame> {
        self.frames.get(name)
    }
}

/// Trim + hash + dHash for a single sprite image.
pub fn prepare_frame(image: &RgbaImage) -> PreparedFrame {
    let trimmed = trim_transparent_rgba(image);
    let hash = hash_rgba_canvas(&trimmed);
    let dhash = dhash64_of_canvas(&trimmed);
    PreparedFrame {
        trimmed,
        hash,
        dhash,
    }
}

/// Read a sheet once and preprocess every frame for exact/loose matching.
pub fn prepare_sheet_batch(
    plist_path: &Path,
    png_path: &Path,
) -> Result<PreparedSheetBatch, AppError> {
    let raw = extract_all_frames_raw(plist_path, png_path)?;
    Ok(prepare_batch_from_owned(raw))
}

/// Preprocess an in-memory name→image map (e.g. splitter output) without sheet IO.
pub fn prepare_batch_from_images(images: &BTreeMap<String, RgbaImage>) -> PreparedSheetBatch {
    let mut frames = BTreeMap::new();
    for (name, image) in images {
        frames.insert(name.clone(), prepare_frame(image));
    }
    PreparedSheetBatch { frames }
}

/// Preprocess owned frames (consumes the map).
pub fn prepare_batch_from_owned(images: BTreeMap<String, RgbaImage>) -> PreparedSheetBatch {
    let mut frames = BTreeMap::new();
    for (name, image) in images {
        frames.insert(name, prepare_frame(&image));
    }
    PreparedSheetBatch { frames }
}

/// Crop from atlas (no offset-bake) → trim blank edges → hash.
pub fn hash_frame_from_atlas(
    atlas: &RgbaImage,
    frame_dict: &Dictionary,
) -> Result<String, AppError> {
    let raw = extract_frame_rgba_raw(atlas, frame_dict)?;
    Ok(hash_trimmed_rgba(&raw))
}

/// Hash every frame in a sheet pair using raw atlas crops + edge trim.
pub fn hash_all_frames_in_sheet(
    plist_path: &Path,
    png_path: &Path,
) -> Result<BTreeMap<String, String>, AppError> {
    let frames = extract_all_frames_raw(plist_path, png_path)?;
    let mut out = BTreeMap::new();
    for (name, image) in frames {
        out.insert(name, hash_trimmed_rgba(&image));
    }
    Ok(out)
}

/// Raw atlas crops (no offset-bake) for every frame in a sheet.
pub fn extract_all_frames_raw(
    plist_path: &Path,
    png_path: &Path,
) -> Result<BTreeMap<String, RgbaImage>, AppError> {
    let (_root, atlas, frames) = read_sheet_frames(plist_path, png_path)?;
    let mut out = BTreeMap::new();
    for (name, frame_val) in frames.iter() {
        let Some(frame_dict) = frame_val.as_dictionary() else {
            continue;
        };
        if let Ok(image) = extract_frame_rgba_raw(&atlas, frame_dict) {
            out.insert(name.clone(), image);
        }
    }
    Ok(out)
}

/// Difference hash (64-bit) of a trimmed sprite — used for loose matching.
pub fn dhash64_trimmed(image: &RgbaImage) -> u64 {
    dhash64_of_canvas(&trim_transparent_rgba(image))
}

fn dhash64_of_canvas(trimmed: &RgbaImage) -> u64 {
    let small = image::imageops::resize(trimmed, 9, 8, FilterType::Triangle);
    let mut bits = 0u64;
    let mut bit_i = 0u32;
    for y in 0..8 {
        for x in 0..8 {
            let left = alpha_luma(small.get_pixel(x, y));
            let right = alpha_luma(small.get_pixel(x + 1, y));
            if left > right {
                bits |= 1u64 << bit_i;
            }
            bit_i += 1;
        }
    }
    bits
}

fn alpha_luma(p: &Rgba<u8>) -> f32 {
    let a = f32::from(p.0[3]) / 255.0;
    ((f32::from(p.0[0]) + f32::from(p.0[1]) + f32::from(p.0[2])) / 3.0) * a
}

/// Soft cap so huge UHD frames stay cheap during name-agnostic batch scans.
const SIMILARITY_MAX_SIDE: u32 = 512;
/// dHash Hamming distance above this skips the expensive IoU/SSIM compare.
const LOOSE_DHASH_PREFILTER_MAX: u32 = 14;
const LOOSE_ASPECT_MAX: f32 = 0.18;
const LOOSE_AREA_MIN: f32 = 0.70;
const LOOSE_ALPHA_OPAQUE: u8 = 16;
const LOOSE_AMBIGUOUS_SCORE_GAP: f32 = 0.015;
const LOOSE_SSIM_WINDOW: u32 = 8;
const SSIM_C1: f32 = (0.01 * 255.0) * (0.01 * 255.0);
const SSIM_C2: f32 = (0.03 * 255.0) * (0.03 * 255.0);

#[derive(Clone, Copy, Debug)]
struct LooseCompareScore {
    iou: f32,
    ssim: f32,
}

impl LooseCompareScore {
    fn composite(self) -> f32 {
        0.45 * self.iou + 0.55 * self.ssim
    }
}

#[derive(Clone, Copy, Debug)]
struct LooseBand {
    min_iou: f32,
    min_ssim: f32,
}

/// Pixel-size scale relative to UHD for loose-match breakpoints.
fn tier_size_scale(tier: PortSourceGraphicsTier) -> f32 {
    match tier {
        PortSourceGraphicsTier::Uhd => 1.0,
        PortSourceGraphicsTier::Hd => 0.5,
        PortSourceGraphicsTier::Low => 0.25,
    }
}

/// Longest trimmed side — size bands use “at least one dimension”.
fn longest_side_px(w: f32, h: f32) -> f32 {
    w.max(h).max(1.0)
}

/// `longest_side_px` is max(width, height) of a sprite (tier-scaled vs UHD 100).
fn loose_band_for_size(longest_side_px: f32, tier: PortSourceGraphicsTier) -> LooseBand {
    let uhd_eq = longest_side_px / tier_size_scale(tier);
    if uhd_eq <= 100.0 {
        LooseBand {
            min_iou: 0.80,
            min_ssim: 0.78,
        }
    } else {
        // Any sprite with a side above 100px UHD-eq uses the tighter large band.
        LooseBand {
            min_iou: 0.94,
            min_ssim: 0.92,
        }
    }
}

fn target_compare_dims(ta: &RgbaImage, tb: &RgbaImage) -> (u32, u32) {
    let (mut w, mut h) =
        if ta.width().saturating_mul(ta.height()) <= tb.width().saturating_mul(tb.height()) {
            (ta.width().max(1), ta.height().max(1))
        } else {
            (tb.width().max(1), tb.height().max(1))
        };
    let longest = w.max(h);
    if longest > SIMILARITY_MAX_SIDE {
        let s = SIMILARITY_MAX_SIDE as f32 / longest as f32;
        w = ((w as f32) * s).round().max(1.0) as u32;
        h = ((h as f32) * s).round().max(1.0) as u32;
    }
    (w, h)
}

fn maybe_resize(image: &RgbaImage, w: u32, h: u32) -> Option<RgbaImage> {
    if image.width() == w && image.height() == h {
        None
    } else {
        Some(image::imageops::resize(image, w, h, FilterType::Triangle))
    }
}

fn align_pair_for_compare<'a>(
    ta: &'a RgbaImage,
    tb: &'a RgbaImage,
) -> Option<(
    &'a RgbaImage,
    &'a RgbaImage,
    Option<RgbaImage>,
    Option<RgbaImage>,
)> {
    if ta.width() == 0 || ta.height() == 0 || tb.width() == 0 || tb.height() == 0 {
        return None;
    }
    let (tw, th) = target_compare_dims(ta, tb);
    Some((ta, tb, maybe_resize(ta, tw, th), maybe_resize(tb, tw, th)))
}

fn aligned_refs<'a>(orig: &'a RgbaImage, resized: &'a Option<RgbaImage>) -> &'a RgbaImage {
    resized.as_ref().unwrap_or(orig)
}

fn alpha_mask_iou(a: &RgbaImage, b: &RgbaImage) -> f32 {
    let mut inter = 0u32;
    let mut union = 0u32;
    for (pa, pb) in a.pixels().zip(b.pixels()) {
        let oa = pa.0[3] > LOOSE_ALPHA_OPAQUE;
        let ob = pb.0[3] > LOOSE_ALPHA_OPAQUE;
        if oa && ob {
            inter += 1;
        }
        if oa || ob {
            union += 1;
        }
    }
    if union == 0 {
        return 0.0;
    }
    inter as f32 / union as f32
}

fn ssim_luma_alpha(a: &RgbaImage, b: &RgbaImage) -> f32 {
    let w = a.width();
    let h = a.height();
    if w == 0 || h == 0 || w != b.width() || h != b.height() {
        return 0.0;
    }
    let win = LOOSE_SSIM_WINDOW.min(w).min(h).max(1);
    if w < win || h < win {
        return ssim_window(a, b, 0, 0, w, h).max(0.0);
    }
    let step = (win / 2).max(1);
    let max_x = w - win;
    let max_y = h - win;
    let mut sum = 0.0f32;
    let mut n = 0u32;
    let mut y = 0u32;
    loop {
        let mut x = 0u32;
        loop {
            let s = ssim_window(a, b, x, y, win, win);
            if s >= 0.0 {
                sum += s;
                n += 1;
            }
            if x >= max_x {
                break;
            }
            x = (x + step).min(max_x);
        }
        if y >= max_y {
            break;
        }
        y = (y + step).min(max_y);
    }
    if n == 0 {
        return ssim_window(a, b, 0, 0, w, h).max(0.0);
    }
    sum / n as f32
}

fn ssim_window(a: &RgbaImage, b: &RgbaImage, ox: u32, oy: u32, ww: u32, hh: u32) -> f32 {
    let mut wsum = 0.0f32;
    let mut mean_a = 0.0f32;
    let mut mean_b = 0.0f32;
    for y in oy..oy + hh {
        for x in ox..ox + ww {
            let pa = a.get_pixel(x, y);
            let pb = b.get_pixel(x, y);
            let wa = (f32::from(pa.0[3]) + f32::from(pb.0[3])) * 0.5 / 255.0;
            if wa < 0.02 {
                continue;
            }
            let la = alpha_luma(pa);
            let lb = alpha_luma(pb);
            wsum += wa;
            mean_a += la * wa;
            mean_b += lb * wa;
        }
    }
    if wsum < 0.5 {
        return -1.0;
    }
    mean_a /= wsum;
    mean_b /= wsum;

    let mut var_a = 0.0f32;
    let mut var_b = 0.0f32;
    let mut cov = 0.0f32;
    for y in oy..oy + hh {
        for x in ox..ox + ww {
            let pa = a.get_pixel(x, y);
            let pb = b.get_pixel(x, y);
            let wa = (f32::from(pa.0[3]) + f32::from(pb.0[3])) * 0.5 / 255.0;
            if wa < 0.02 {
                continue;
            }
            let da = alpha_luma(pa) - mean_a;
            let db = alpha_luma(pb) - mean_b;
            var_a += da * da * wa;
            var_b += db * db * wa;
            cov += da * db * wa;
        }
    }
    var_a /= wsum;
    var_b /= wsum;
    cov /= wsum;

    let num = (2.0 * mean_a * mean_b + SSIM_C1) * (2.0 * cov + SSIM_C2);
    let den = (mean_a * mean_a + mean_b * mean_b + SSIM_C1) * (var_a + var_b + SSIM_C2);
    if den <= f32::EPSILON {
        return 0.0;
    }
    (num / den).clamp(0.0, 1.0)
}

/// Loose match: same silhouette + structure despite re-export / trim drift.
/// Name-agnostic — callers compare images only.
pub fn sprites_match_loose(a: &RgbaImage, b: &RgbaImage) -> bool {
    sprites_match_loose_prepared(
        &prepare_frame(a),
        &prepare_frame(b),
        PortSourceGraphicsTier::Uhd,
    )
}

/// Loose match using precomputed trim/hash/dHash from [`prepare_frame`] / sheet batching.
pub fn sprites_match_loose_prepared(
    a: &PreparedFrame,
    b: &PreparedFrame,
    tier: PortSourceGraphicsTier,
) -> bool {
    loose_match_score(a, b, tier).is_some()
}

fn loose_match_score(
    a: &PreparedFrame,
    b: &PreparedFrame,
    tier: PortSourceGraphicsTier,
) -> Option<LooseCompareScore> {
    let aw = a.trimmed.width().max(1) as f32;
    let ah = a.trimmed.height().max(1) as f32;
    let bw = b.trimmed.width().max(1) as f32;
    let bh = b.trimmed.height().max(1) as f32;
    // If either sprite has a side above the tier-scaled 100px, use the large band.
    let longest_px = longest_side_px(aw, ah).max(longest_side_px(bw, bh));
    let band = loose_band_for_size(longest_px, tier);

    let aspect_a = aw / ah;
    let aspect_b = bw / bh;
    let aspect_denom = aspect_a.max(aspect_b).max(0.01);
    if (aspect_a - aspect_b).abs() / aspect_denom > LOOSE_ASPECT_MAX {
        return None;
    }
    let area_a = aw * ah;
    let area_b = bw * bh;
    let area_ratio = area_a.min(area_b) / area_a.max(area_b).max(1.0);
    if area_ratio < LOOSE_AREA_MIN {
        return None;
    }

    let dist = (a.dhash ^ b.dhash).count_ones();
    if dist > LOOSE_DHASH_PREFILTER_MAX {
        return None;
    }

    let (oa, ob, ra, rb) = align_pair_for_compare(&a.trimmed, &b.trimmed)?;
    let aa = aligned_refs(oa, &ra);
    let bb = aligned_refs(ob, &rb);
    let iou = alpha_mask_iou(aa, bb);
    if iou < band.min_iou {
        return None;
    }
    let ssim = ssim_luma_alpha(aa, bb);
    if ssim < band.min_ssim {
        return None;
    }
    Some(LooseCompareScore { iou, ssim })
}

/// Best name-agnostic loose match in a preprocessed sheet batch, if unambiguous.
pub fn find_best_loose_match_in_batch<'a>(
    needle: &PreparedFrame,
    haystack: &'a PreparedSheetBatch,
    tier: PortSourceGraphicsTier,
) -> Option<&'a str> {
    let mut best: Option<(&'a str, f32)> = None;
    let mut second = 0.0f32;

    for (name, frame) in &haystack.frames {
        if frame.hash == needle.hash {
            continue;
        }
        let Some(score) = loose_match_score(needle, frame, tier) else {
            continue;
        };
        let composite = score.composite();
        match best {
            None => best = Some((name.as_str(), composite)),
            Some((_, best_score)) => {
                if composite > best_score + 0.0005 {
                    second = second.max(best_score);
                    best = Some((name.as_str(), composite));
                } else {
                    second = second.max(composite);
                }
            }
        }
    }

    let (name, best_score) = best?;
    if best_score - second < LOOSE_AMBIGUOUS_SCORE_GAP && second > 0.0 {
        return None;
    }
    Some(name)
}

/// Find a frame in the batch with an exact trimmed-pixel hash (any frame name).
pub fn find_hash_in_batch<'a>(haystack: &'a PreparedSheetBatch, hash: &str) -> Option<&'a str> {
    haystack
        .frames
        .iter()
        .find(|(_, frame)| frame.hash == hash)
        .map(|(name, _)| name.as_str())
}

pub fn load_index(layout: &GameFilesLayout) -> Result<SpriteIndexFile, AppError> {
    let path = index_path(layout);
    if !path.exists() {
        return Ok(SpriteIndexFile {
            version: INDEX_VERSION,
            indexed_sheets: BTreeMap::new(),
            sprites: BTreeMap::new(),
        });
    }
    let text = fs::read_to_string(&path).map_err(|err| {
        AppError::IoError(format!(
            "failed to read sprite index `{}`: {err}",
            path.to_string_lossy()
        ))
    })?;
    let mut file: SpriteIndexFile = serde_json::from_str(&text).map_err(|err| {
        AppError::ParseError(format!(
            "failed to parse sprite index `{}`: {err}",
            path.to_string_lossy()
        ))
    })?;
    // Algorithm bump: drop stale hashes so the next probe/index rebuilds cleanly.
    if file.version != INDEX_VERSION {
        file.version = INDEX_VERSION;
        file.sprites.clear();
        file.indexed_sheets.clear();
    }
    Ok(file)
}

pub fn save_index(layout: &GameFilesLayout, file: &SpriteIndexFile) -> Result<(), AppError> {
    fs::create_dir_all(&layout.root)?;
    let path = index_path(layout);
    let json = serde_json::to_string_pretty(file)
        .map_err(|err| AppError::IoError(format!("failed to serialize sprite index: {err}")))?;
    fs::write(&path, json).map_err(|err| {
        AppError::IoError(format!(
            "failed to write sprite index `{}`: {err}",
            path.to_string_lossy()
        ))
    })?;
    Ok(())
}

fn with_index_mut<R>(
    layout: &GameFilesLayout,
    f: impl FnOnce(&mut SpriteIndexFile) -> Result<(R, bool), AppError>,
) -> Result<R, AppError> {
    let _guard = index_lock()
        .lock()
        .map_err(|_| AppError::InvalidOperation("sprite index lock poisoned"))?;
    let mut file = load_index(layout)?;
    let (result, dirty) = f(&mut file)?;
    if dirty {
        file.version = INDEX_VERSION;
        save_index(layout, &file)?;
    }
    Ok(result)
}

fn parse_numbers(value: &str) -> Result<Vec<f32>, AppError> {
    let mut cleaned = String::with_capacity(value.len());
    for ch in value.chars() {
        if matches!(ch, '{' | '}') {
            continue;
        }
        cleaned.push(ch);
    }
    let mut numbers = Vec::new();
    for part in cleaned.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parsed = trimmed
            .parse::<f32>()
            .map_err(|_| AppError::ParseError(format!("invalid numeric value `{trimmed}`")))?;
        numbers.push(parsed);
    }
    Ok(numbers)
}

fn parse_texture_rect(value: &str) -> Result<(u32, u32, u32, u32), AppError> {
    let numbers = parse_numbers(value)?;
    if numbers.len() != 4 {
        return Err(AppError::ParseError(format!(
            "textureRect expected 4 numbers, got {} in `{value}`",
            numbers.len()
        )));
    }
    Ok((
        numbers[0].ceil().max(0.0) as u32,
        numbers[1].ceil().max(0.0) as u32,
        numbers[2].floor().max(1.0) as u32,
        numbers[3].floor().max(1.0) as u32,
    ))
}

fn parse_pair_u32(value: &str) -> Result<(u32, u32), AppError> {
    let numbers = parse_numbers(value)?;
    if numbers.len() != 2 {
        return Err(AppError::ParseError(format!(
            "pair expected 2 numbers, got {} in `{value}`",
            numbers.len()
        )));
    }
    Ok((
        numbers[0].floor().max(0.0) as u32,
        numbers[1].floor().max(0.0) as u32,
    ))
}

fn parse_pair_signed(value: &str) -> Result<(f32, f32), AppError> {
    let numbers = parse_numbers(value)?;
    if numbers.len() != 2 {
        return Err(AppError::ParseError(format!(
            "pair expected 2 numbers, got {} in `{value}`",
            numbers.len()
        )));
    }
    Ok((numbers[0], numbers[1]))
}

fn dict_string<'a>(dict: &'a Dictionary, key: &str) -> Result<&'a str, AppError> {
    dict.get(key)
        .and_then(Value::as_string)
        .ok_or_else(|| AppError::ParseError(format!("missing or invalid `{key}`")))
}

fn dict_bool(dict: &Dictionary, key: &str) -> bool {
    dict.get(key).and_then(Value::as_boolean).unwrap_or(false)
}

/// Atlas crop + optional rotate270; does **not** bake spriteOffset.
pub fn extract_frame_rgba_raw(
    source: &RgbaImage,
    frame_dict: &Dictionary,
) -> Result<RgbaImage, AppError> {
    let texture_rect_raw = dict_string(frame_dict, "textureRect")?;
    let sprite_size_raw = dict_string(frame_dict, "spriteSize")?;
    let texture_rotated = dict_bool(frame_dict, "textureRotated");
    let rect = parse_texture_rect(texture_rect_raw)?;
    let sprite_size = parse_pair_u32(sprite_size_raw)?;

    let crop_width = sprite_size.0.max(1);
    let crop_height = sprite_size.1.max(1);
    let (x, y, width, height) = if texture_rotated {
        (rect.0, rect.1, crop_height, crop_width)
    } else {
        (rect.0, rect.1, crop_width, crop_height)
    };

    let img_w = source.width();
    let img_h = source.height();
    if x >= img_w || y >= img_h {
        return Ok(RgbaImage::from_pixel(1, 1, image::Rgba([0, 0, 0, 0])));
    }
    let safe_width = width.min(img_w.saturating_sub(x)).max(1);
    let safe_height = height.min(img_h.saturating_sub(y)).max(1);
    let raw_crop = image::imageops::crop_imm(source, x, y, safe_width, safe_height).to_image();
    let sprite = if texture_rotated {
        image::imageops::rotate270(&raw_crop)
    } else {
        raw_crop
    };
    Ok(sprite)
}

fn read_sheet_frames(
    plist_path: &Path,
    png_path: &Path,
) -> Result<(Value, RgbaImage, Dictionary), AppError> {
    let mut plist_root = Value::from_file(plist_path).map_err(|err| {
        AppError::ParseError(format!(
            "failed to read plist `{}`: {err}",
            plist_path.to_string_lossy()
        ))
    })?;
    normalize_plist_frames_to_format3(&mut plist_root);
    let atlas = image::open(png_path)
        .map_err(|err| {
            AppError::IoError(format!("failed to open `{}`: {err}", png_path.display()))
        })?
        .to_rgba8();
    let frames = plist_root
        .as_dictionary()
        .and_then(|d| d.get("frames"))
        .and_then(Value::as_dictionary)
        .cloned()
        .ok_or_else(|| AppError::ParseError("plist missing `frames` dictionary".to_string()))?;
    Ok((plist_root, atlas, frames))
}

fn relative_dir_string(relative_dir: &Path) -> String {
    relative_dir
        .to_string_lossy()
        .replace('\\', "/")
        .trim_matches('/')
        .to_string()
}

/// Index one sheet pair into the durable JSON (skip if plist/png hashes unchanged).
pub fn index_sheet_pair(
    layout: &GameFilesLayout,
    relative_dir: &Path,
    stem: &str,
    plist_path: &Path,
    png_path: &Path,
) -> Result<usize, AppError> {
    index_sheet_pair_inner(layout, relative_dir, stem, plist_path, png_path, false)
}

fn index_sheet_pair_inner(
    layout: &GameFilesLayout,
    relative_dir: &Path,
    stem: &str,
    plist_path: &Path,
    png_path: &Path,
    force: bool,
) -> Result<usize, AppError> {
    ensure_no_parent_dir_components(relative_dir)?;
    if !plist_path.is_file() || !png_path.is_file() {
        return Ok(0);
    }

    let key = sheet_key(relative_dir, stem);
    let plist_sha = sha256_file(plist_path)?;
    let png_sha = sha256_file(png_path)?;
    let tier = port_source_tier_from_stem(stem);
    let base = base_stem_from_stem(stem);
    let rel_str = relative_dir_string(relative_dir);

    with_index_mut(layout, |file| {
        if let Some(existing) = file.indexed_sheets.get(&key) {
            let up_to_date = !force
                && existing.plist_sha256 == plist_sha
                && existing.png_sha256 == png_sha
                && existing.content_hash_version == CONTENT_HASH_VERSION
                && existing.sprite_count > 0;
            if up_to_date {
                return Ok((0, false));
            }
            file.sprites.retain(|_, meta| meta.sheet_key != key);
        }

        let (_root, atlas, frames) = read_sheet_frames(plist_path, png_path)?;
        let mut added = 0usize;
        for (sprite_name, frame_val) in frames.iter() {
            let Some(frame_dict) = frame_val.as_dictionary() else {
                continue;
            };
            let Ok(raw) = extract_frame_rgba_raw(&atlas, frame_dict) else {
                continue;
            };
            let trimmed = trim_transparent_rgba(&raw);
            let hash = hash_trimmed_rgba(&raw);
            if let Some(existing) = file.sprites.get(&hash) {
                if existing.sheet_key != key || existing.sprite_name != *sprite_name {
                    continue;
                }
            }
            file.sprites.insert(
                hash,
                IndexedSpriteMeta {
                    sheet_key: key.clone(),
                    sprite_name: sprite_name.clone(),
                    tier: tier_label(tier).to_string(),
                    width: trimmed.width(),
                    height: trimmed.height(),
                },
            );
            added += 1;
        }

        file.indexed_sheets.insert(
            key,
            IndexedSheetMeta {
                plist_sha256: plist_sha,
                png_sha256: png_sha,
                relative_dir: rel_str,
                stem: stem.to_string(),
                base_stem: base,
                tier: tier_label(tier).to_string(),
                content_hash_version: CONTENT_HASH_VERSION,
                sprite_count: added as u32,
            },
        );
        Ok((added, true))
    })
}

/// Index many sheets with one JSON load/save. Used for 2.0 GS02 → modern `icons/{id}` probing.
pub fn index_sheet_pairs_batch(
    layout: &GameFilesLayout,
    sheets: &[(PathBuf, String, PathBuf, PathBuf)],
) -> Result<usize, AppError> {
    if sheets.is_empty() {
        return Ok(0);
    }
    let prepared: Vec<(String, String, String, PortSourceGraphicsTier, String, PathBuf, PathBuf, PathBuf, String)> =
        {
            let mut out = Vec::with_capacity(sheets.len());
            for (relative_dir, stem, plist_path, png_path) in sheets {
                ensure_no_parent_dir_components(relative_dir)?;
                if !plist_path.is_file() || !png_path.is_file() {
                    continue;
                }
                let plist_sha = sha256_file(plist_path)?;
                let png_sha = sha256_file(png_path)?;
                out.push((
                    sheet_key(relative_dir, stem),
                    plist_sha,
                    png_sha,
                    port_source_tier_from_stem(stem),
                    base_stem_from_stem(stem),
                    relative_dir.clone(),
                    plist_path.clone(),
                    png_path.clone(),
                    stem.clone(),
                ));
            }
            out
        };

    with_index_mut(layout, |file| {
        let mut added_total = 0usize;
        let mut dirty = false;
        for (key, plist_sha, png_sha, tier, base, relative_dir, plist_path, png_path, stem) in
            &prepared
        {
            if let Some(existing) = file.indexed_sheets.get(key) {
                let up_to_date = existing.plist_sha256 == *plist_sha
                    && existing.png_sha256 == *png_sha
                    && existing.content_hash_version == CONTENT_HASH_VERSION
                    && existing.sprite_count > 0;
                if up_to_date {
                    continue;
                }
                file.sprites.retain(|_, meta| &meta.sheet_key != key);
            }

            let (_root, atlas, frames) = read_sheet_frames(plist_path, png_path)?;
            let mut added = 0usize;
            for (sprite_name, frame_val) in frames.iter() {
                let Some(frame_dict) = frame_val.as_dictionary() else {
                    continue;
                };
                let Ok(raw) = extract_frame_rgba_raw(&atlas, frame_dict) else {
                    continue;
                };
                let trimmed = trim_transparent_rgba(&raw);
                let hash = hash_trimmed_rgba(&raw);
                if let Some(existing) = file.sprites.get(&hash) {
                    if existing.sheet_key != *key || existing.sprite_name != *sprite_name {
                        continue;
                    }
                }
                file.sprites.insert(
                    hash,
                    IndexedSpriteMeta {
                        sheet_key: key.clone(),
                        sprite_name: sprite_name.clone(),
                        tier: tier_label(*tier).to_string(),
                        width: trimmed.width(),
                        height: trimmed.height(),
                    },
                );
                added += 1;
            }
            file.indexed_sheets.insert(
                key.clone(),
                IndexedSheetMeta {
                    plist_sha256: plist_sha.clone(),
                    png_sha256: png_sha.clone(),
                    relative_dir: relative_dir_string(relative_dir),
                    stem: stem.clone(),
                    base_stem: base.clone(),
                    tier: tier_label(*tier).to_string(),
                    content_hash_version: CONTENT_HASH_VERSION,
                    sprite_count: added as u32,
                },
            );
            added_total = added_total.saturating_add(added);
            dirty = true;
        }
        Ok((added_total, dirty))
    })
}

/// Best-effort index; never fails the caller.
pub fn try_index_sheet_pair(
    layout: &GameFilesLayout,
    relative_dir: &Path,
    stem: &str,
    plist_path: &Path,
    png_path: &Path,
) {
    let _ = index_sheet_pair(layout, relative_dir, stem, plist_path, png_path);
}

pub fn lookup_hash(
    layout: &GameFilesLayout,
    hash: &str,
) -> Result<Option<SpriteIndexHit>, AppError> {
    lookup_hash_matching(layout, hash, None)
}

/// Load a snapshot of the on-disk index under the index lock (one IO for many lookups).
pub fn load_index_snapshot(layout: &GameFilesLayout) -> Result<SpriteIndexFile, AppError> {
    let _guard = index_lock()
        .lock()
        .map_err(|_| AppError::InvalidOperation("sprite index lock poisoned"))?;
    load_index(layout)
}

/// In-memory hash lookup against an already-loaded index snapshot.
pub fn lookup_hash_in_index(
    file: &SpriteIndexFile,
    hash: &str,
    required_tier: Option<PortSourceGraphicsTier>,
) -> Option<SpriteIndexHit> {
    let meta = file.sprites.get(hash)?;
    // Only accept hits from same-algorithm entries.
    let sheet = file.indexed_sheets.get(&meta.sheet_key)?;
    if sheet.content_hash_version != CONTENT_HASH_VERSION {
        return None;
    }
    let tier = parse_tier_label(&meta.tier);
    if let Some(required) = required_tier {
        if tier != required {
            return None;
        }
    }
    Some(SpriteIndexHit {
        sheet_key: meta.sheet_key.clone(),
        sprite_name: meta.sprite_name.clone(),
        tier,
        relative_dir: PathBuf::from(&sheet.relative_dir),
        base_stem: sheet.base_stem.clone(),
        source_stem: sheet.stem.clone(),
    })
}

/// Look up a trimmed-sprite hash, optionally requiring the indexed entry to be the same graphics tier.
pub fn lookup_hash_matching(
    layout: &GameFilesLayout,
    hash: &str,
    required_tier: Option<PortSourceGraphicsTier>,
) -> Result<Option<SpriteIndexHit>, AppError> {
    let file = load_index_snapshot(layout)?;
    Ok(lookup_hash_in_index(&file, hash, required_tier))
}

/// Look up the first matching hash among candidates (e.g. atlas-trim and baked-trim).
pub fn lookup_hash_any(
    layout: &GameFilesLayout,
    hashes: &[String],
    required_tier: Option<PortSourceGraphicsTier>,
) -> Result<Option<SpriteIndexHit>, AppError> {
    let file = load_index_snapshot(layout)?;
    Ok(lookup_hash_any_in_index(&file, hashes, required_tier))
}

/// In-memory variant of [`lookup_hash_any`].
pub fn lookup_hash_any_in_index(
    file: &SpriteIndexFile,
    hashes: &[String],
    required_tier: Option<PortSourceGraphicsTier>,
) -> Option<SpriteIndexHit> {
    for hash in hashes {
        if let Some(hit) = lookup_hash_in_index(file, hash, required_tier) {
            return Some(hit);
        }
    }
    None
}

/// SHA-256 of a file on disk (hex), for diagnostics / identity checks.
pub fn file_sha256_hex(path: &Path) -> Result<String, AppError> {
    sha256_file(path)
}

/// Look up indexed sheet meta for this stem/tier (best-effort).
pub fn find_indexed_sheet_meta(
    layout: &GameFilesLayout,
    relative_dir: &Path,
    stem: &str,
) -> Result<Option<IndexedSheetMeta>, AppError> {
    let key = sheet_key(relative_dir, stem);
    let pack_tier = port_source_tier_from_stem(stem);
    let pack_base = base_stem_from_stem(stem);
    let _guard = index_lock()
        .lock()
        .map_err(|_| AppError::InvalidOperation("sprite index lock poisoned"))?;
    let file = load_index(layout)?;
    if let Some(meta) = file.indexed_sheets.get(&key) {
        return Ok(Some(meta.clone()));
    }
    Ok(file
        .indexed_sheets
        .values()
        .find(|meta| {
            meta.content_hash_version == CONTENT_HASH_VERSION
                && meta.base_stem == pack_base
                && parse_tier_label(&meta.tier) == pack_tier
        })
        .cloned())
}

/// If this pack sheet's plist+png bytes match an indexed vanilla sheet at the same tier,
/// return a hit template (sprite_name empty — caller fills per frame).
pub fn find_byte_identical_sheet(
    layout: &GameFilesLayout,
    relative_dir: &Path,
    stem: &str,
    plist_path: &Path,
    png_path: &Path,
) -> Result<Option<SpriteIndexHit>, AppError> {
    let plist_sha = sha256_file(plist_path)?;
    let png_sha = sha256_file(png_path)?;
    let pack_tier = port_source_tier_from_stem(stem);
    let pack_base = base_stem_from_stem(stem);

    let _guard = index_lock()
        .lock()
        .map_err(|_| AppError::InvalidOperation("sprite index lock poisoned"))?;
    let file = load_index(layout)?;
    for meta in file.indexed_sheets.values() {
        if meta.content_hash_version != CONTENT_HASH_VERSION {
            continue;
        }
        if meta.plist_sha256 != plist_sha || meta.png_sha256 != png_sha {
            continue;
        }
        if parse_tier_label(&meta.tier) != pack_tier {
            continue;
        }
        if meta.base_stem != pack_base {
            continue;
        }
        return Ok(Some(SpriteIndexHit {
            sheet_key: sheet_key(Path::new(&meta.relative_dir), &meta.stem),
            sprite_name: String::new(),
            tier: pack_tier,
            relative_dir: PathBuf::from(&meta.relative_dir),
            base_stem: meta.base_stem.clone(),
            source_stem: meta.stem.clone(),
        }));
    }
    // Also try the exact sheet key even when relative_dir differs (pack vs Resources).
    let key = sheet_key(relative_dir, stem);
    if let Some(meta) = file.indexed_sheets.get(&key) {
        if meta.content_hash_version == CONTENT_HASH_VERSION
            && meta.plist_sha256 == plist_sha
            && meta.png_sha256 == png_sha
        {
            return Ok(Some(SpriteIndexHit {
                sheet_key: key,
                sprite_name: String::new(),
                tier: parse_tier_label(&meta.tier),
                relative_dir: PathBuf::from(&meta.relative_dir),
                base_stem: meta.base_stem.clone(),
                source_stem: meta.stem.clone(),
            }));
        }
    }
    Ok(None)
}

pub fn resolve_target_sheet_paths(
    layout: &GameFilesLayout,
    hit: &SpriteIndexHit,
    target_tier: PortSourceGraphicsTier,
) -> Result<(PathBuf, PathBuf, String), AppError> {
    let target_stem = stem_for_tier(&hit.base_stem, target_tier);
    if let Some(pair) = locate_current_sheet_pair(layout, &hit.relative_dir, &target_stem)? {
        if pair.plist_path.is_file() && pair.png_path.is_file() {
            return Ok((pair.plist_path, pair.png_path, target_stem));
        }
    }
    // Fallback: direct Resources path (same as index write path).
    let dir = resolve_current_source_dir(layout, &hit.relative_dir);
    let plist = dir.join(format!("{target_stem}.plist"));
    let png = dir.join(format!("{target_stem}.png"));
    if !plist.is_file() || !png.is_file() {
        return Err(AppError::IoError(format!(
            "target-tier sheet missing for `{}` under `{}`",
            target_stem,
            dir.display()
        )));
    }
    Ok((plist, png, target_stem))
}

fn find_frame_key(frames: &Dictionary, preferred: &str, aliases: &[String]) -> Option<String> {
    if frames.contains_key(preferred) {
        return Some(preferred.to_string());
    }
    for alias in aliases {
        if frames.contains_key(alias) {
            return Some(alias.clone());
        }
    }
    None
}

pub fn extract_indexed_sprite(
    layout: &GameFilesLayout,
    hit: &SpriteIndexHit,
    target_tier: PortSourceGraphicsTier,
    frame_name_aliases: &[String],
) -> Result<ExtractedIndexedSprite, AppError> {
    let (plist_path, png_path, _stem) = resolve_target_sheet_paths(layout, hit, target_tier)?;
    let (_root, atlas, frames) = read_sheet_frames(&plist_path, &png_path)?;
    extract_sprite_from_loaded(
        &atlas,
        &frames,
        &plist_path,
        &hit.sprite_name,
        frame_name_aliases,
    )
}

/// One pack-sprite extract request for [`extract_indexed_sprites_batch`].
pub struct SpriteExtractRequest {
    pub result_key: String,
    pub hit: SpriteIndexHit,
    pub aliases: Vec<String>,
}

/// Open each distinct target-tier sheet once and extract all requested frames from it.
pub fn extract_indexed_sprites_batch(
    layout: &GameFilesLayout,
    target_tier: PortSourceGraphicsTier,
    requests: &[SpriteExtractRequest],
) -> BTreeMap<String, Result<ExtractedIndexedSprite, AppError>> {
    let mut out = BTreeMap::new();
    if requests.is_empty() {
        return out;
    }

    // Group by resolved target sheet paths so each plist/png is read once.
    let mut groups: BTreeMap<(PathBuf, PathBuf), Vec<usize>> = BTreeMap::new();
    let mut resolve_errors: BTreeMap<usize, AppError> = BTreeMap::new();
    for (idx, req) in requests.iter().enumerate() {
        match resolve_target_sheet_paths(layout, &req.hit, target_tier) {
            Ok((plist, png, _)) => {
                groups.entry((plist, png)).or_default().push(idx);
            }
            Err(err) => {
                resolve_errors.insert(idx, err);
            }
        }
    }

    for (idx, err) in resolve_errors {
        out.insert(requests[idx].result_key.clone(), Err(err));
    }

    for ((plist_path, png_path), indices) in groups {
        let loaded = read_sheet_frames(&plist_path, &png_path);
        match loaded {
            Ok((_root, atlas, frames)) => {
                for idx in indices {
                    let req = &requests[idx];
                    out.insert(
                        req.result_key.clone(),
                        extract_sprite_from_loaded(
                            &atlas,
                            &frames,
                            &plist_path,
                            &req.hit.sprite_name,
                            &req.aliases,
                        ),
                    );
                }
            }
            Err(err) => {
                for idx in indices {
                    out.insert(requests[idx].result_key.clone(), Err(err.clone()));
                }
            }
        }
    }

    out
}

fn extract_sprite_from_loaded(
    atlas: &RgbaImage,
    frames: &Dictionary,
    plist_path: &Path,
    sprite_name: &str,
    frame_name_aliases: &[String],
) -> Result<ExtractedIndexedSprite, AppError> {
    let preferred = frame_name_aliases
        .first()
        .map(String::as_str)
        .unwrap_or(sprite_name);
    let frame_key = find_frame_key(frames, preferred, frame_name_aliases)
        .or_else(|| find_frame_key(frames, sprite_name, frame_name_aliases))
        .ok_or_else(|| {
            AppError::ParseError(format!(
                "sprite `{sprite_name}` not found in target sheet `{}`",
                plist_path.display()
            ))
        })?;

    let frame_dict = frames
        .get(&frame_key)
        .and_then(Value::as_dictionary)
        .ok_or_else(|| AppError::ParseError(format!("invalid frame `{frame_key}`")))?;

    let image = extract_frame_rgba_raw(atlas, frame_dict)?;
    let sprite_offset = frame_dict
        .get("spriteOffset")
        .and_then(Value::as_string)
        .map(parse_pair_signed)
        .transpose()?
        .unwrap_or((0.0, 0.0));
    let sprite_size = frame_dict
        .get("spriteSize")
        .and_then(Value::as_string)
        .map(parse_pair_u32)
        .transpose()?
        .unwrap_or((image.width(), image.height()));
    let sprite_source_size = frame_dict
        .get("spriteSourceSize")
        .and_then(Value::as_string)
        .map(parse_pair_u32)
        .transpose()?
        .unwrap_or(sprite_size);

    Ok(ExtractedIndexedSprite {
        image,
        sprite_offset,
        sprite_size,
        sprite_source_size,
        frame_key,
    })
}

fn looks_like_icon_stem(stem: &str) -> bool {
    let base = base_stem_from_stem(stem).to_ascii_lowercase();
    const PREFIXES: &[&str] = &[
        "player_", "ship_", "ball_", "ufo_", "bird_", "dart_", "robot_", "spider_", "swing_",
        "jetpack_", "cube_",
    ];
    PREFIXES.iter().any(|p| base.starts_with(p))
}

fn relative_under_icons(relative_dir: &Path) -> bool {
    relative_dir
        .components()
        .next()
        .map(|c| c.as_os_str().eq_ignore_ascii_case("icons"))
        .unwrap_or(false)
}

fn candidate_relative_dirs(hint: &SheetProbeHint) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let under_icons = relative_under_icons(&hint.relative_dir) || looks_like_icon_stem(&hint.stem);
    if under_icons {
        dirs.push(PathBuf::from("icons"));
        if !hint.relative_dir.as_os_str().is_empty() {
            dirs.push(hint.relative_dir.clone());
        }
        dirs.push(PathBuf::new());
    } else {
        if !hint.relative_dir.as_os_str().is_empty() {
            dirs.push(hint.relative_dir.clone());
        }
        dirs.push(PathBuf::new());
        dirs.push(PathBuf::from("icons"));
    }
    dirs.sort();
    dirs.dedup();
    dirs
}

fn candidate_stems(hint: &SheetProbeHint) -> Vec<String> {
    let base = base_stem_from_stem(&hint.stem);
    let mut stems = vec![
        hint.stem.clone(),
        base.clone(),
        stem_for_tier(&base, PortSourceGraphicsTier::Hd),
        stem_for_tier(&base, PortSourceGraphicsTier::Uhd),
    ];
    stems.sort();
    stems.dedup();
    stems
}

/// Locate the vanilla Resources sheet for this pack stem (same graphics tier) and
/// return raw frame crops keyed by sprite name, plus a hit template for extracts.
pub fn same_tier_vanilla_frames(
    layout: &GameFilesLayout,
    hint: &SheetProbeHint,
) -> Result<Option<(SpriteIndexHit, BTreeMap<String, RgbaImage>)>, AppError> {
    if !layout.geometry_dash_found() {
        return Ok(None);
    }
    let pack_tier = port_source_tier_from_stem(&hint.stem);
    let pack_base = base_stem_from_stem(&hint.stem);

    for rel in candidate_relative_dirs(hint) {
        // Prefer the exact pack stem (same tier) before other tier variants.
        for stem in [hint.stem.clone(), stem_for_tier(&pack_base, pack_tier)] {
            let Some(pair) = locate_current_sheet_pair(layout, &rel, &stem)? else {
                continue;
            };
            if !pair.plist_path.is_file() || !pair.png_path.is_file() {
                continue;
            }
            if port_source_tier_from_stem(&stem) != pack_tier {
                continue;
            }
            let frames = extract_all_frames_raw(&pair.plist_path, &pair.png_path)?;
            if frames.is_empty() {
                continue;
            }
            let _ = index_sheet_pair(layout, &rel, &stem, &pair.plist_path, &pair.png_path);
            return Ok(Some((
                SpriteIndexHit {
                    sheet_key: sheet_key(&rel, &stem),
                    sprite_name: String::new(),
                    tier: pack_tier,
                    relative_dir: rel,
                    base_stem: pack_base,
                    source_stem: stem,
                },
                frames,
            )));
        }
    }
    Ok(None)
}

/// Same-tier vanilla sheet loaded once and preprocessed for exact + loose matching.
pub fn same_tier_vanilla_batch(
    layout: &GameFilesLayout,
    hint: &SheetProbeHint,
) -> Result<Option<(SpriteIndexHit, PreparedSheetBatch)>, AppError> {
    let Some((hit, frames)) = same_tier_vanilla_frames(layout, hint)? else {
        return Ok(None);
    };
    Ok(Some((hit, prepare_batch_from_owned(frames))))
}

/// Probe likely Resources locations for this sheet and index any that exist.
/// Uses [`locate_current_sheet_pair`] so paths match the rest of the app.
pub fn probe_and_index_likely_sheets(
    layout: &GameFilesLayout,
    hint: &SheetProbeHint,
) -> Result<usize, AppError> {
    if !layout.geometry_dash_found() {
        return Err(AppError::InvalidOperation(
            "Geometry Dash is not configured — sprite cache cannot look up vanilla sheets",
        ));
    }

    let mut indexed = 0usize;
    let mut seen_keys = std::collections::BTreeSet::new();

    for rel in candidate_relative_dirs(hint) {
        for stem in candidate_stems(hint) {
            let Some(pair) = locate_current_sheet_pair(layout, &rel, &stem)? else {
                continue;
            };
            if !pair.plist_path.is_file() || !pair.png_path.is_file() {
                continue;
            }
            let key = sheet_key(&rel, &stem);
            if !seen_keys.insert(key) {
                continue;
            }
            indexed = indexed.saturating_add(index_sheet_pair(
                layout,
                &rel,
                &stem,
                &pair.plist_path,
                &pair.png_path,
            )?);
        }
    }

    // Also try the hint's exact relative_dir + stem as discovered on the pack.
    if let Some(pair) = locate_current_sheet_pair(layout, &hint.relative_dir, &hint.stem)? {
        let key = sheet_key(&hint.relative_dir, &hint.stem);
        if seen_keys.insert(key) {
            indexed = indexed.saturating_add(index_sheet_pair(
                layout,
                &hint.relative_dir,
                &hint.stem,
                &pair.plist_path,
                &pair.png_path,
            )?);
        }
    }

    Ok(indexed)
}

/// How many sprite hashes are currently stored.
pub fn indexed_sprite_count(layout: &GameFilesLayout) -> Result<usize, AppError> {
    let _guard = index_lock()
        .lock()
        .map_err(|_| AppError::InvalidOperation("sprite index lock poisoned"))?;
    Ok(load_index(layout)?.sprites.len())
}

/// Re-index only sheets already present in `indexedSheets`.
pub fn regenerate_indexed_sheets(layout: &GameFilesLayout) -> Result<usize, AppError> {
    let snapshot = {
        let _guard = index_lock()
            .lock()
            .map_err(|_| AppError::InvalidOperation("sprite index lock poisoned"))?;
        load_index(layout)?
    };

    let keys: Vec<(String, IndexedSheetMeta)> = snapshot.indexed_sheets.into_iter().collect();
    let mut regenerated = 0usize;
    let mut missing_keys = Vec::new();

    for (key, meta) in &keys {
        let rel = PathBuf::from(&meta.relative_dir);
        let dir = resolve_current_source_dir(layout, &rel);
        let plist = dir.join(format!("{}.plist", meta.stem));
        let png = dir.join(format!("{}.png", meta.stem));
        if !plist.is_file() || !png.is_file() {
            missing_keys.push(key.clone());
            continue;
        }
        regenerated = regenerated.saturating_add(index_sheet_pair_inner(
            layout, &rel, &meta.stem, &plist, &png, true,
        )?);
    }

    if !missing_keys.is_empty() {
        with_index_mut(layout, |file| {
            for key in &missing_keys {
                file.indexed_sheets.remove(key);
                file.sprites.retain(|_, meta| &meta.sheet_key != key);
            }
            Ok(((), true))
        })?;
    }

    Ok(regenerated)
}

pub fn apply_extracted_geometry_to_frame(
    plist_root: &mut Value,
    frame_key: &str,
    extracted: &ExtractedIndexedSprite,
) -> Result<(), AppError> {
    let root = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames = root
        .get_mut("frames")
        .and_then(Value::as_dictionary_mut)
        .ok_or_else(|| AppError::ParseError("plist missing `frames`".to_string()))?;
    let frame = frames
        .get_mut(frame_key)
        .and_then(Value::as_dictionary_mut)
        .ok_or_else(|| AppError::ParseError(format!("missing frame `{frame_key}`")))?;

    frame.insert(
        "spriteOffset".to_string(),
        Value::String(format!(
            "{{{},{}}}",
            extracted.sprite_offset.0, extracted.sprite_offset.1
        )),
    );
    frame.insert(
        "spriteSize".to_string(),
        Value::String(format!(
            "{{{},{}}}",
            extracted.sprite_size.0, extracted.sprite_size.1
        )),
    );
    frame.insert(
        "spriteSourceSize".to_string(),
        Value::String(format!(
            "{{{},{}}}",
            extracted.sprite_source_size.0, extracted.sprite_source_size.1
        )),
    );
    frame.insert("textureRotated".to_string(), Value::Boolean(false));
    Ok(())
}

/// Unused helper kept for DynamicImage callers in tests.
#[allow(dead_code)]
pub fn hash_trimmed_dynamic(image: &DynamicImage) -> String {
    hash_trimmed_rgba(&image.to_rgba8())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn checker(w: u32, h: u32) -> RgbaImage {
        let mut img = RgbaImage::from_pixel(w, h, Rgba([0, 0, 0, 0]));
        for y in 4..(h - 4) {
            for x in 4..(w - 4) {
                let c = if ((x / 4) + (y / 4)) % 2 == 0 {
                    Rgba([255, 0, 0, 255])
                } else {
                    Rgba([0, 0, 255, 255])
                };
                img.put_pixel(x, y, c);
            }
        }
        img
    }

    #[test]
    fn hash_stable_for_padded_equivalent() {
        let core = checker(24, 24);
        let mut padded = RgbaImage::from_pixel(40, 40, Rgba([0, 0, 0, 0]));
        for y in 0..24 {
            for x in 0..24 {
                padded.put_pixel(x + 8, y + 8, *core.get_pixel(x, y));
            }
        }
        assert_eq!(hash_trimmed_rgba(&core), hash_trimmed_rgba(&padded));
        assert!(sprites_match_loose(&core, &padded));
    }

    #[test]
    fn loose_bands_use_longest_side_and_tier() {
        let under = loose_band_for_size(60.0, PortSourceGraphicsTier::Uhd);
        let over = loose_band_for_size(150.0, PortSourceGraphicsTier::Uhd);
        assert!(under.min_iou < over.min_iou);
        assert!(under.min_ssim < over.min_ssim);

        // Wide-but-short still counts as large when one side exceeds 100 UHD.
        let wide = loose_band_for_size(140.0, PortSourceGraphicsTier::Uhd);
        assert_eq!(wide.min_iou, over.min_iou);

        // HD 50 / Low 25 longest side ≡ UHD 100 (still under/equal band).
        let uhd_100 = loose_band_for_size(100.0, PortSourceGraphicsTier::Uhd);
        let hd_50 = loose_band_for_size(50.0, PortSourceGraphicsTier::Hd);
        let low_25 = loose_band_for_size(25.0, PortSourceGraphicsTier::Low);
        assert_eq!(uhd_100.min_iou, under.min_iou);
        assert_eq!(uhd_100.min_iou, hd_50.min_iou);
        assert_eq!(uhd_100.min_iou, low_25.min_iou);

        let uhd_over = loose_band_for_size(120.0, PortSourceGraphicsTier::Uhd);
        let hd_over = loose_band_for_size(60.0, PortSourceGraphicsTier::Hd);
        assert_eq!(uhd_over.min_iou, hd_over.min_iou);
        assert!(uhd_over.min_iou > uhd_100.min_iou);
    }

    #[test]
    fn loose_match_tolerates_reexport_noise_and_rejects_unrelated() {
        let core = checker(24, 24);
        let mut noisy = core.clone();
        // Tiny re-export noise on a few opaque texels.
        for (x, y) in [(5u32, 5), (6, 7), (10, 12)] {
            let p = noisy.get_pixel_mut(x, y);
            if p.0[3] > 0 {
                p.0[0] = p.0[0].saturating_add(3);
                p.0[1] = p.0[1].saturating_sub(2);
            }
        }
        assert!(sprites_match_loose(&core, &noisy));

        let mut other = RgbaImage::from_pixel(24, 24, Rgba([0, 0, 0, 0]));
        for y in 2..22 {
            for x in 2..22 {
                let c = if (y / 3) % 2 == 0 {
                    Rgba([0, 220, 40, 255])
                } else {
                    Rgba([40, 40, 220, 255])
                };
                other.put_pixel(x, y, c);
            }
        }
        assert!(!sprites_match_loose(&core, &other));

        // Custom-looking variant of the same checker (many pixels shifted) must not match.
        let mut customized = core.clone();
        for y in 4..20 {
            for x in 4..20 {
                let p = customized.get_pixel_mut(x, y);
                if p.0[3] > 0 {
                    p.0[0] = p.0[0].saturating_add(40);
                    p.0[2] = p.0[2].saturating_sub(30);
                }
            }
        }
        assert!(!sprites_match_loose(&core, &customized));
    }

    #[test]
    fn loose_match_is_name_agnostic_in_batch() {
        let core = checker(24, 24);
        let mut noisy = core.clone();
        // Same mild noise as the pair-wise loose test.
        for (x, y) in [(5u32, 5), (6, 7), (10, 12)] {
            let p = noisy.get_pixel_mut(x, y);
            if p.0[3] > 0 {
                p.0[0] = p.0[0].saturating_add(3);
                p.0[1] = p.0[1].saturating_sub(2);
            }
        }
        assert!(sprites_match_loose(&core, &noisy));
        assert_ne!(hash_trimmed_rgba(&core), hash_trimmed_rgba(&noisy));

        let mut haystack = PreparedSheetBatch::default();
        haystack
            .frames
            .insert("vanilla_reuse_name.png".into(), prepare_frame(&noisy));
        haystack.frames.insert(
            "unrelated.png".into(),
            prepare_frame(&RgbaImage::from_pixel(24, 24, Rgba([10, 200, 10, 255]))),
        );

        let needle = prepare_frame(&core);
        assert_eq!(
            find_best_loose_match_in_batch(&needle, &haystack, PortSourceGraphicsTier::Uhd),
            Some("vanilla_reuse_name.png")
        );

        // Exact hash match under a different name is found without needing loose.
        let mut exact_haystack = PreparedSheetBatch::default();
        exact_haystack
            .frames
            .insert("icon_shared.png".into(), prepare_frame(&core));
        assert_eq!(
            find_hash_in_batch(&exact_haystack, &needle.hash),
            Some("icon_shared.png")
        );
    }

    #[test]
    fn base_and_tier_stems() {
        assert_eq!(base_stem_from_stem("player_01-uhd"), "player_01");
        assert_eq!(base_stem_from_stem("GJ_GameSheet03-hd"), "GJ_GameSheet03");
        assert_eq!(base_stem_from_stem("GJ_GameSheet03"), "GJ_GameSheet03");
        assert_eq!(
            stem_for_tier("GJ_GameSheet03", PortSourceGraphicsTier::Uhd),
            "GJ_GameSheet03-uhd"
        );
        assert_eq!(
            stem_for_tier("player_01", PortSourceGraphicsTier::Hd),
            "player_01-hd"
        );
    }

    #[test]
    fn sheet_key_formats() {
        assert_eq!(sheet_key(Path::new(""), "foo-hd"), "foo-hd");
        assert_eq!(
            sheet_key(Path::new("icons"), "player_01"),
            "icons/player_01"
        );
    }

    #[test]
    fn index_roundtrip_and_skip_unchanged() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!("tm2-sprite-index-{nanos}"));
        let resources = root.join("Resources");
        let icons = resources.join("icons");
        fs::create_dir_all(&icons).unwrap();

        let stem = "player_01-hd";
        let plist = icons.join(format!("{stem}.plist"));
        let png = icons.join(format!("{stem}.png"));

        let mut img = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 2..14 {
            for x in 2..14 {
                img.put_pixel(x, y, Rgba([10, 200, 30, 255]));
            }
        }
        img.save(&png).unwrap();

        let plist_xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>frames</key>
  <dict>
    <key>player_01_001.png</key>
    <dict>
      <key>textureRect</key>
      <string>{{2,2},{12,12}}</string>
      <key>spriteSize</key>
      <string>{12,12}</string>
      <key>spriteOffset</key>
      <string>{0,0}</string>
      <key>spriteSourceSize</key>
      <string>{12,12}</string>
      <key>textureRotated</key>
      <false/>
    </dict>
  </dict>
  <key>metadata</key>
  <dict>
    <key>format</key>
    <integer>3</integer>
    <key>size</key>
    <string>{16,16}</string>
  </dict>
</dict>
</plist>
"#;
        fs::write(&plist, plist_xml).unwrap();

        let layout = GameFilesLayout {
            root: root.clone(),
            geometry_dash_dir: root.clone(),
            resources: resources.clone(),
            geode_resources: root.join("geode").join("resources"),
            geode_unzipped: root.join("geode").join("unzipped"),
            current_split: root.join("split-cache"),
            legacy: root.join("legacy"),
        };

        let added = index_sheet_pair(&layout, Path::new("icons"), stem, &plist, &png).unwrap();
        assert!(added >= 1);
        let file = load_index(&layout).unwrap();
        assert!(file.indexed_sheets.contains_key("icons/player_01-hd"));
        assert!(!file.sprites.is_empty());

        let again = index_sheet_pair(&layout, Path::new("icons"), stem, &plist, &png).unwrap();
        assert_eq!(again, 0, "unchanged sheet should skip rebuild");

        let hash = file.sprites.keys().next().unwrap().clone();
        let hit = lookup_hash(&layout, &hash).unwrap().expect("hit");
        assert_eq!(hit.sprite_name, "player_01_001.png");
        assert_eq!(hit.base_stem, "player_01");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn raw_crop_hash_matches_offset_baked_after_trim() {
        // Simulate: raw crop vs offset-baked (transparent padding) must share identity.
        let mut raw = RgbaImage::from_pixel(10, 10, Rgba([0, 0, 0, 0]));
        for y in 0..8 {
            for x in 0..8 {
                raw.put_pixel(x, y, Rgba([9, 8, 7, 255]));
            }
        }
        let mut baked = RgbaImage::from_pixel(14, 14, Rgba([0, 0, 0, 0]));
        for y in 0..10 {
            for x in 0..10 {
                baked.put_pixel(x + 2, y + 2, *raw.get_pixel(x, y));
            }
        }
        assert_eq!(hash_trimmed_rgba(&raw), hash_trimmed_rgba(&baked));
    }

    #[test]
    fn same_tier_lookup_from_trimmed_baked_sprite() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!("tm2-sprite-lookup-{nanos}"));
        let resources = root.join("Resources");
        fs::create_dir_all(&resources).unwrap();

        // Low-tier source sheet (indexed).
        let low_stem = "BlockSheet";
        let low_plist = resources.join(format!("{low_stem}.plist"));
        let low_png = resources.join(format!("{low_stem}.png"));
        let mut low_img = RgbaImage::from_pixel(20, 20, Rgba([0, 0, 0, 0]));
        for y in 3..15 {
            for x in 3..15 {
                low_img.put_pixel(x, y, Rgba([40, 50, 60, 255]));
            }
        }
        low_img.save(&low_png).unwrap();
        fs::write(
            &low_plist,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>frames</key>
  <dict>
    <key>block_001.png</key>
    <dict>
      <key>textureRect</key>
      <string>{{3,3},{12,12}}</string>
      <key>spriteSize</key>
      <string>{12,12}</string>
      <key>spriteOffset</key>
      <string>{1,-2}</string>
      <key>spriteSourceSize</key>
      <string>{16,16}</string>
      <key>textureRotated</key>
      <false/>
    </dict>
  </dict>
  <key>metadata</key>
  <dict>
    <key>format</key>
    <integer>3</integer>
    <key>size</key>
    <string>{20,20}</string>
  </dict>
</dict>
</plist>
"#,
        )
        .unwrap();

        // HD target sheet (extract target).
        let hd_stem = "BlockSheet-hd";
        let hd_plist = resources.join(format!("{hd_stem}.plist"));
        let hd_png = resources.join(format!("{hd_stem}.png"));
        let mut hd_img = RgbaImage::from_pixel(40, 40, Rgba([0, 0, 0, 0]));
        for y in 6..30 {
            for x in 6..30 {
                hd_img.put_pixel(x, y, Rgba([80, 100, 120, 255]));
            }
        }
        hd_img.save(&hd_png).unwrap();
        fs::write(
            &hd_plist,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>frames</key>
  <dict>
    <key>block_001.png</key>
    <dict>
      <key>textureRect</key>
      <string>{{6,6},{24,24}}</string>
      <key>spriteSize</key>
      <string>{24,24}</string>
      <key>spriteOffset</key>
      <string>{2,-4}</string>
      <key>spriteSourceSize</key>
      <string>{32,32}</string>
      <key>textureRotated</key>
      <false/>
    </dict>
  </dict>
  <key>metadata</key>
  <dict>
    <key>format</key>
    <integer>3</integer>
    <key>size</key>
    <string>{40,40}</string>
  </dict>
</dict>
</plist>
"#,
        )
        .unwrap();

        let layout = GameFilesLayout {
            root: root.clone(),
            geometry_dash_dir: root.clone(),
            resources: resources.clone(),
            geode_resources: root.join("geode").join("resources"),
            geode_unzipped: root.join("geode").join("unzipped"),
            current_split: root.join("split-cache"),
            legacy: root.join("legacy"),
        };

        assert!(
            index_sheet_pair(&layout, Path::new(""), low_stem, &low_plist, &low_png).unwrap() >= 1
        );

        // Pack sprite as splitter would see it: offset-baked canvas with blank edges.
        let mut baked = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 0..12 {
            for x in 0..12 {
                baked.put_pixel(x + 2, y + 1, *low_img.get_pixel(x + 3, y + 3));
            }
        }
        let hash = hash_trimmed_rgba(&baked);
        let hit = lookup_hash_matching(&layout, &hash, Some(PortSourceGraphicsTier::Low))
            .unwrap()
            .expect("same-tier hit from trimmed baked sprite");
        assert_eq!(hit.sprite_name, "block_001.png");

        let extracted = extract_indexed_sprite(
            &layout,
            &hit,
            PortSourceGraphicsTier::Hd,
            &[hit.sprite_name.clone()],
        )
        .unwrap();
        assert_eq!(extracted.image.width(), 24);
        assert_eq!(extracted.image.height(), 24);

        let _ = fs::remove_dir_all(&root);
    }

    /// Pairwise same-name hash compare: pack frame vs vanilla Resources frame.
    /// Env: TM2_PACK_PLIST, TM2_PACK_PNG, optional TM2_VANILLA_STEM (default GJ_GameSheet03-hd)
    #[test]
    #[ignore]
    fn pack_vanilla_pairwise_name_hashes() {
        let plist = PathBuf::from(std::env::var("TM2_PACK_PLIST").expect("TM2_PACK_PLIST"));
        let png = PathBuf::from(std::env::var("TM2_PACK_PNG").expect("TM2_PACK_PNG"));
        let stem = std::env::var("TM2_VANILLA_STEM").unwrap_or_else(|_| "GJ_GameSheet03-hd".into());
        let gd = PathBuf::from(r"C:\Program Files (x86)\Steam\steamapps\common\Geometry Dash");
        let resources = gd.join("Resources");
        let v_plist = resources.join(format!("{stem}.plist"));
        let v_png = resources.join(format!("{stem}.png"));

        let pack_hashes = hash_all_frames_in_sheet(&plist, &png).unwrap();
        let vanilla_hashes = hash_all_frames_in_sheet(&v_plist, &v_png).unwrap();

        let mut same_name_equal = 0usize;
        let mut same_name_differ = 0usize;
        let mut only_pack = 0usize;
        let mut sample_diff = 0usize;
        for (name, ph) in &pack_hashes {
            match vanilla_hashes.get(name) {
                Some(vh) if vh == ph => same_name_equal += 1,
                Some(_) => {
                    same_name_differ += 1;
                    if sample_diff < 8 {
                        sample_diff += 1;
                        // Compare trimmed dims
                        let (_r1, atlas_p, frames_p) = read_sheet_frames(&plist, &png).unwrap();
                        let (_r2, atlas_v, frames_v) = read_sheet_frames(&v_plist, &v_png).unwrap();
                        let dp = frames_p.get(name).unwrap().as_dictionary().unwrap();
                        let dv = frames_v.get(name).unwrap().as_dictionary().unwrap();
                        let ip =
                            trim_transparent_rgba(&extract_frame_rgba_raw(&atlas_p, dp).unwrap());
                        let iv =
                            trim_transparent_rgba(&extract_frame_rgba_raw(&atlas_v, dv).unwrap());
                        eprintln!(
                            "differ {name}: pack={}x{} vanilla={}x{}",
                            ip.width(),
                            ip.height(),
                            iv.width(),
                            iv.height()
                        );
                    }
                }
                None => only_pack += 1,
            }
        }
        let only_vanilla = vanilla_hashes
            .keys()
            .filter(|k| !pack_hashes.contains_key(k.as_str()))
            .count();
        eprintln!(
            "pairwise equal={same_name_equal} differ={same_name_differ} only_pack={only_pack} only_vanilla={only_vanilla} pack_total={}",
            pack_hashes.len()
        );

        // Same-size frames: how many pixels differ? Is it tiny noise or full redraw?
        let (_r1, atlas_p, frames_p) = read_sheet_frames(&plist, &png).unwrap();
        let (_r2, atlas_v, frames_v) = read_sheet_frames(&v_plist, &v_png).unwrap();
        let mut same_dims = 0usize;
        let mut near_exact = 0usize; // <=0.5% pixels differ
        let mut mild = 0usize; // <=5%
        let mut heavy = 0usize;
        for (name, _) in &pack_hashes {
            let Some(dp) = frames_p.get(name).and_then(|v| v.as_dictionary()) else {
                continue;
            };
            let Some(dv) = frames_v.get(name).and_then(|v| v.as_dictionary()) else {
                continue;
            };
            let ip = trim_transparent_rgba(&extract_frame_rgba_raw(&atlas_p, dp).unwrap());
            let iv = trim_transparent_rgba(&extract_frame_rgba_raw(&atlas_v, dv).unwrap());
            if ip.dimensions() != iv.dimensions() {
                continue;
            }
            same_dims += 1;
            let total = (ip.width() * ip.height()) as u64;
            let mut diff = 0u64;
            for (a, b) in ip.pixels().zip(iv.pixels()) {
                if a != b {
                    diff += 1;
                }
            }
            let pct = (diff as f64) * 100.0 / (total.max(1) as f64);
            if diff == 0 {
                near_exact += 1;
            } else if pct <= 0.5 {
                near_exact += 1;
            } else if pct <= 5.0 {
                mild += 1;
            } else {
                heavy += 1;
            }
        }
        eprintln!(
            "same_dims={same_dims} near_exact(<=0.5%)={near_exact} mild(<=5%)={mild} heavy={heavy}"
        );

        // Alpha-threshold trim: ignore faint fringe alphas that shift bounds by 1px.
        for thr in [0u8, 1, 8, 16, 32, 64] {
            let mut eq = 0usize;
            for (name, _) in &pack_hashes {
                let Some(dp) = frames_p.get(name).and_then(|v| v.as_dictionary()) else {
                    continue;
                };
                let Some(dv) = frames_v.get(name).and_then(|v| v.as_dictionary()) else {
                    continue;
                };
                let ip = extract_frame_rgba_raw(&atlas_p, dp).unwrap();
                let iv = extract_frame_rgba_raw(&atlas_v, dv).unwrap();
                let hp = hash_trimmed_rgba_threshold(&ip, thr);
                let hv = hash_trimmed_rgba_threshold(&iv, thr);
                if hp == hv {
                    eq += 1;
                }
            }
            eprintln!("alpha_thr={thr} equal={eq}/{}", pack_hashes.len());
        }
    }

    fn hash_trimmed_rgba_threshold(image: &RgbaImage, alpha_thr: u8) -> String {
        let mut normalized = image.clone();
        for p in normalized.pixels_mut() {
            if p.0[3] <= alpha_thr {
                *p = Rgba([0, 0, 0, 0]);
            }
        }
        hash_trimmed_rgba(&normalized)
    }

    /// Compare a pack sheet (env TM2_PACK_PLIST / TM2_PACK_PNG) against the live index.
    /// Run with those env vars set and: cargo test pack_index_overlap -- --ignored --nocapture
    #[test]
    #[ignore]
    fn pack_index_overlap() {
        let plist = PathBuf::from(std::env::var("TM2_PACK_PLIST").expect("TM2_PACK_PLIST"));
        let png = PathBuf::from(std::env::var("TM2_PACK_PNG").expect("TM2_PACK_PNG"));
        let gd = PathBuf::from(r"C:\Program Files (x86)\Steam\steamapps\common\Geometry Dash");
        let root = PathBuf::from(std::env::var("USERPROFILE").unwrap())
            .join("TextureManager2")
            .join("game-files");
        let layout = GameFilesLayout {
            root: root.clone(),
            geometry_dash_dir: gd.clone(),
            resources: gd.join("Resources"),
            geode_resources: gd.join("geode").join("resources"),
            geode_unzipped: gd.join("geode").join("unzipped"),
            current_split: root.join("split-cache"),
            legacy: root.join("legacy"),
        };

        let atlas = hash_all_frames_in_sheet(&plist, &png).unwrap();
        let mut hits = 0usize;
        let mut misses = 0usize;
        let mut other_tier = 0usize;
        for (name, hash) in &atlas {
            if lookup_hash_matching(&layout, hash, Some(PortSourceGraphicsTier::Hd))
                .unwrap()
                .is_some()
            {
                hits += 1;
            } else if lookup_hash_matching(&layout, hash, None).unwrap().is_some() {
                other_tier += 1;
                misses += 1;
            } else {
                misses += 1;
                if misses <= 5 {
                    eprintln!("miss {name}");
                }
            }
        }
        eprintln!(
            "pack frames={} hd_hits={} other_tier={} misses={} png={}",
            atlas.len(),
            hits,
            other_tier,
            misses,
            png.display()
        );

        // Control: vanilla HD sheet from Resources should be all hits.
        let v_plist = layout.resources.join("GJ_GameSheet03-hd.plist");
        let v_png = layout.resources.join("GJ_GameSheet03-hd.png");
        let vanilla = hash_all_frames_in_sheet(&v_plist, &v_png).unwrap();
        let mut v_hits = 0usize;
        for hash in vanilla.values() {
            if lookup_hash_matching(&layout, hash, Some(PortSourceGraphicsTier::Hd))
                .unwrap()
                .is_some()
            {
                v_hits += 1;
            }
        }
        eprintln!("vanilla HD control hits={}/{}", v_hits, vanilla.len());
        assert_eq!(v_hits, vanilla.len(), "vanilla HD must hit index");
    }

    /// Live diagnostic against the user's installed GD + sprite-index.json.
    /// Run with: cargo test --manifest-path src-tauri/Cargo.toml live_index_match_gamesheet03 -- --ignored --nocapture
    #[test]
    #[ignore]
    fn live_index_match_gamesheet03() {
        use crate::core::contracts::phase_defaults;
        use crate::core::discovery::SheetCandidate;
        use crate::core::splitter::split_sheet_candidate_memory;

        let gd = PathBuf::from(r"C:\Program Files (x86)\Steam\steamapps\common\Geometry Dash");
        let root = PathBuf::from(std::env::var("USERPROFILE").unwrap())
            .join("TextureManager2")
            .join("game-files");
        let resources = gd.join("Resources");
        let layout = GameFilesLayout {
            root: root.clone(),
            geometry_dash_dir: gd.clone(),
            resources: resources.clone(),
            geode_resources: gd.join("geode").join("resources"),
            geode_unzipped: gd.join("geode").join("unzipped"),
            current_split: root.join("split-cache"),
            legacy: root.join("legacy"),
        };

        let index = load_index(&layout).unwrap();
        eprintln!(
            "index sprites={} sheets={} version={}",
            index.sprites.len(),
            index.indexed_sheets.len(),
            index.version
        );

        let plist = resources.join("GJ_GameSheet03.plist");
        let png = resources.join("GJ_GameSheet03.png");
        assert!(plist.is_file() && png.is_file(), "missing GameSheet03");

        let atlas_hashes = hash_all_frames_in_sheet(&plist, &png).unwrap();
        let mut atlas_hits = 0usize;
        let mut atlas_miss = 0usize;
        for (name, hash) in &atlas_hashes {
            if lookup_hash_matching(&layout, hash, Some(PortSourceGraphicsTier::Low))
                .unwrap()
                .is_some()
            {
                atlas_hits += 1;
            } else {
                atlas_miss += 1;
                if atlas_miss <= 5 {
                    eprintln!("atlas miss {name} {}", &hash[..16]);
                }
            }
        }
        eprintln!("atlas_hits={atlas_hits} atlas_miss={atlas_miss}");

        let pair = SheetCandidate {
            stem: "GJ_GameSheet03".into(),
            relative_dir: PathBuf::new(),
            plist_path: plist,
            png_path: png,
        };
        let split =
            split_sheet_candidate_memory(&pair, &phase_defaults().splitter, &mut || {}).unwrap();
        let mut baked_hits = 0usize;
        let mut baked_miss = 0usize;
        for (name, img) in &split.sprites {
            let hash = hash_trimmed_rgba(img);
            if lookup_hash_matching(&layout, &hash, Some(PortSourceGraphicsTier::Low))
                .unwrap()
                .is_some()
            {
                baked_hits += 1;
            } else {
                baked_miss += 1;
                if baked_miss <= 5 {
                    let atlas_same = atlas_hashes.get(name).map(|h| h == &hash).unwrap_or(false);
                    eprintln!(
                        "baked miss {name} trim={} atlas_same={atlas_same}",
                        &hash[..16]
                    );
                }
            }
        }
        eprintln!(
            "baked_hits={baked_hits} baked_miss={baked_miss} split={}",
            split.sprites.len()
        );

        let mut dual_hits = 0usize;
        for (name, img) in &split.sprites {
            let mut hashes = vec![hash_trimmed_rgba(img)];
            if let Some(h) = atlas_hashes.get(name) {
                if h != &hashes[0] {
                    hashes.push(h.clone());
                }
            }
            if lookup_hash_any(&layout, &hashes, Some(PortSourceGraphicsTier::Low))
                .unwrap()
                .is_some()
            {
                dual_hits += 1;
            }
        }
        eprintln!("dual_lookup_hits={dual_hits}");

        // Inspect one baked miss: raw trim vs baked trim dimensions / first pixel diff.
        if let Some((name, baked)) = split.sprites.iter().find(|(n, img)| {
            let h = hash_trimmed_rgba(img);
            atlas_hashes.get(*n).map(|a| a != &h).unwrap_or(false)
        }) {
            let (_root, atlas, frames) = read_sheet_frames(
                &resources.join("GJ_GameSheet03.plist"),
                &resources.join("GJ_GameSheet03.png"),
            )
            .unwrap();
            let dict = frames.get(name).unwrap().as_dictionary().unwrap();
            let raw = extract_frame_rgba_raw(&atlas, dict).unwrap();
            let raw_t = crate::core::merger::trim_transparent_rgba(&raw);
            let baked_t = crate::core::merger::trim_transparent_rgba(baked);
            eprintln!(
                "diff frame={name} raw={}x{} baked={}x{} offset={:?}",
                raw_t.width(),
                raw_t.height(),
                baked_t.width(),
                baked_t.height(),
                dict.get("spriteOffset")
            );
            let mut diffs = 0u32;
            if raw_t.dimensions() == baked_t.dimensions() {
                for (a, b) in raw_t.pixels().zip(baked_t.pixels()) {
                    if a != b {
                        diffs += 1;
                        if diffs <= 3 {
                            eprintln!("pixel diff {:?} vs {:?}", a, b);
                        }
                    }
                }
                eprintln!("same dims pixel_diffs={diffs}");
            }
        }

        assert_eq!(
            atlas_hits,
            atlas_hashes.len(),
            "atlas hashes should all hit index"
        );
        assert_eq!(
            dual_hits,
            split.sprites.len(),
            "dual lookup should recover all frames"
        );
    }
}
