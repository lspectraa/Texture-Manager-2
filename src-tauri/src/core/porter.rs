use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use image::imageops::{self, FilterType};
use image::RgbaImage;
use plist::{Dictionary, Value};

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
        PortPlistRenameMode::MediumFromUhd => port_rename_identifier(value, PortSourceGraphicsTier::Uhd),
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

fn scale_rect_or_pair_string(raw: &str, scale: f32, is_texture_rect: bool) -> Result<String, AppError> {
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
    Some((nums[0].floor().max(0.0) as u32, nums[1].floor().max(0.0) as u32))
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
    crate::core::image_io::save_rgba_png_fast(&output_png, atlas)?;
    plist_root
        .to_file_xml(output_plist)
        .map_err(|e| AppError::IoError(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod port_rename_tests {
    use std::path::{Path, PathBuf};

    use crate::core::contracts::PorterOptions;

    use super::{
        flattened_bundle_output_dir, porter_medium_and_low_linear_scales, port_rename_identifier,
        port_rename_identifier_force_low, port_source_tier_from_stem, PortSourceGraphicsTier,
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
        assert_eq!(port_rename_identifier("sheet-uhd-extra", t), "sheet-hd-extra");
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
        assert_eq!(port_source_tier_from_stem("icons-uhd"), PortSourceGraphicsTier::Uhd);
        assert_eq!(port_source_tier_from_stem("icons-hd"), PortSourceGraphicsTier::Hd);
        assert_eq!(port_source_tier_from_stem("Icons"), PortSourceGraphicsTier::Low);
    }

    #[test]
    fn force_low_ports_uhd_and_hd_to_low_names() {
        assert_eq!(port_rename_identifier_force_low("icons-uhd"), "icons");
        assert_eq!(port_rename_identifier_force_low("icons-hd"), "icons");
        assert_eq!(port_rename_identifier_force_low("sheet-uhd-extra"), "sheet-extra");
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
        assert!(porter_medium_and_low_linear_scales(100, 100, PortSourceGraphicsTier::Uhd, &o).is_none());
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
        assert!(porter_medium_and_low_linear_scales(100, 100, PortSourceGraphicsTier::Low, &o).is_none());
    }
}
