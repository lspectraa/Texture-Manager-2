//! Live preview for Glow Maker: random UHD icon from GD `Resources/icons` + glow-under-icon composite.

use std::collections::BTreeMap;
use std::io::Cursor;
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use image::imageops::overlay;
use image::{ImageFormat, RgbaImage};
use plist::Value;
use rand::RngExt;

use crate::core::contracts::{phase_defaults, GlowMakerOptions};
use crate::core::discovery::{discover_sheet_pairs, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::game_files::GameFilesLayout;
use crate::core::glow::render_icon_glow_from_primary;
use crate::core::glow_composite::composite_icon_layers_for_glow;
use crate::core::splitter::split_sheet_candidate_memory;

#[derive(Clone)]
struct PreviewIconSample {
    primary: RgbaImage,
    primary_frame: String,
    sprites: BTreeMap<String, RgbaImage>,
    plist_root: Value,
}

struct CachedPreviewSample {
    resources_key: String,
    sample: PreviewIconSample,
}

static PREVIEW_SAMPLE: Mutex<Option<CachedPreviewSample>> = Mutex::new(None);

fn clamp_glow_options(options: &GlowMakerOptions) -> GlowMakerOptions {
    GlowMakerOptions {
        thickness: options.thickness.clamp(1, 128),
        tolerance: options.tolerance,
        dimensions: options.dimensions.clone(),
        rainbow_glow: options.rainbow_glow,
        composite_layers: options.composite_layers,
    }
}

/// Primary icon frame (`*_001.png`), excluding glow/secondary/extra variants.
fn is_icon_primary_frame(frame_name: &str) -> bool {
    let lower = frame_name.to_ascii_lowercase();
    if !lower.ends_with("_001.png") {
        return false;
    }
    if lower.contains("_glow_") {
        return false;
    }
    if lower.ends_with("_2_001.png")
        || lower.ends_with("_3_001.png")
        || lower.ends_with("_extra_001.png")
    {
        return false;
    }
    true
}

/// UFO (`bird_` / `ufo_`), robot, and spider sheets are multi-part or awkward for a single-sprite preview.
fn is_excluded_preview_icon_stem(stem: &str) -> bool {
    let lower = stem.to_ascii_lowercase();
    let base = lower
        .strip_suffix("-uhd")
        .or_else(|| lower.strip_suffix("-hd"))
        .unwrap_or(lower.as_str());
    base.starts_with("bird_")
        || base.starts_with("ufo_")
        || base.starts_with("robot_")
        || base.starts_with("spider_")
}

fn uhd_icon_sheet_pairs(icons_dir: &std::path::Path) -> Result<Vec<SheetCandidate>, AppError> {
    let pairs: Vec<SheetCandidate> = discover_sheet_pairs(icons_dir)?
        .into_iter()
        .filter(|pair| {
            let stem = pair.stem.to_ascii_lowercase();
            stem.ends_with("-uhd") && !is_excluded_preview_icon_stem(&pair.stem)
        })
        .collect();
    Ok(pairs)
}

fn load_random_uhd_preview_icon(layout: &GameFilesLayout) -> Result<PreviewIconSample, AppError> {
    if !layout.geometry_dash_found() {
        return Err(AppError::InvalidOperation(
            "Geometry Dash is not configured for glow preview",
        ));
    }

    let icons_dir = layout.resources.join("icons");
    if !icons_dir.is_dir() {
        return Err(AppError::InvalidPath(
            "Geometry Dash Resources/icons folder not found",
        ));
    }

    let pairs = uhd_icon_sheet_pairs(&icons_dir)?;
    if pairs.is_empty() {
        return Err(AppError::InvalidOperation(
            "No eligible -uhd icon sheets found under Resources/icons (UFO, robot, and spider are excluded)",
        ));
    }

    let sheet_idx = rand::rng().random_range(0..pairs.len());
    let pair = &pairs[sheet_idx];
    let splitter_opts = phase_defaults().splitter;
    let split = split_sheet_candidate_memory(pair, &splitter_opts, || {})?;

    let mut primaries: Vec<String> = split
        .sprites
        .keys()
        .filter(|name| is_icon_primary_frame(name))
        .cloned()
        .collect();
    primaries.sort();
    if primaries.is_empty() {
        return Err(AppError::InvalidOperation(
            "selected -uhd icon sheet has no primary frames",
        ));
    }

    let frame_idx = rand::rng().random_range(0..primaries.len());
    let primary_frame = primaries[frame_idx].clone();
    let primary = split
        .sprites
        .get(&primary_frame)
        .cloned()
        .ok_or(AppError::InvalidOperation(
            "failed to resolve primary frame for glow preview",
        ))?;

    Ok(PreviewIconSample {
        primary,
        primary_frame,
        sprites: split.sprites,
        plist_root: split.plist_root,
    })
}

fn preview_icon_sample(
    layout: &GameFilesLayout,
    refresh: bool,
) -> Result<PreviewIconSample, AppError> {
    let resources_key = layout.resources.to_string_lossy().to_string();
    let mut guard = PREVIEW_SAMPLE
        .lock()
        .map_err(|_| AppError::InvalidOperation("glow preview cache lock poisoned"))?;

    if !refresh {
        if let Some(cached) = guard.as_ref() {
            if cached.resources_key == resources_key {
                return Ok(cached.sample.clone());
            }
        }
    }

    let sample = load_random_uhd_preview_icon(layout)?;
    *guard = Some(CachedPreviewSample {
        resources_key,
        sample: sample.clone(),
    });
    Ok(sample)
}

fn glow_source_for_preview(
    options: &GlowMakerOptions,
    sample: &PreviewIconSample,
) -> RgbaImage {
    if !options.composite_layers {
        return sample.primary.clone();
    }

    match composite_icon_layers_for_glow(
        &sample.sprites,
        &sample.plist_root,
        &sample.primary_frame,
    ) {
        Ok(Some(composite)) => composite,
        Ok(None) | Err(_) => sample.primary.clone(),
    }
}

/// Glow behind the display icon (primary always on top for readability).
fn compose_glow_under_icon(glow: &RgbaImage, icon: &RgbaImage) -> RgbaImage {
    let pad_x = glow.width().saturating_sub(icon.width()) / 2;
    let pad_y = glow.height().saturating_sub(icon.height()) / 2;
    let mut out = glow.clone();
    overlay(&mut out, icon, pad_x as i64, pad_y as i64);
    out
}

fn rgba_to_png_data_url(img: &RgbaImage) -> Result<String, AppError> {
    let mut bytes = Vec::new();
    {
        let mut cursor = Cursor::new(&mut bytes);
        img.write_to(&mut cursor, ImageFormat::Png).map_err(|err| {
            AppError::ParseError(format!("failed to encode glow preview PNG: {err}"))
        })?;
    }
    let b64 = BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{b64}"))
}

/// Generate a PNG data URL of a random UHD game icon with glow behind it.
///
/// When `refresh` is true, discard the cached sample and pick a new random icon.
pub fn glow_maker_preview_data_url(
    layout: &GameFilesLayout,
    options: &GlowMakerOptions,
    refresh: bool,
) -> Result<String, AppError> {
    let options = clamp_glow_options(options);
    let sample = preview_icon_sample(layout, refresh)?;
    let source = glow_source_for_preview(&options, &sample);
    let glow = render_icon_glow_from_primary(&source, &options);
    let composed = compose_glow_under_icon(&glow, &sample.primary);
    rgba_to_png_data_url(&composed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn default_options(composite: bool, rainbow: bool) -> GlowMakerOptions {
        GlowMakerOptions {
            thickness: 3,
            tolerance: 6,
            dimensions: None,
            rainbow_glow: rainbow,
            composite_layers: composite,
        }
    }

    fn tiny_primary() -> RgbaImage {
        RgbaImage::from_pixel(12, 12, Rgba([72, 168, 255, 255]))
    }

    #[test]
    fn is_icon_primary_frame_filters_variants() {
        assert!(is_icon_primary_frame("player_12_001.png"));
        assert!(!is_icon_primary_frame("player_12_glow_001.png"));
        assert!(!is_icon_primary_frame("player_12_2_001.png"));
        assert!(!is_icon_primary_frame("player_12_extra_001.png"));
        assert!(!is_icon_primary_frame("player_12_002.png"));
    }

    #[test]
    fn excluded_preview_stems_cover_ufo_robot_spider() {
        assert!(is_excluded_preview_icon_stem("bird_01-uhd"));
        assert!(is_excluded_preview_icon_stem("bird_42-hd"));
        assert!(is_excluded_preview_icon_stem("ufo_01-uhd"));
        assert!(is_excluded_preview_icon_stem("robot_01_01-uhd"));
        assert!(is_excluded_preview_icon_stem("spider_05_03-uhd"));
        assert!(!is_excluded_preview_icon_stem("player_12-uhd"));
        assert!(!is_excluded_preview_icon_stem("ship_03-uhd"));
        assert!(!is_excluded_preview_icon_stem("player_ball_01-uhd"));
        assert!(!is_excluded_preview_icon_stem("dart_02-uhd"));
        assert!(!is_excluded_preview_icon_stem("swing_01-uhd"));
    }

    #[test]
    fn preview_glow_pixels_match_render_icon_glow_from_primary() {
        let options = clamp_glow_options(&default_options(false, true));
        let source = tiny_primary();
        let expected_glow = render_icon_glow_from_primary(&source, &options);
        let composed = compose_glow_under_icon(&expected_glow, &source);

        assert_eq!(composed.width(), expected_glow.width());
        assert_eq!(composed.height(), expected_glow.height());

        for (x, y) in [
            (0u32, 0u32),
            (expected_glow.width() - 1, 0),
            (0, expected_glow.height() - 1),
            (expected_glow.width() - 1, expected_glow.height() - 1),
        ] {
            assert_eq!(
                composed.get_pixel(x, y),
                expected_glow.get_pixel(x, y),
                "glow-only pixel at ({x},{y}) must equal render_icon_glow_from_primary"
            );
        }

        let mut saw_colored_glow = false;
        for pixel in expected_glow.pixels() {
            let [r, g, b, a] = pixel.0;
            if a > 0 && (r != 255 || g != 255 || b != 255) {
                saw_colored_glow = true;
                break;
            }
        }
        assert!(
            saw_colored_glow,
            "rainbow preview must apply render_icon_glow_from_primary rainbow gradient"
        );
    }

    #[test]
    fn thickness_clamped_to_valid_range() {
        let mut opts = default_options(false, false);
        opts.thickness = 0;
        assert_eq!(clamp_glow_options(&opts).thickness, 1);
        opts.thickness = 999;
        assert_eq!(clamp_glow_options(&opts).thickness, 128);
    }
}
