use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;

use image::imageops::{self, FilterType};
use image::RgbaImage;
use plist::{Dictionary, Value};
use regex::Regex;

use crate::core::contracts::{MergerOptions, PorterOptions};
use crate::core::errors::AppError;

/// Root-level sheet bundles write directly under `output_root`; nested sheets keep only the
/// parent path (same layout rule as merger `Merged/`).
pub fn flattened_bundle_output_dir(output_root: &Path, relative_sheet: &Path) -> PathBuf {
    let is_top_level = relative_sheet
        .parent()
        .map(|p| p.as_os_str().is_empty())
        .unwrap_or(true);
    if is_top_level
        && relative_sheet
            .file_name()
            .and_then(|v| v.to_str())
            .map(|v| v.eq_ignore_ascii_case("icons"))
            .unwrap_or(false)
    {
        return output_root.join("icons");
    }
    match relative_sheet.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => output_root.join(parent),
        _ => output_root.to_path_buf(),
    }
}

/// Inferred from the source gamesheet stem (plist/png pair). Drives which **single** rename step runs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PortSourceGraphicsTier {
    /// High-res source: only `-uhd` → `-hd` (one step; output stays HD tier).
    Uhd,
    /// Medium-res source: only `-hd` removed (one step; output is low tier).
    Hd,
    /// No `-uhd` / `-hd` tier markers in the stem — filenames and plist strings unchanged.
    Low,
}

/// Stems that the porter processes (matches classic Porter.py `fileName[-3:]` rules: `-hd` or `…-uhd`).
pub fn porter_stem_eligible(stem: &str) -> bool {
    stem.ends_with("-hd") || stem.ends_with("-uhd")
}

/// Linear scale for standalone bitmaps (`.png` without plist) and bitmap font textures, aligned with
/// classic Porter `divideBy` when `dimensions` is unset.
pub fn standalone_asset_port_scale(
    width: u32,
    height: u32,
    stem: &str,
    opts: &PorterOptions,
) -> Option<f32> {
    if !porter_stem_eligible(stem) {
        return None;
    }
    if opts.dimensions.is_some() {
        Some(porter_sheet_fit_scale(width, height, opts))
    } else if stem.ends_with("-uhd") {
        Some(if opts.low_port { 0.25 } else { 0.5 })
    } else if stem.ends_with("-hd") {
        Some(0.5)
    } else {
        None
    }
}

/// When the texture file is missing, use the same discrete factors as Python when `dimensions` is unset.
pub fn standalone_asset_port_scale_fallback(stem: &str, opts: &PorterOptions) -> Option<f32> {
    if opts.dimensions.is_some() {
        return None;
    }
    standalone_asset_port_scale(1, 1, stem, opts)
}

/// `-uhd` in the stem takes precedence over `-hd` when both appear (non-standard names).
pub fn port_source_tier_from_stem(stem: &str) -> PortSourceGraphicsTier {
    if stem.contains("-uhd") {
        PortSourceGraphicsTier::Uhd
    } else if stem.contains("-hd") {
        PortSourceGraphicsTier::Hd
    } else {
        PortSourceGraphicsTier::Low
    }
}

/// One port step for strings/keys, chosen from the **source** sheet tier (not both steps at once).
pub fn port_rename_identifier(value: &str, tier: PortSourceGraphicsTier) -> String {
    match tier {
        PortSourceGraphicsTier::Uhd => value.replace("-uhd", "-hd"),
        PortSourceGraphicsTier::Hd => value.replace("-hd", ""),
        PortSourceGraphicsTier::Low => value.to_string(),
    }
}

/// Low-graphics output: `-uhd` → `-hd`, then every `-hd` is removed (UHD and HD both end at low tier).
pub fn port_rename_identifier_force_low(value: &str) -> String {
    let mut out = value.replace("-uhd", "-hd");
    out = out.replace("-hd", "");
    out
}

/// How plist frame keys, sprite keys, and string values are rewritten for one merge/save pass.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PortPlistRenameMode {
    /// Single-output: rules follow [`port_source_tier_from_stem`].
    TierFromStem,
    /// Dual **medium** pass from UHD: every `-uhd` → `-hd` (HD tier names).
    MediumFromUhd,
    /// Dual **medium** pass from HD source: no string renames (already medium).
    MediumFromHd,
    /// Low artifact: `-uhd` → `-hd`, then strip `-hd` (low tier / empty suffix).
    ForceLow,
}

fn port_apply_rename(source_stem: &str, mode: PortPlistRenameMode, value: &str) -> String {
    match mode {
        PortPlistRenameMode::TierFromStem => {
            port_rename_identifier(value, port_source_tier_from_stem(source_stem))
        }
        PortPlistRenameMode::MediumFromUhd => {
            port_rename_identifier(value, PortSourceGraphicsTier::Uhd)
        }
        PortPlistRenameMode::MediumFromHd => value.to_string(),
        PortPlistRenameMode::ForceLow => port_rename_identifier_force_low(value),
    }
}

/// Renames frame keys and all string values in the plist; keeps `sprites` keys aligned with frames.
pub fn port_rename_plist_and_sprites(
    plist_root: &mut Value,
    sprites: &mut BTreeMap<String, RgbaImage>,
    source_stem: &str,
    mode: PortPlistRenameMode,
) -> Result<(), AppError> {
    let root = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;

    if let Some(Value::Dictionary(frames)) = root.get_mut("frames") {
        let old_keys: Vec<String> = frames.keys().cloned().collect();
        let mut new_frames = Dictionary::new();
        for old_key in old_keys {
            let new_key = port_apply_rename(source_stem, mode, &old_key);
            if let Some(v) = frames.remove(&old_key) {
                new_frames.insert(new_key, v);
            }
        }
        *frames = new_frames;
    }

    let old_sprite_keys: Vec<String> = sprites.keys().cloned().collect();
    let mut new_sprites: BTreeMap<String, RgbaImage> = BTreeMap::new();
    for old_key in old_sprite_keys {
        let new_key = port_apply_rename(source_stem, mode, &old_key);
        if let Some(img) = sprites.remove(&old_key) {
            new_sprites.insert(new_key, img);
        }
    }
    *sprites = new_sprites;

    port_rename_all_string_values(plist_root, source_stem, mode);
    Ok(())
}

fn port_rename_all_string_values(value: &mut Value, source_stem: &str, mode: PortPlistRenameMode) {
    match value {
        Value::String(s) => *s = port_apply_rename(source_stem, mode, s),
        Value::Dictionary(d) => {
            for (_, child) in d.iter_mut() {
                port_rename_all_string_values(child, source_stem, mode);
            }
        }
        Value::Array(a) => {
            for child in a.iter_mut() {
                port_rename_all_string_values(child, source_stem, mode);
            }
        }
        _ => {}
    }
}

/// Fit / heuristic scale without applying [`PorterOptions::low_port`] (used to size dual outputs).
pub fn porter_sheet_fit_scale(sheet_w: u32, sheet_h: u32, opts: &PorterOptions) -> f32 {
    let sw = sheet_w.max(1) as f32;
    let sh = sheet_h.max(1) as f32;
    if let Some(dim) = &opts.dimensions {
        let sx = dim.width as f32 / sw;
        let sy = dim.height as f32 / sh;
        sx.min(sy).min(1.0).max(0.01)
    } else {
        0.5
    }
}

/// Uniform scale for single-output splitter porter (non–dual `low_port` path unchanged).
pub fn porter_sheet_scale_factor(sheet_w: u32, sheet_h: u32, opts: &PorterOptions) -> f32 {
    if opts.dimensions.is_some() {
        porter_sheet_fit_scale(sheet_w, sheet_h, opts)
    } else if opts.low_port {
        0.5
    } else {
        porter_sheet_fit_scale(sheet_w, sheet_h, opts)
    }
}

/// When **Port to Low Graphics** is on and the source is UHD or HD, returns linear scales for the
/// medium then low atlases: low is always **half** of medium (UHD→low is ¼ linear vs source; HD→low is ½).
pub fn porter_medium_and_low_linear_scales(
    sheet_w: u32,
    sheet_h: u32,
    tier: PortSourceGraphicsTier,
    opts: &PorterOptions,
) -> Option<(f32, f32)> {
    if !opts.low_port {
        return None;
    }
    match tier {
        PortSourceGraphicsTier::Uhd | PortSourceGraphicsTier::Hd => {
            let fit = porter_sheet_fit_scale(sheet_w, sheet_h, opts);
            let medium = if tier == PortSourceGraphicsTier::Uhd {
                if opts.dimensions.is_some() {
                    fit
                } else {
                    0.5
                }
            } else {
                if opts.dimensions.is_some() {
                    fit
                } else {
                    1.0
                }
            };
            Some((medium, medium * 0.5))
        }
        PortSourceGraphicsTier::Low => None,
    }
}

pub fn porter_options_to_merger_options(porter: &PorterOptions) -> MergerOptions {
    MergerOptions {
        include_outside_plist_files: false,
        dimensions: porter.dimensions.clone(),
        sheet_concurrency: 1,
    }
}

/// Resize raster sprites; if `scale` is ~1.0, skips work.
pub fn downscale_sprites(sprites: &mut BTreeMap<String, RgbaImage>, scale: f32) {
    if (scale - 1.0).abs() < 1e-4 {
        return;
    }
    for (_name, img) in sprites.iter_mut() {
        let nw = ((img.width() as f32) * scale).round().max(1.0) as u32;
        let nh = ((img.height() as f32) * scale).round().max(1.0) as u32;
        if nw == img.width() && nh == img.height() {
            continue;
        }
        *img = imageops::resize(img, nw, nh, FilterType::Triangle);
    }
}

/// Scale Cocos2d-style numeric plist fields after raster downscale.
pub fn scale_plist_geometry(plist_root: &mut Value, scale: f32) -> Result<(), AppError> {
    if (scale - 1.0).abs() < 1e-4 {
        return Ok(());
    }

    let root = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;

    if let Some(Value::Dictionary(frames)) = root.get_mut("frames") {
        for (_frame_key, frame_val) in frames.iter_mut() {
            let Some(frame_dict) = frame_val.as_dictionary_mut() else {
                continue;
            };
            scale_frame_dictionary(frame_dict, scale)?;
        }
    }

    if let Some(Value::Dictionary(metadata)) = root.get_mut("metadata") {
        if let Some(Value::String(size_raw)) = metadata.get_mut("size") {
            if let Some((w, h)) = parse_two_uints(size_raw) {
                let nw = ((w as f32) * scale).round().max(1.0) as u32;
                let nh = ((h as f32) * scale).round().max(1.0) as u32;
                *size_raw = format!("{{{},{} }}", nw, nh).replace(" ", "");
            }
        }
    }

    Ok(())
}

fn scale_frame_dictionary(frame_dict: &mut Dictionary, scale: f32) -> Result<(), AppError> {
    for key in ["textureRect", "spriteSize", "spriteSourceSize"] {
        if let Some(Value::String(s)) = frame_dict.get_mut(key) {
            *s = scale_rect_or_pair_string(s, scale, key == "textureRect")?;
        }
    }
    if let Some(Value::String(s)) = frame_dict.get_mut("spriteOffset") {
        *s = scale_signed_pair_string(s, scale)?;
    }
    Ok(())
}

fn scale_rect_or_pair_string(
    raw: &str,
    scale: f32,
    is_texture_rect: bool,
) -> Result<String, AppError> {
    let nums = parse_numbers_loose(raw)?;
    if is_texture_rect {
        if nums.len() != 4 {
            return Err(AppError::ParseError(format!(
                "textureRect expected 4 numbers in `{raw}`"
            )));
        }
        let x = (nums[0] * f64::from(scale)).round().max(0.0) as u32;
        let y = (nums[1] * f64::from(scale)).round().max(0.0) as u32;
        let w = (nums[2] * f64::from(scale)).floor().max(1.0) as u32;
        let h = (nums[3] * f64::from(scale)).floor().max(1.0) as u32;
        return Ok(format!("{{{{{},{}}},{{{},{} }}}}", x, y, w, h).replace(" ", ""));
    }
    if nums.len() != 2 {
        return Err(AppError::ParseError(format!(
            "expected 2 numbers in `{raw}`"
        )));
    }
    let a = (nums[0] * f64::from(scale)).floor().max(0.0) as u32;
    let b = (nums[1] * f64::from(scale)).floor().max(0.0) as u32;
    Ok(format!("{{{},{} }}", a, b).replace(" ", ""))
}

fn scale_signed_pair_string(raw: &str, scale: f32) -> Result<String, AppError> {
    let nums = parse_numbers_loose(raw)?;
    if nums.len() != 2 {
        return Err(AppError::ParseError(format!(
            "spriteOffset expected 2 numbers in `{raw}`"
        )));
    }
    let x = nums[0] * f64::from(scale);
    let y = nums[1] * f64::from(scale);
    Ok(format!("{{{x:.3},{y:.3}}}"))
}

fn parse_two_uints(raw: &str) -> Option<(u32, u32)> {
    let nums = parse_numbers_loose(raw).ok()?;
    if nums.len() != 2 {
        return None;
    }
    Some((
        nums[0].floor().max(0.0) as u32,
        nums[1].floor().max(0.0) as u32,
    ))
}

fn parse_numbers_loose(value: &str) -> Result<Vec<f64>, AppError> {
    let mut cleaned = String::with_capacity(value.len());
    for ch in value.chars() {
        if matches!(ch, '{' | '}') {
            continue;
        }
        cleaned.push(ch);
    }
    let mut numbers: Vec<f64> = Vec::new();
    for part in cleaned.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parsed = trimmed
            .parse::<f64>()
            .map_err(|_| AppError::ParseError(format!("invalid numeric value `{trimmed}`")))?;
        numbers.push(parsed);
    }
    Ok(numbers)
}

/// Save merged atlas and updated plist (porter output).
pub fn save_merged_sheet(
    destination_dir: &std::path::Path,
    stem: &str,
    plist_root: &Value,
    atlas: &RgbaImage,
) -> Result<(), AppError> {
    std::fs::create_dir_all(destination_dir)?;
    let output_png = destination_dir.join(format!("{stem}.png"));
    let output_plist = destination_dir.join(format!("{stem}.plist"));
    // PNG and plist are independent files: encode and serialize concurrently.
    thread::scope(|s| {
        let png_path = &output_png;
        let rgba = atlas;
        let png_handle = s.spawn(|| crate::core::image_io::save_rgba_png_fast(png_path, rgba));
        plist_root
            .to_file_xml(&output_plist)
            .map_err(|e| AppError::IoError(e.to_string()))?;
        match png_handle.join() {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(AppError::IoError("png write thread panicked".to_string())),
        }
    })?;
    Ok(())
}

fn porter_fnt_page_graphics_replacement(
    stem: &str,
    opts: &PorterOptions,
) -> Option<(&'static str, &'static str)> {
    if stem.ends_with("-uhd") {
        if opts.low_port {
            Some(("-uhd", ""))
        } else {
            Some(("-uhd", "-hd"))
        }
    } else if stem.ends_with("-hd") {
        Some(("-hd", ""))
    } else {
        None
    }
}

fn scale_i64_div_ceil(n: i64, divide_by: i32) -> i64 {
    let d = f64::from(divide_by);
    (n as f64 / d).ceil() as i64
}

fn scale_i64_div_floor(n: i64, divide_by: i32) -> i64 {
    let d = f64::from(divide_by);
    (n as f64 / d).floor() as i64
}

fn fnt_port_linear_scale(
    stem: &str,
    texture_wh: Option<(u32, u32)>,
    opts: &PorterOptions,
) -> Result<f32, AppError> {
    if let Some((w, h)) = texture_wh {
        if opts.dimensions.is_some() {
            return Ok(porter_sheet_fit_scale(w, h, opts));
        }
    }
    standalone_asset_port_scale_fallback(stem, opts).ok_or_else(|| {
        AppError::ParseError("bitmap font .fnt stem must end with -hd or -uhd".to_string())
    })
}

/// Port one BMFont `.fnt` (ASCII) like classic `Porter.py`: scale glyph metrics and rewrite the
/// `page` texture name; output basename follows `page file=` with `.png`→`.fnt`, not the input name.
pub fn port_bitmap_fnt(
    fnt_path: &Path,
    input_root: &Path,
    porter_output_root: &Path,
    opts: &PorterOptions,
) -> Result<(), AppError> {
    let source_stem = fnt_path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::InvalidPath("invalid .fnt path"))?;
    if !porter_stem_eligible(source_stem) {
        return Err(AppError::ParseError(format!(
            "porter skipped ineligible .fnt `{source_stem}`"
        )));
    }
    let Some((graphics_from, graphics_to)) =
        porter_fnt_page_graphics_replacement(source_stem, opts)
    else {
        return Err(AppError::ParseError(format!(
            "could not derive graphics replacement for `{source_stem}.fnt`"
        )));
    };

    let raw = fs::read_to_string(fnt_path).map_err(|e| AppError::IoError(e.to_string()))?;

    let info_re = Regex::new(
        r#"info face=(?P<face>[\s\w."-]+) size=(?P<size>\w+) bold=(?P<bold>\w+) italic=(?P<italic>\w+) charset=(?P<charset>[\w"]+) unicode=(?P<unicode>\w+) stretchH=(?P<stretchH>\w+) smooth=(?P<smooth>\w+) aa=(?P<aa>\w+) padding=(?P<padding>[\w,-]+) spacing=(?P<spacing>[\w,-]+)"#,
    )
    .map_err(|e| AppError::ParseError(e.to_string()))?;
    let common_re = Regex::new(
        r"common lineHeight=(?P<lineHeight>\w+) base=(?P<base>\w+) scaleW=(?P<scaleW>\w+) scaleH=(?P<scaleH>\w+) pages=(?P<pages>\w+) packed=(?P<packed>\w+)",
    )
    .map_err(|e| AppError::ParseError(e.to_string()))?;
    let page_re = Regex::new(r#"page id=(?P<id>\w+) file=(?P<file>[\w".-]+)"#)
        .map_err(|e| AppError::ParseError(e.to_string()))?;
    let char_re = Regex::new(
        r"char[ ]+id=(?P<id>\w+)[ ]+x=(?P<x>\w+)[ ]+y=(?P<y>\w+)[ ]+width=(?P<width>\w+)[ ]+height=(?P<height>\w+)[ ]+xoffset=(?P<xoffset>[\w-]+)[ ]+yoffset=(?P<yoffset>[\w-]+)[ ]+xadvance=(?P<xadvance>[\w-]+)[ ]+page=(?P<page>\w+)[ ]+chnl=(?P<chnl>\w+)",
    )
    .map_err(|e| AppError::ParseError(e.to_string()))?;
    let kerning_re = Regex::new(
        r"[ ]*kerning first=(?P<first>\w+) second=(?P<second>\w+) amount=(?P<amount>[\w-]+)",
    )
    .map_err(|e| AppError::ParseError(e.to_string()))?;

    let info_caps = info_re
        .captures(&raw)
        .ok_or_else(|| AppError::ParseError("fnt: missing or invalid `info` line".to_string()))?;
    let common_caps = common_re
        .captures(&raw)
        .ok_or_else(|| AppError::ParseError("fnt: missing or invalid `common` line".to_string()))?;
    let page_caps = page_re
        .captures(&raw)
        .ok_or_else(|| AppError::ParseError("fnt: missing or invalid `page` line".to_string()))?;

    let size: i64 = info_caps["size"]
        .parse()
        .map_err(|_| AppError::ParseError("fnt: info size".to_string()))?;
    let line_height: i64 = common_caps["lineHeight"]
        .parse()
        .map_err(|_| AppError::ParseError("fnt: lineHeight".to_string()))?;
    let base: i64 = common_caps["base"]
        .parse()
        .map_err(|_| AppError::ParseError("fnt: base".to_string()))?;
    let scale_w: i64 = common_caps["scaleW"]
        .parse()
        .map_err(|_| AppError::ParseError("fnt: scaleW".to_string()))?;
    let scale_h: i64 = common_caps["scaleH"]
        .parse()
        .map_err(|_| AppError::ParseError("fnt: scaleH".to_string()))?;

    let page_id = page_caps["id"].to_string();
    let page_file_raw = page_caps["file"].to_string();
    let page_file_quoted = page_file_raw.starts_with('"') && page_file_raw.ends_with('"');
    let mut page_file_plain = page_file_raw.trim_matches('"').to_string();
    page_file_plain = page_file_plain.replace(graphics_from, graphics_to);
    let page_file_output = if page_file_quoted {
        format!("\"{page_file_plain}\"")
    } else {
        page_file_plain.clone()
    };

    let fnt_parent = fnt_path
        .parent()
        .ok_or_else(|| AppError::InvalidPath("fnt has no parent directory"))?;
    let texture_path = fnt_parent.join(&page_file_plain);
    let texture_wh = if texture_path.is_file() {
        Some(image::image_dimensions(&texture_path).map_err(|e| AppError::IoError(e.to_string()))?)
    } else {
        None
    };

    let scale = fnt_port_linear_scale(source_stem, texture_wh, opts)?;
    let divide_by = (1.0 / scale).round() as i32;
    let use_integer_div = opts.dimensions.is_none();

    let new_size = if use_integer_div {
        scale_i64_div_ceil(size, divide_by.max(1))
    } else {
        ((size as f64) * f64::from(scale)).ceil() as i64
    };
    let new_line_height = if use_integer_div {
        scale_i64_div_ceil(line_height, divide_by.max(1)) + 2
    } else {
        ((line_height as f64) * f64::from(scale)).ceil() as i64 + 2
    };
    let new_base = if use_integer_div {
        scale_i64_div_ceil(base, divide_by.max(1))
    } else {
        ((base as f64) * f64::from(scale)).ceil() as i64
    };
    let new_scale_w = if use_integer_div {
        scale_i64_div_ceil(scale_w, divide_by.max(1))
    } else {
        ((scale_w as f64) * f64::from(scale)).ceil() as i64
    };
    let new_scale_h = if use_integer_div {
        scale_i64_div_ceil(scale_h, divide_by.max(1))
    } else {
        ((scale_h as f64) * f64::from(scale)).ceil() as i64
    };

    let lines: Vec<&str> = raw.lines().collect();
    let mut char_entries: Vec<String> = Vec::new();
    let mut had_chars_section = false;
    if let Some(ci) = lines
        .iter()
        .position(|line| line.trim_start().starts_with("chars count="))
    {
        had_chars_section = true;
        let header = lines[ci].trim_start();
        let n_str = header
            .strip_prefix("chars count=")
            .ok_or_else(|| AppError::ParseError("fnt: chars count line".to_string()))?
            .trim();
        let n: usize = n_str
            .parse()
            .map_err(|_| AppError::ParseError("fnt: chars count value".to_string()))?;
        let mut j = ci + 1;
        while j < lines.len() && char_entries.len() < n {
            let t = lines[j].trim_start();
            j += 1;
            if !t.starts_with("char ") {
                continue;
            }
            let Some(caps) = char_re.captures(t) else {
                continue;
            };
            let id = caps["id"].to_string();
            let x: i64 = caps["x"]
                .parse()
                .map_err(|_| AppError::ParseError("char x".to_string()))?;
            let y: i64 = caps["y"]
                .parse()
                .map_err(|_| AppError::ParseError("char y".to_string()))?;
            let width: i64 = caps["width"]
                .parse()
                .map_err(|_| AppError::ParseError("char width".to_string()))?;
            let height: i64 = caps["height"]
                .parse()
                .map_err(|_| AppError::ParseError("char height".to_string()))?;
            let xoffset: i64 = caps["xoffset"]
                .parse()
                .map_err(|_| AppError::ParseError("char xoffset".to_string()))?;
            let yoffset: i64 = caps["yoffset"]
                .parse()
                .map_err(|_| AppError::ParseError("char yoffset".to_string()))?;
            let xadvance: i64 = caps["xadvance"]
                .parse()
                .map_err(|_| AppError::ParseError("char xadvance".to_string()))?;
            let page = caps["page"].to_string();
            let chnl = caps["chnl"].to_string();

            let (nx, ny, nw, nh, nxo, nyo, nxa) = if use_integer_div {
                let d = divide_by.max(1);
                (
                    scale_i64_div_ceil(x, d),
                    scale_i64_div_ceil(y, d),
                    scale_i64_div_floor(width, d),
                    scale_i64_div_floor(height, d),
                    scale_i64_div_ceil(xoffset, d),
                    scale_i64_div_ceil(yoffset, d),
                    scale_i64_div_ceil(xadvance, d),
                )
            } else {
                let s = f64::from(scale);
                (
                    (x as f64 * s).ceil() as i64,
                    (y as f64 * s).ceil() as i64,
                    (width as f64 * s).floor() as i64,
                    (height as f64 * s).floor() as i64,
                    (xoffset as f64 * s).ceil() as i64,
                    (yoffset as f64 * s).ceil() as i64,
                    (xadvance as f64 * s).ceil() as i64,
                )
            };

            char_entries.push(format!(
                "char id={id}     x={nx}   y={ny}   width={nw}   height={nh}   xoffset={nxo}   yoffset={nyo}   xadvance={nxa}   page={page}   chnl={chnl}"
            ));
        }
        if char_entries.len() != n {
            return Err(AppError::ParseError(format!(
                "fnt: expected {n} char lines, found {}",
                char_entries.len()
            )));
        }
    }

    let mut kerning_lines: Vec<String> = Vec::new();
    let mut had_kernings_section = false;
    if let Some(ki) = lines
        .iter()
        .position(|line| line.trim_start().starts_with("kernings count="))
    {
        had_kernings_section = true;
        let header = lines[ki].trim_start();
        let kn_str = header
            .strip_prefix("kernings count=")
            .ok_or_else(|| AppError::ParseError("fnt: kernings count line".to_string()))?
            .trim();
        let kn: usize = kn_str
            .parse()
            .map_err(|_| AppError::ParseError("kernings count value".to_string()))?;
        let mut j = ki + 1;
        while j < lines.len() && kerning_lines.len() < kn {
            let t = lines[j].trim_start();
            j += 1;
            if !t.starts_with("kerning ") {
                continue;
            }
            let Some(caps) = kerning_re.captures(t) else {
                continue;
            };
            let first = caps["first"].to_string();
            let second = caps["second"].to_string();
            let amount: i64 = caps["amount"]
                .parse()
                .map_err(|_| AppError::ParseError("kerning amount".to_string()))?;
            let na = if use_integer_div {
                scale_i64_div_ceil(amount, divide_by.max(1))
            } else {
                (amount as f64 * f64::from(scale)).ceil() as i64
            };
            kerning_lines.push(format!("kerning first={first} second={second} amount={na}"));
        }
        if kerning_lines.len() != kn {
            return Err(AppError::ParseError(format!(
                "fnt: expected {kn} kerning lines, found {}",
                kerning_lines.len()
            )));
        }
    }

    let relative_file = fnt_path
        .strip_prefix(input_root)
        .map_err(|_| AppError::InvalidOperation("failed to compute relative .fnt path"))?;
    let relative_dir = relative_file
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    let bundle_stem = PathBuf::from(source_stem);
    let relative_sheet: PathBuf = if relative_dir.as_os_str().is_empty() {
        bundle_stem
    } else {
        relative_dir.join(source_stem)
    };
    let dest_dir = flattened_bundle_output_dir(porter_output_root, &relative_sheet);
    fs::create_dir_all(&dest_dir).map_err(|e| AppError::IoError(e.to_string()))?;

    let out_fnt_name = page_file_plain
        .rsplit_once('.')
        .map(|(s, _)| format!("{s}.fnt"))
        .unwrap_or_else(|| format!("{page_file_plain}.fnt"));
    let out_path = dest_dir.join(out_fnt_name);

    let mut out = String::new();
    out.push_str(&format!(
        "info face={} size={new_size} bold={} italic={} charset={} unicode={} stretchH={} smooth={} aa={} padding={} spacing={}",
        &info_caps["face"],
        &info_caps["bold"],
        &info_caps["italic"],
        &info_caps["charset"],
        &info_caps["unicode"],
        &info_caps["stretchH"],
        &info_caps["smooth"],
        &info_caps["aa"],
        &info_caps["padding"],
        &info_caps["spacing"],
    ));
    out.push_str(&format!(
        "\ncommon lineHeight={new_line_height} base={new_base} scaleW={new_scale_w} scaleH={new_scale_h} pages={} packed={}",
        &common_caps["pages"], &common_caps["packed"]
    ));
    out.push_str(&format!("\npage id={page_id} file={page_file_output}"));
    if had_chars_section {
        out.push_str(&format!("\nchars count={}", char_entries.len()));
        for line in &char_entries {
            out.push('\n');
            out.push_str(line);
        }
    }
    if had_kernings_section {
        out.push_str(&format!("\nkernings count={}", kerning_lines.len()));
        for line in &kerning_lines {
            out.push('\n');
            out.push_str(line);
        }
    }

    fs::write(&out_path, out).map_err(|e| AppError::IoError(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod port_rename_tests {
    use std::path::{Path, PathBuf};

    use crate::core::contracts::PorterOptions;

    use super::{
        flattened_bundle_output_dir, port_rename_identifier, port_rename_identifier_force_low,
        port_source_tier_from_stem, porter_medium_and_low_linear_scales, PortSourceGraphicsTier,
    };

    fn porter_opts(low_port: bool, _auto_adjust: bool) -> PorterOptions {
        PorterOptions {
            low_port,
            dimensions: None,
            sheet_concurrency: 1,
        }
    }

    #[test]
    fn uhd_source_only_uhd_to_hd() {
        let t = PortSourceGraphicsTier::Uhd;
        assert_eq!(port_rename_identifier("icons-uhd", t), "icons-hd");
        assert_eq!(port_rename_identifier("icons-hd", t), "icons-hd");
        assert_eq!(
            port_rename_identifier("sheet-uhd-extra", t),
            "sheet-hd-extra"
        );
    }

    #[test]
    fn hd_source_only_hd_stripped() {
        let t = PortSourceGraphicsTier::Hd;
        assert_eq!(port_rename_identifier("icons-uhd", t), "icons-uhd");
        assert_eq!(port_rename_identifier("icons-hd", t), "icons");
        assert_eq!(port_rename_identifier("sheet-hd-extra", t), "sheet-extra");
    }

    #[test]
    fn tier_from_stem_prefers_uhd_token() {
        assert_eq!(
            port_source_tier_from_stem("icons-uhd"),
            PortSourceGraphicsTier::Uhd
        );
        assert_eq!(
            port_source_tier_from_stem("icons-hd"),
            PortSourceGraphicsTier::Hd
        );
        assert_eq!(
            port_source_tier_from_stem("Icons"),
            PortSourceGraphicsTier::Low
        );
    }

    #[test]
    fn force_low_ports_uhd_and_hd_to_low_names() {
        assert_eq!(port_rename_identifier_force_low("icons-uhd"), "icons");
        assert_eq!(port_rename_identifier_force_low("icons-hd"), "icons");
        assert_eq!(
            port_rename_identifier_force_low("sheet-uhd-extra"),
            "sheet-extra"
        );
    }

    #[test]
    fn flattened_output_matches_merger_rule() {
        let root = PathBuf::from("out/Ported");
        assert_eq!(
            flattened_bundle_output_dir(&root, Path::new("Icons")),
            PathBuf::from("out/Ported/icons")
        );
        assert_eq!(
            flattened_bundle_output_dir(&root, Path::new("mods/pack/Icons")),
            PathBuf::from("out/Ported/mods/pack")
        );
    }

    #[test]
    fn dual_scales_none_when_low_port_off() {
        let o = porter_opts(false, false);
        assert!(
            porter_medium_and_low_linear_scales(100, 100, PortSourceGraphicsTier::Uhd, &o)
                .is_none()
        );
    }

    #[test]
    fn dual_scales_uhd_half_then_quarter_linear() {
        let o = porter_opts(true, false);
        assert_eq!(
            porter_medium_and_low_linear_scales(4096, 4096, PortSourceGraphicsTier::Uhd, &o),
            Some((0.5, 0.25))
        );
    }

    #[test]
    fn dual_scales_hd_full_then_half_linear() {
        let o = porter_opts(true, false);
        assert_eq!(
            porter_medium_and_low_linear_scales(2048, 2048, PortSourceGraphicsTier::Hd, &o),
            Some((1.0, 0.5))
        );
    }

    #[test]
    fn dual_scales_low_tier_returns_none() {
        let o = porter_opts(true, false);
        assert!(
            porter_medium_and_low_linear_scales(100, 100, PortSourceGraphicsTier::Low, &o)
                .is_none()
        );
    }
}
