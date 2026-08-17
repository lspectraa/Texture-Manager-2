use std::collections::BTreeMap;

use image::imageops::overlay;
use image::{Rgba, RgbaImage};
use plist::{Dictionary, Value};

use crate::core::errors::AppError;
use crate::core::plist::{parse_pair, PointF32};

#[derive(Clone, Copy)]
struct LayerSpec {
    role: &'static str,
    suffix: &'static str,
}

const COMPOSITE_LAYER_ORDER: [LayerSpec; 3] = [
    LayerSpec {
        role: "secondary",
        suffix: "_2_001",
    },
    LayerSpec {
        role: "primary",
        suffix: "_001",
    },
    LayerSpec {
        role: "extra",
        suffix: "_extra_001",
    },
];

fn strip_png_extension(name: &str) -> &str {
    name.strip_suffix(".png")
        .or_else(|| name.strip_suffix(".PNG"))
        .unwrap_or(name)
}

fn normalize_frame_key(name: &str) -> String {
    strip_png_extension(name).to_ascii_lowercase()
}

/// Match icon editor stem rules: `{type}_{number}` from frame names like `player_01_001`.
pub fn icon_stem_from_frame_name(name: &str) -> Option<String> {
    let base = strip_png_extension(name);
    let lower = base.to_ascii_lowercase();

    if lower.ends_with("_extra_001") {
        return Some(base[..base.len().saturating_sub("_extra_001".len())].to_string());
    }
    if lower.ends_with("_glow_001") {
        return Some(base[..base.len().saturating_sub("_glow_001".len())].to_string());
    }
    if lower.ends_with("_3_001") {
        return Some(base[..base.len().saturating_sub("_3_001".len())].to_string());
    }
    if lower.ends_with("_2_001") {
        return Some(base[..base.len().saturating_sub("_2_001".len())].to_string());
    }
    if lower.ends_with("_001") && !lower.ends_with("_2_001") && !lower.ends_with("_3_001") {
        let before = base.strip_suffix("_001")?;
        let last_underscore = before.rfind('_')?;
        let number = &before[last_underscore + 1..];
        if number.is_empty() || !number.chars().all(|ch| ch.is_ascii_digit()) {
            return None;
        }
        return Some(before.to_string());
    }
    None
}

fn find_sprite_key<'a>(
    sprites: &'a BTreeMap<String, RgbaImage>,
    canonical: &str,
) -> Option<&'a str> {
    let target = normalize_frame_key(canonical);
    sprites
        .keys()
        .find(|key| normalize_frame_key(key) == target)
        .map(String::as_str)
}

fn find_frame_dict_key<'a>(frames: &'a Dictionary, sprite_key: &str) -> Option<&'a str> {
    let target = normalize_frame_key(sprite_key);
    frames
        .keys()
        .find(|key| normalize_frame_key(key) == target)
        .map(String::as_str)
}

fn frames_dictionary(root: &Value) -> Result<&Dictionary, AppError> {
    root.as_dictionary()
        .and_then(|dict| dict.get("frames"))
        .and_then(Value::as_dictionary)
        .ok_or_else(|| {
            AppError::ParseError("plist missing top-level `frames` dictionary".to_string())
        })
}

fn frame_sprite_offset(frames: &Dictionary, sprite_key: &str) -> PointF32 {
    let frame_key = find_frame_dict_key(frames, sprite_key).unwrap_or(sprite_key);
    let Some(frame_dict) = frames.get(frame_key).and_then(Value::as_dictionary) else {
        return PointF32 { x: 0.0, y: 0.0 };
    };
    let raw = frame_dict
        .get("spriteOffset")
        .and_then(Value::as_string)
        .unwrap_or("{0,0}");
    parse_pair(raw).unwrap_or(PointF32 { x: 0.0, y: 0.0 })
}

/// Node-origin pixel inside a trimmed sprite image (Icon Editor convention).
///
/// TexturePacker `spriteOffset` shifts the trimmed sprite relative to the node
/// origin; with CSS/canvas Y-down this maps to:
/// `anchor = (w/2 - offset.x, h/2 + offset.y)`.
pub fn trimmed_sprite_anchor(width: u32, height: u32, offset: PointF32) -> (f32, f32) {
    (
        width as f32 / 2.0 - offset.x,
        height as f32 / 2.0 + offset.y,
    )
}

/// Public wrapper for gamesheet / icon frame `spriteOffset` lookups.
pub fn sprite_offset_for_frame(plist_root: &Value, frame_key: &str) -> PointF32 {
    match frames_dictionary(plist_root) {
        Ok(frames) => frame_sprite_offset(frames, frame_key),
        Err(_) => PointF32 { x: 0.0, y: 0.0 },
    }
}

fn layer_center_relative_to_primary(
    layer_offset: PointF32,
    primary_offset: PointF32,
) -> (f32, f32) {
    (
        layer_offset.x - primary_offset.x,
        -(layer_offset.y - primary_offset.y),
    )
}

fn overlay_centered(canvas: &mut RgbaImage, sprite: &RgbaImage, center_x: f32, center_y: f32) {
    let top_left_x = (center_x - (sprite.width() as f32 / 2.0)).round() as i64;
    let top_left_y = (center_y - (sprite.height() as f32 / 2.0)).round() as i64;
    overlay(canvas, sprite, top_left_x, top_left_y);
}

struct CompositeLayer {
    image: RgbaImage,
    center_x: f32,
    center_y: f32,
}

/// Combine primary, secondary, and extra (when present) into one aligned RGBA image.
///
/// Layers are centered on plist `spriteOffset` anchors, matching icon editor layout.
/// Returns `(image, anchor_x, anchor_y)` where the anchor is the Cocos/node origin
/// inside the image (primary center adjusted by primary `spriteOffset`).
pub fn composite_icon_layers_for_glow(
    sprites: &BTreeMap<String, RgbaImage>,
    plist_root: &Value,
    primary_frame_key: &str,
) -> Result<Option<(RgbaImage, f32, f32)>, AppError> {
    let stem = match icon_stem_from_frame_name(primary_frame_key) {
        Some(stem) => stem,
        None => return Ok(None),
    };

    let frames = frames_dictionary(plist_root)?;
    let primary_key = find_sprite_key(sprites, primary_frame_key)
        .or_else(|| find_sprite_key(sprites, &format!("{stem}_001")))
        .ok_or_else(|| {
            AppError::ParseError(format!(
                "composite glow could not resolve primary frame for `{primary_frame_key}`"
            ))
        })?;
    let primary_offset = frame_sprite_offset(frames, primary_key);

    let mut layers: Vec<CompositeLayer> = Vec::new();
    for spec in COMPOSITE_LAYER_ORDER {
        let canonical = format!("{stem}{}", spec.suffix);
        let Some(frame_key) = find_sprite_key(sprites, &canonical) else {
            if spec.role == "primary" {
                return Err(AppError::ParseError(format!(
                    "composite glow missing required primary frame `{canonical}`"
                )));
            }
            continue;
        };
        let Some(image) = sprites.get(frame_key).cloned() else {
            continue;
        };
        let offset = frame_sprite_offset(frames, frame_key);
        let (center_x, center_y) = layer_center_relative_to_primary(offset, primary_offset);
        layers.push(CompositeLayer {
            image,
            center_x,
            center_y,
        });
    }

    if layers.len() <= 1 {
        return Ok(None);
    }

    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;
    for layer in &layers {
        let half_w = layer.image.width() as f32 / 2.0;
        let half_h = layer.image.height() as f32 / 2.0;
        min_x = min_x.min(layer.center_x - half_w);
        min_y = min_y.min(layer.center_y - half_h);
        max_x = max_x.max(layer.center_x + half_w);
        max_y = max_y.max(layer.center_y + half_h);
    }

    let canvas_w = (max_x - min_x).ceil().max(1.0) as u32;
    let canvas_h = (max_y - min_y).ceil().max(1.0) as u32;
    let mut canvas = RgbaImage::from_pixel(canvas_w, canvas_h, Rgba([0, 0, 0, 0]));

    for layer in &layers {
        let center_x = layer.center_x - min_x;
        let center_y = layer.center_y - min_y;
        overlay_centered(&mut canvas, &layer.image, center_x, center_y);
    }

    // Primary image-center is at (-min_x, -min_y); node origin is offset from that.
    let primary_center_x = -min_x;
    let primary_center_y = -min_y;
    let anchor_x = primary_center_x - primary_offset.x;
    let anchor_y = primary_center_y + primary_offset.y;

    Ok(Some((canvas, anchor_x, anchor_y)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icon_stem_parses_primary_secondary_and_extra_names() {
        assert_eq!(
            icon_stem_from_frame_name("player_12_001.png"),
            Some("player_12".to_string())
        );
        assert_eq!(
            icon_stem_from_frame_name("player_12_2_001"),
            Some("player_12".to_string())
        );
        assert_eq!(
            icon_stem_from_frame_name("player_12_extra_001.png"),
            Some("player_12".to_string())
        );
        assert_eq!(icon_stem_from_frame_name("Viper_WaterMark.png"), None);
    }
}
