//! Single-frame sprite lookup in stock Geometry Dash gamesheets.
//!
//! The Particle Editor preview draws the real in-game object a specialized
//! effect attaches to (portal, speed pad, jump ring, …) instead of a generic
//! cube. The sheet/frame pair comes from the frontend effect catalog; this
//! module resolves it against `{GD}/Resources` and returns a PNG data URL plus
//! the Cocos/node origin inside that image (`spriteOffset` anchor).

use std::io::Cursor;
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use image::ImageFormat;
use plist::Value;
use serde::Serialize;

use crate::core::contracts::phase_defaults;
use crate::core::errors::AppError;
use crate::core::game_files::GameFilesLayout;
use crate::core::glow_composite::{sprite_offset_for_frame, trimmed_sprite_anchor};
use crate::core::safe_fs::is_safe_path_segment;
use crate::core::splitter::extract_frame_image;

/// PNG data URL + node-origin pixel inside the image (Icon Editor / TexturePacker).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticlePreviewSprite {
    pub data_url: String,
    /// X of the Cocos node origin within the image (from the left edge).
    pub anchor_x: f32,
    /// Y of the Cocos node origin within the image (from the top edge).
    pub anchor_y: f32,
}

/// Decoded sprites are small and few (one per specialized effect), so a flat
/// keyed list beats a hash map here and keeps the static const-constructible.
static SPRITE_CACHE: Mutex<Vec<(String, ParticlePreviewSprite)>> = Mutex::new(Vec::new());

fn cache_key(resources_key: &str, sheet_stem: &str, frame_name: &str) -> String {
    format!("{resources_key}|{sheet_stem}|{frame_name}")
}

fn cached_sprite(key: &str) -> Option<ParticlePreviewSprite> {
    let guard = SPRITE_CACHE.lock().ok()?;
    guard
        .iter()
        .find(|(cached, _)| cached == key)
        .map(|(_, sprite)| sprite.clone())
}

fn store_sprite(key: String, sprite: &ParticlePreviewSprite) {
    if let Ok(mut guard) = SPRITE_CACHE.lock() {
        guard.push((key, sprite.clone()));
    }
}

fn rgba_to_preview_sprite(
    img: &image::RgbaImage,
    anchor_x: f32,
    anchor_y: f32,
) -> Result<ParticlePreviewSprite, AppError> {
    let mut bytes = Vec::new();
    {
        let mut cursor = Cursor::new(&mut bytes);
        img.write_to(&mut cursor, ImageFormat::Png).map_err(|err| {
            AppError::ParseError(format!("failed to encode sheet frame PNG: {err}"))
        })?;
    }
    Ok(ParticlePreviewSprite {
        data_url: format!("data:image/png;base64,{}", BASE64_STANDARD.encode(&bytes)),
        anchor_x,
        anchor_y,
    })
}

/// Anchored PNG for `frame_name` inside `{Resources}/{sheet_stem}.plist` + `.png`.
///
/// Both identifiers must be plain file-name segments; anything with separators
/// or traversal components is rejected before touching the filesystem.
pub fn particle_editor_sheet_frame_data_url(
    layout: &GameFilesLayout,
    sheet_stem: &str,
    frame_name: &str,
) -> Result<ParticlePreviewSprite, AppError> {
    if !layout.geometry_dash_found() {
        return Err(AppError::InvalidOperation(
            "Geometry Dash is not configured for particle preview sprites",
        ));
    }
    if !is_safe_path_segment(sheet_stem) || !is_safe_path_segment(frame_name) {
        return Err(AppError::InvalidPath(
            "sheet and frame names must be plain file-name segments",
        ));
    }

    let resources_key = layout.resources.to_string_lossy().to_string();
    let key = cache_key(&resources_key, sheet_stem, frame_name);
    if let Some(hit) = cached_sprite(&key) {
        return Ok(hit);
    }

    let plist_path = layout.resources.join(format!("{sheet_stem}.plist"));
    let png_path = layout.resources.join(format!("{sheet_stem}.png"));
    if !plist_path.is_file() || !png_path.is_file() {
        return Err(AppError::InvalidPath(
            "gamesheet plist/png pair not found in Resources",
        ));
    }

    let mut plist_root = Value::from_file(&plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse gamesheet plist: {err}")))?;
    let source_image = image::open(&png_path)
        .map_err(|err| AppError::ParseError(format!("failed to open gamesheet png: {err}")))?;
    let splitter_options = phase_defaults().splitter;
    let offset = sprite_offset_for_frame(&plist_root, frame_name);
    let sprite = {
        let frames = plist_root
            .as_dictionary_mut()
            .and_then(|root| root.get_mut("frames"))
            .and_then(Value::as_dictionary_mut)
            .ok_or(AppError::ParseError(
                "gamesheet plist missing top-level `frames` dictionary".to_string(),
            ))?;
        let frame_dict = frames
            .get_mut(frame_name)
            .and_then(Value::as_dictionary_mut)
            .ok_or(AppError::ParseError(format!(
                "frame `{frame_name}` not found in `{sheet_stem}`"
            )))?;
        extract_frame_image(&source_image, frame_dict, &splitter_options)?.to_rgba8()
    };

    let (anchor_x, anchor_y) = trimmed_sprite_anchor(sprite.width(), sprite.height(), offset);
    let payload = rgba_to_preview_sprite(&sprite, anchor_x, anchor_y)?;
    store_sprite(key, &payload);
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_separates_sheet_and_frame() {
        assert_ne!(
            cache_key("res", "GJ_GameSheet02-uhd", "portal_01_front_001.png"),
            cache_key("res", "GJ_GameSheet02-uhd", "portal_02_front_001.png"),
        );
        assert_eq!(
            cache_key("res", "sheet", "frame.png"),
            cache_key("res", "sheet", "frame.png"),
        );
    }

    #[test]
    fn unsafe_segments_are_rejected_before_io() {
        assert!(!is_safe_path_segment("../GJ_GameSheet02-uhd"));
        assert!(!is_safe_path_segment("sub/dir.png"));
        assert!(is_safe_path_segment("portal_01_front_001.png"));
    }
}
