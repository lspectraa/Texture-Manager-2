//! Live preview for Glow Maker: random UHD icon from GD `Resources/icons` + glow-under-icon composite.

use std::collections::BTreeMap;
use std::io::Cursor;
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use image::imageops::overlay;
use image::{ImageFormat, Rgba, RgbaImage};
use plist::Value;
use rand::RngExt;

use crate::core::contracts::{phase_defaults, GlowMakerOptions};
use crate::core::discovery::{discover_sheet_pairs, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::game_files::GameFilesLayout;
use crate::core::glow::render_icon_glow_from_primary;
use crate::core::glow_composite::{
    composite_icon_layers_for_glow, icon_stem_from_frame_name, sprite_offset_for_frame,
    trimmed_sprite_anchor,
};
use crate::core::icon_editor::icon_editor_load_sheet_sprites_from_atlas;
use crate::core::particle_sprites::ParticlePreviewSprite;
use crate::core::safe_fs::join_under_parent;
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

/// Which preview consumes the random icon; each has its own exclusion rules and cache.
#[derive(Clone, Copy, PartialEq, Eq)]
enum PreviewIconAudience {
    /// Glow Maker live preview.
    GlowMaker,
    /// Particle Editor silhouette (cubes, ships, balls, … — not UFO/robot/spider/wave/swing).
    ParticleSilhouette,
    /// Particle Editor ship-drag silhouette — only `ship_*` UHD sheets.
    ParticleShip,
}

static GLOW_PREVIEW_SAMPLE: Mutex<Option<CachedPreviewSample>> = Mutex::new(None);
static PARTICLE_PREVIEW_SAMPLE: Mutex<Option<CachedPreviewSample>> = Mutex::new(None);
static PARTICLE_SHIP_PREVIEW_SAMPLE: Mutex<Option<CachedPreviewSample>> = Mutex::new(None);

fn preview_sample_cache(
    audience: PreviewIconAudience,
) -> &'static Mutex<Option<CachedPreviewSample>> {
    match audience {
        PreviewIconAudience::GlowMaker => &GLOW_PREVIEW_SAMPLE,
        PreviewIconAudience::ParticleSilhouette => &PARTICLE_PREVIEW_SAMPLE,
        PreviewIconAudience::ParticleShip => &PARTICLE_SHIP_PREVIEW_SAMPLE,
    }
}

fn clamp_glow_options(options: &GlowMakerOptions) -> GlowMakerOptions {
    GlowMakerOptions {
        thickness: options.thickness.clamp(1, 128),
        tolerance: options.tolerance,
        dimensions: options.dimensions.clone(),
        rainbow_glow: options.rainbow_glow,
        composite_layers: options.composite_layers,
    }
}

/// Primary icon frame (`{kind}_{id}_001.png`), excluding glow/secondary/extra and
/// multi-part pieces (`*_capsule_001`, etc. — those need compositing or a blank preview).
fn is_icon_primary_frame(frame_name: &str) -> bool {
    let lower = frame_name.to_ascii_lowercase();
    if lower.contains("_glow") {
        return false;
    }
    if lower.ends_with("_2_001.png")
        || lower.ends_with("_3_001.png")
        || lower.ends_with("_extra_001.png")
        || lower.ends_with("_2_001")
        || lower.ends_with("_3_001")
        || lower.ends_with("_extra_001")
    {
        return false;
    }
    // Reject piece names like `bird_01_capsule_001` (stem parse requires `_{digits}_001`).
    icon_stem_from_frame_name(frame_name).is_some()
}

fn blank_preview_rgba() -> RgbaImage {
    RgbaImage::from_pixel(1, 1, Rgba([0, 0, 0, 0]))
}

/// UFO (`bird_` / `ufo_`), robot, and spider sheets are multi-part or awkward for a single-sprite preview.
///
/// The particle silhouette additionally drops waves (`dart_`) and swings, whose
/// sprites read poorly as an emitter attach object. Ship-drag previews only keep
/// `ship_*` sheets.
fn is_excluded_preview_icon_stem(stem: &str, audience: PreviewIconAudience) -> bool {
    let lower = stem.to_ascii_lowercase();
    let base = lower
        .strip_suffix("-uhd")
        .or_else(|| lower.strip_suffix("-hd"))
        .unwrap_or(lower.as_str());
    let shared = base.starts_with("bird_")
        || base.starts_with("ufo_")
        || base.starts_with("robot_")
        || base.starts_with("spider_");
    match audience {
        PreviewIconAudience::GlowMaker => shared,
        PreviewIconAudience::ParticleSilhouette => {
            shared || base.starts_with("dart_") || base.starts_with("swing_")
        }
        PreviewIconAudience::ParticleShip => !base.starts_with("ship_"),
    }
}

fn uhd_icon_sheet_pairs(
    icons_dir: &std::path::Path,
    audience: PreviewIconAudience,
) -> Result<Vec<SheetCandidate>, AppError> {
    let pairs: Vec<SheetCandidate> = discover_sheet_pairs(icons_dir)?
        .into_iter()
        .filter(|pair| {
            let stem = pair.stem.to_ascii_lowercase();
            stem.ends_with("-uhd") && !is_excluded_preview_icon_stem(&pair.stem, audience)
        })
        .collect();
    Ok(pairs)
}

#[derive(Clone, Copy)]
enum PrimaryFramePick {
    Random,
    First,
}

fn sample_from_sheet_candidate(
    pair: &SheetCandidate,
    primary_pick: PrimaryFramePick,
) -> Result<PreviewIconSample, AppError> {
    let splitter_opts = phase_defaults().splitter;
    let split = split_sheet_candidate_memory(pair, &splitter_opts, || {})?;

    let primary_frame = pick_preview_frame_name(&split.sprites, primary_pick)?;
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

fn sample_from_sheet_candidate_indexed(
    layout: &GameFilesLayout,
    pair: &SheetCandidate,
    primary_pick: PrimaryFramePick,
) -> Result<PreviewIconSample, AppError> {
    crate::core::sprite_index::try_index_sheet_pair(
        layout,
        &pair.relative_dir,
        &pair.stem,
        &pair.plist_path,
        &pair.png_path,
    );
    sample_from_sheet_candidate(pair, primary_pick)
}

/// Prefer GD primary frames (`{kind}_{id}_001.png`).
///
/// Custom single-sprite sheets may use exactly one non-glow frame. When only
/// multi-part piece names exist, prefer a compositable `{stem}_001` derived from
/// secondary/extra frames so composite preview can still run.
fn pick_preview_frame_name(
    sprites: &BTreeMap<String, RgbaImage>,
    primary_pick: PrimaryFramePick,
) -> Result<String, AppError> {
    let mut candidates: Vec<String> = sprites
        .keys()
        .filter(|name| is_icon_primary_frame(name))
        .cloned()
        .collect();
    if candidates.is_empty() {
        candidates = compositable_primary_keys(sprites);
    }
    if candidates.is_empty() {
        let fallback: Vec<String> = sprites
            .keys()
            .filter(|name| !is_preview_excluded_variant_frame(name))
            .cloned()
            .collect();
        // Only safe without compositing when there is a single unambiguous sprite.
        if fallback.len() == 1 {
            candidates = fallback;
        }
    }
    candidates.sort();
    candidates.dedup();
    if candidates.is_empty() {
        return Err(AppError::InvalidOperation(
            "icon sheet has no standalone sprite frame to preview without compositing",
        ));
    }

    Ok(match primary_pick {
        PrimaryFramePick::Random => {
            let frame_idx = rand::rng().random_range(0..candidates.len());
            candidates[frame_idx].clone()
        }
        PrimaryFramePick::First => candidates[0].clone(),
    })
}

/// `{stem}_001` keys present in `sprites` for any frame that yields an icon stem.
fn compositable_primary_keys(sprites: &BTreeMap<String, RgbaImage>) -> Vec<String> {
    let mut keys: Vec<String> = Vec::new();
    for name in sprites.keys() {
        let Some(stem) = icon_stem_from_frame_name(name) else {
            continue;
        };
        let canonical = format!("{stem}_001");
        if let Some(existing) = sprites.keys().find(|key| {
            let base = key
                .strip_suffix(".png")
                .or_else(|| key.strip_suffix(".PNG"))
                .unwrap_or(key.as_str());
            base.eq_ignore_ascii_case(&canonical)
        }) {
            if !keys.iter().any(|k| k.eq_ignore_ascii_case(existing)) {
                keys.push(existing.clone());
            }
        }
    }
    keys
}

fn is_preview_excluded_variant_frame(frame_name: &str) -> bool {
    let lower = frame_name.to_ascii_lowercase();
    lower.contains("_glow")
        || lower.contains("_2_001")
        || lower.contains("_3_001")
        || lower.contains("_extra_001")
}

fn rgba_has_visible_pixels(image: &RgbaImage) -> bool {
    image.pixels().any(|pixel| pixel.0[3] > 0)
}

/// Resolve PNG candidates beside a gamesheet plist.
///
/// Prefer `{plist_stem}.png` in the same folder (Glow Maker / Particle Editor
/// convention), then metadata `realTextureFileName` / `textureFileName` when that
/// file exists next to the plist.
fn resolve_custom_preview_png_candidates(
    plist_path: &std::path::Path,
    plist_root: &Value,
) -> Result<Vec<std::path::PathBuf>, AppError> {
    let plist_parent = plist_path
        .parent()
        .ok_or(AppError::InvalidPath("plist path has no parent directory"))?;
    let stem = plist_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or(AppError::InvalidPath("invalid icon plist file name"))?;

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    let push_unique = |path: std::path::PathBuf, out: &mut Vec<std::path::PathBuf>| {
        if path.is_file() && !out.iter().any(|existing| existing == &path) {
            out.push(path);
        }
    };

    push_unique(plist_parent.join(format!("{stem}.png")), &mut candidates);

    if let Some(metadata) = plist_root
        .as_dictionary()
        .and_then(|root| root.get("metadata"))
        .and_then(Value::as_dictionary)
    {
        for key in ["realTextureFileName", "textureFileName"] {
            let Some(file_name) = metadata.get(key).and_then(Value::as_string) else {
                continue;
            };
            let base_name = std::path::Path::new(file_name)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(file_name);
            push_unique(plist_parent.join(base_name), &mut candidates);
            if let Ok(scoped) = join_under_parent(plist_parent, file_name) {
                push_unique(scoped, &mut candidates);
            }
        }
    }

    if candidates.is_empty() {
        return Err(AppError::InvalidPath(
            "icon sheet PNG not found next to the selected plist (same folder / same stem)",
        ));
    }
    Ok(candidates)
}

fn sheet_candidate_for_custom_preview(
    plist_path: &std::path::Path,
    png_path: std::path::PathBuf,
) -> Result<SheetCandidate, AppError> {
    let stem = plist_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or(AppError::InvalidPath("invalid icon plist file name"))?
        .to_string();
    Ok(SheetCandidate {
        stem,
        relative_dir: std::path::PathBuf::new(),
        plist_path: plist_path.to_path_buf(),
        png_path,
    })
}

/// Prefer the picked primary when visible; otherwise the first visible GD primary frame.
/// Keeps multi-part sheets (for composite preview) even when no standalone-safe primary exists.
fn sample_with_visible_primary(mut sample: PreviewIconSample) -> Option<PreviewIconSample> {
    let primary_ok = rgba_has_visible_pixels(&sample.primary)
        && (is_icon_primary_frame(&sample.primary_frame) || sample.sprites.len() == 1);
    if primary_ok {
        return Some(sample);
    }

    let mut ordered: Vec<String> = sample
        .sprites
        .keys()
        .filter(|name| is_icon_primary_frame(name))
        .cloned()
        .collect();
    ordered.extend(compositable_primary_keys(&sample.sprites));
    ordered.sort();
    ordered.dedup();

    for name in ordered {
        if let Some(image) = sample.sprites.get(&name) {
            if rgba_has_visible_pixels(image) {
                sample.primary = image.clone();
                sample.primary_frame = name;
                return Some(sample);
            }
        }
    }

    // Retain sprites so composite preview can still run; blank primary signals
    // "not safe to show without compositing".
    if sample.sprites.len() > 1 {
        sample.primary = blank_preview_rgba();
        if sample.primary_frame.is_empty() || !sample.sprites.contains_key(&sample.primary_frame) {
            if let Some(key) = compositable_primary_keys(&sample.sprites)
                .into_iter()
                .next()
            {
                sample.primary_frame = key;
            }
        }
        return Some(sample);
    }

    None
}

fn sample_from_icon_editor_sprites(
    plist_root: Value,
    sprites: BTreeMap<String, RgbaImage>,
) -> Option<PreviewIconSample> {
    let primary_frame = pick_preview_frame_name(&sprites, PrimaryFramePick::First).ok()?;
    let primary = sprites.get(&primary_frame)?.clone();
    sample_with_visible_primary(PreviewIconSample {
        primary,
        primary_frame,
        sprites,
        plist_root,
    })
}

/// Load a preview icon from a user-supplied gamesheet plist + sibling PNG.
///
/// Uses the same splitter path as random GD icons. PNG resolution prefers
/// `{stem}.png` beside the plist, then metadata texture names in that folder.
fn load_preview_icon_from_plist_path(
    plist_path: &std::path::Path,
) -> Result<PreviewIconSample, AppError> {
    crate::core::safe_fs::ensure_existing_user_file(plist_path)?;
    let plist_root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse icon plist: {err}")))?;
    let png_candidates = resolve_custom_preview_png_candidates(plist_path, &plist_root)?;

    for png_path in &png_candidates {
        let pair = sheet_candidate_for_custom_preview(plist_path, png_path.clone())?;
        if let Ok(sample) = sample_from_sheet_candidate(&pair, PrimaryFramePick::First) {
            if let Some(visible) = sample_with_visible_primary(sample) {
                return Ok(visible);
            }
        }
    }

    // Fallback: Icon Editor crops against each PNG candidate.
    for png_path in &png_candidates {
        if let Ok((root, sprites)) =
            icon_editor_load_sheet_sprites_from_atlas(plist_path, png_path, plist_root.clone())
        {
            if let Some(visible) = sample_from_icon_editor_sprites(root, sprites) {
                return Ok(visible);
            }
        }
    }

    // Last resort: blank preview (do not pick an arbitrary multi-part piece).
    Ok(PreviewIconSample {
        primary: blank_preview_rgba(),
        primary_frame: String::new(),
        sprites: BTreeMap::new(),
        plist_root,
    })
}

fn load_random_uhd_preview_icon(
    layout: &GameFilesLayout,
    audience: PreviewIconAudience,
) -> Result<PreviewIconSample, AppError> {
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

    let pairs = uhd_icon_sheet_pairs(&icons_dir, audience)?;
    if pairs.is_empty() {
        let detail = match audience {
            PreviewIconAudience::ParticleShip => {
                "No eligible ship_-uhd icon sheets found under Resources/icons"
            }
            _ => {
                "No eligible -uhd icon sheets found under Resources/icons (UFO, robot, and spider are excluded)"
            }
        };
        return Err(AppError::InvalidOperation(detail));
    }

    let sheet_idx = rand::rng().random_range(0..pairs.len());
    let pair = &pairs[sheet_idx];
    sample_from_sheet_candidate_indexed(layout, pair, PrimaryFramePick::Random)
}

fn preview_icon_sample(
    layout: &GameFilesLayout,
    refresh: bool,
    audience: PreviewIconAudience,
    icon_plist_path: Option<&str>,
) -> Result<PreviewIconSample, AppError> {
    if let Some(raw) = icon_plist_path.map(str::trim).filter(|p| !p.is_empty()) {
        let path = crate::core::safe_fs::parse_user_absolute_path(raw)?;
        return load_preview_icon_from_plist_path(&path);
    }

    let resources_key = layout.resources.to_string_lossy().to_string();
    let mut guard = preview_sample_cache(audience)
        .lock()
        .map_err(|_| AppError::InvalidOperation("glow preview cache lock poisoned"))?;

    if !refresh {
        if let Some(cached) = guard.as_ref() {
            if cached.resources_key == resources_key {
                return Ok(cached.sample.clone());
            }
        }
    }

    let sample = load_random_uhd_preview_icon(layout, audience)?;
    *guard = Some(CachedPreviewSample {
        resources_key,
        sample: sample.clone(),
    });
    Ok(sample)
}

fn glow_source_for_preview(options: &GlowMakerOptions, sample: &PreviewIconSample) -> RgbaImage {
    let standalone_ok = is_icon_primary_frame(&sample.primary_frame)
        || (sample.sprites.len() <= 1
            && !sample.primary_frame.is_empty()
            && rgba_has_visible_pixels(&sample.primary));

    if options.composite_layers {
        if let Some(composite) = try_composite_preview_image(sample) {
            return composite;
        }
        // Composite unavailable — only show a real standalone primary, never a random piece.
        if standalone_ok {
            return sample.primary.clone();
        }
        return blank_preview_rgba();
    }

    if standalone_ok {
        return sample.primary.clone();
    }
    // Multi-part sheet with no safe sprite without compositing (e.g. bird capsule).
    blank_preview_rgba()
}

/// Try compositing using the sample primary, then every GD / compositable primary key.
fn try_composite_preview_image(sample: &PreviewIconSample) -> Option<RgbaImage> {
    let mut keys: Vec<String> = Vec::new();
    if !sample.primary_frame.is_empty() {
        keys.push(sample.primary_frame.clone());
    }
    keys.extend(
        sample
            .sprites
            .keys()
            .filter(|name| is_icon_primary_frame(name))
            .cloned(),
    );
    keys.extend(compositable_primary_keys(&sample.sprites));
    keys.sort();
    keys.dedup();

    for key in keys {
        if let Ok(Some((composite, _, _))) =
            composite_icon_layers_for_glow(&sample.sprites, &sample.plist_root, &key)
        {
            if rgba_has_visible_pixels(&composite) {
                return Some(composite);
            }
        }
    }
    None
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

/// Generate a PNG data URL of a UHD game icon with glow behind it.
///
/// When `icon_plist_path` is set, that gamesheet (plist + sibling PNG) is used
/// instead of a random icon from `Resources/icons`. When `refresh` is true and
/// no custom path is set, discard the cached sample and pick a new random icon.
pub fn glow_maker_preview_data_url(
    layout: &GameFilesLayout,
    options: &GlowMakerOptions,
    refresh: bool,
    icon_plist_path: Option<&str>,
) -> Result<String, AppError> {
    let options = clamp_glow_options(options);
    let sample = preview_icon_sample(
        layout,
        refresh,
        PreviewIconAudience::GlowMaker,
        icon_plist_path,
    )?;
    let source = glow_source_for_preview(&options, &sample);
    let glow = render_icon_glow_from_primary(&source, &options);
    // Overlay the same composite used for glow so extras stay visible at native size.
    let composed = compose_glow_under_icon(&glow, &source);
    rgba_to_png_data_url(&composed)
}

/// Anchored PNG of an eligible UHD icon (no glow) for Particle Editor silhouettes.
///
/// Composites primary + secondary + extra when those frames exist so the preview
/// matches how the icon looks in-game / in the icon editor. `anchorX/Y` is the
/// Cocos node origin inside the image (Icon Editor / `spriteOffset` convention).
///
/// When `icon_plist_path` is set, that gamesheet is used instead of a random
/// pick. Otherwise, when `kind` is `Some("ship")`, only ship sheets are
/// considered; the general particle silhouette pool is used otherwise (robots,
/// spiders, waves, swings, and UFOs are never picked).
pub fn random_uhd_icon_preview_data_url(
    layout: &GameFilesLayout,
    refresh: bool,
    kind: Option<&str>,
    icon_plist_path: Option<&str>,
) -> Result<ParticlePreviewSprite, AppError> {
    let audience = match kind.map(|k| k.trim().to_ascii_lowercase()).as_deref() {
        Some("ship") => PreviewIconAudience::ParticleShip,
        _ => PreviewIconAudience::ParticleSilhouette,
    };
    let sample = preview_icon_sample(layout, refresh, audience, icon_plist_path)?;
    let offset = sprite_offset_for_frame(&sample.plist_root, &sample.primary_frame);

    let (icon, anchor_x, anchor_y) = if let Some(composite) = try_composite_preview_image(&sample) {
        let offset = sprite_offset_for_frame(&sample.plist_root, &sample.primary_frame);
        let (ax, ay) = trimmed_sprite_anchor(composite.width(), composite.height(), offset);
        (composite, ax, ay)
    } else if is_icon_primary_frame(&sample.primary_frame)
        || (sample.sprites.len() <= 1 && rgba_has_visible_pixels(&sample.primary))
    {
        let (ax, ay) =
            trimmed_sprite_anchor(sample.primary.width(), sample.primary.height(), offset);
        (sample.primary, ax, ay)
    } else {
        // No safe silhouette without compositing — blank rather than a random part.
        (blank_preview_rgba(), 0.5, 0.5)
    };

    let mut bytes = Vec::new();
    {
        let mut cursor = Cursor::new(&mut bytes);
        icon.write_to(&mut cursor, ImageFormat::Png)
            .map_err(|err| {
                AppError::ParseError(format!("failed to encode glow preview PNG: {err}"))
            })?;
    }
    Ok(ParticlePreviewSprite {
        data_url: format!("data:image/png;base64,{}", BASE64_STANDARD.encode(&bytes)),
        anchor_x,
        anchor_y,
    })
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
        assert!(!is_icon_primary_frame("bird_01_capsule_001.png"));
        assert!(!is_icon_primary_frame("hero.png"));
    }

    #[test]
    fn excluded_preview_stems_cover_ufo_robot_spider() {
        let glow = PreviewIconAudience::GlowMaker;
        assert!(is_excluded_preview_icon_stem("bird_01-uhd", glow));
        assert!(is_excluded_preview_icon_stem("bird_42-hd", glow));
        assert!(is_excluded_preview_icon_stem("ufo_01-uhd", glow));
        assert!(is_excluded_preview_icon_stem("robot_01_01-uhd", glow));
        assert!(is_excluded_preview_icon_stem("spider_05_03-uhd", glow));
        assert!(!is_excluded_preview_icon_stem("player_12-uhd", glow));
        assert!(!is_excluded_preview_icon_stem("ship_03-uhd", glow));
        assert!(!is_excluded_preview_icon_stem("player_ball_01-uhd", glow));
        assert!(!is_excluded_preview_icon_stem("dart_02-uhd", glow));
        assert!(!is_excluded_preview_icon_stem("swing_01-uhd", glow));
    }

    #[test]
    fn particle_silhouette_also_excludes_waves_and_swings() {
        let particle = PreviewIconAudience::ParticleSilhouette;
        assert!(is_excluded_preview_icon_stem("dart_02-uhd", particle));
        assert!(is_excluded_preview_icon_stem("swing_01-uhd", particle));
        assert!(is_excluded_preview_icon_stem("robot_01_01-uhd", particle));
        assert!(is_excluded_preview_icon_stem("spider_05_03-uhd", particle));
        assert!(!is_excluded_preview_icon_stem("player_12-uhd", particle));
        assert!(!is_excluded_preview_icon_stem("ship_03-uhd", particle));
        assert!(!is_excluded_preview_icon_stem(
            "player_ball_01-uhd",
            particle
        ));
    }

    #[test]
    fn particle_ship_audience_only_allows_ships() {
        let ship = PreviewIconAudience::ParticleShip;
        assert!(!is_excluded_preview_icon_stem("ship_03-uhd", ship));
        assert!(!is_excluded_preview_icon_stem("ship_42-uhd", ship));
        assert!(is_excluded_preview_icon_stem("player_12-uhd", ship));
        assert!(is_excluded_preview_icon_stem("player_ball_01-uhd", ship));
        assert!(is_excluded_preview_icon_stem("dart_02-uhd", ship));
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

    #[test]
    fn pick_preview_frame_allows_single_custom_sprite() {
        let mut sprites = BTreeMap::new();
        sprites.insert("hero.png".to_string(), tiny_primary());
        sprites.insert("hero_glow.png".to_string(), tiny_primary());
        let name = pick_preview_frame_name(&sprites, PrimaryFramePick::First).expect("frame");
        assert_eq!(name, "hero.png");
    }

    #[test]
    fn pick_preview_frame_rejects_ambiguous_multipart_pieces() {
        let mut sprites = BTreeMap::new();
        sprites.insert("bird_01_capsule_001.png".to_string(), tiny_primary());
        sprites.insert("bird_01_dome_001.png".to_string(), tiny_primary());
        assert!(pick_preview_frame_name(&sprites, PrimaryFramePick::First).is_err());
    }

    #[test]
    fn glow_source_blanks_when_multipart_piece_without_composite() {
        let mut sprites = BTreeMap::new();
        sprites.insert("bird_01_capsule_001.png".to_string(), tiny_primary());
        sprites.insert("bird_01_dome_001.png".to_string(), tiny_primary());
        let sample = PreviewIconSample {
            primary: tiny_primary(),
            primary_frame: "bird_01_capsule_001.png".to_string(),
            sprites,
            plist_root: Value::Dictionary(plist::Dictionary::new()),
        };
        let source = glow_source_for_preview(&default_options(false, false), &sample);
        assert!(!rgba_has_visible_pixels(&source));
    }

    #[test]
    fn glow_source_composites_when_composite_option_enabled() {
        let mut sprites = BTreeMap::new();
        sprites.insert("player_01_001.png".to_string(), tiny_primary());
        sprites.insert(
            "player_01_2_001.png".to_string(),
            RgbaImage::from_pixel(12, 12, Rgba([255, 80, 40, 255])),
        );
        let plist_root = Value::Dictionary({
            let mut frames = plist::Dictionary::new();
            for name in ["player_01_001.png", "player_01_2_001.png"] {
                let mut frame = plist::Dictionary::new();
                frame.insert(
                    "spriteOffset".to_string(),
                    Value::String("{0,0}".to_string()),
                );
                frames.insert(name.to_string(), Value::Dictionary(frame));
            }
            let mut root = plist::Dictionary::new();
            root.insert("frames".to_string(), Value::Dictionary(frames));
            root
        });

        let sample = PreviewIconSample {
            primary: blank_preview_rgba(),
            primary_frame: "player_01_001.png".to_string(),
            sprites,
            plist_root,
        };
        let without = glow_source_for_preview(&default_options(false, false), &sample);
        assert!(
            !rgba_has_visible_pixels(&without),
            "without composite, blank primary must stay blank"
        );
        let with = glow_source_for_preview(&default_options(true, false), &sample);
        assert!(
            rgba_has_visible_pixels(&with),
            "with composite enabled, layered preview must appear"
        );
    }

    #[test]
    fn custom_plist_preview_uses_sibling_png_and_returns_pixels() {
        let dir =
            std::env::temp_dir().join(format!("tm-glow-preview-custom-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        let plist_path = dir.join("player_99-uhd.plist");
        let png_path = dir.join("player_99-uhd.png");

        let mut atlas = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 2..14 {
            for x in 2..14 {
                atlas.put_pixel(x, y, Rgba([40, 180, 255, 255]));
            }
        }
        atlas.save(&png_path).expect("write atlas png");

        std::fs::write(
            &plist_path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>frames</key>
  <dict>
    <key>player_99_001.png</key>
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
    <key>textureFileName</key>
    <string>player_99-uhd.png</string>
  </dict>
</dict></plist>"#,
        )
        .expect("plist");

        let sample = load_preview_icon_from_plist_path(&plist_path).expect("load custom");
        assert_eq!(sample.primary_frame, "player_99_001.png");
        assert!(sample.primary.pixels().any(|p| p.0[3] > 0));

        let layout = GameFilesLayout {
            root: dir.clone(),
            geometry_dash_dir: dir.clone(),
            resources: dir.clone(),
            geode_resources: dir.clone(),
            geode_unzipped: dir.clone(),
            current_split: dir.clone(),
            legacy: dir.clone(),
        };
        let data_url = glow_maker_preview_data_url(
            &layout,
            &default_options(false, false),
            false,
            Some(plist_path.to_string_lossy().as_ref()),
        )
        .expect("preview");
        assert!(data_url.starts_with("data:image/png;base64,"));
        assert!(data_url.len() > 64);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn custom_plist_prefers_sibling_stem_png_over_metadata() {
        let dir = std::env::temp_dir().join(format!(
            "tm-glow-preview-stem-prefer-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        let plist_path = dir.join("custom-icon.plist");
        let stem_png = dir.join("custom-icon.png");
        let atlas_png = dir.join("atlas.png");

        // Sibling stem PNG has the real icon pixels.
        let mut stem = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 0..16 {
            for x in 0..16 {
                stem.put_pixel(x, y, Rgba([40, 180, 255, 255]));
            }
        }
        stem.save(&stem_png).expect("stem png");

        // Metadata atlas exists but is fully transparent (wrong file).
        RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]))
            .save(&atlas_png)
            .expect("atlas png");

        std::fs::write(
            &plist_path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>frames</key>
  <dict>
    <key>hero_001.png</key>
    <dict>
      <key>textureRect</key>
      <string>{{0,0},{16,16}}</string>
      <key>spriteSize</key>
      <string>{16,16}</string>
      <key>spriteOffset</key>
      <string>{0,0}</string>
      <key>spriteSourceSize</key>
      <string>{16,16}</string>
      <key>textureRotated</key>
      <false/>
    </dict>
  </dict>
  <key>metadata</key>
  <dict>
    <key>realTextureFileName</key>
    <string>atlas.png</string>
  </dict>
</dict></plist>"#,
        )
        .expect("plist");

        let sample = load_preview_icon_from_plist_path(&plist_path).expect("load");
        assert!(sample.primary.pixels().any(|p| p.0 == [40, 180, 255, 255]));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn custom_plist_falls_back_to_metadata_texture_when_stem_missing() {
        let dir = std::env::temp_dir().join(format!(
            "tm-glow-preview-meta-fallback-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        let plist_path = dir.join("custom-icon.plist");
        let atlas_png = dir.join("atlas.png");

        let mut atlas = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 0..16 {
            for x in 0..16 {
                atlas.put_pixel(x, y, Rgba([255, 80, 40, 255]));
            }
        }
        atlas.save(&atlas_png).expect("atlas png");

        std::fs::write(
            &plist_path,
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>frames</key>
  <dict>
    <key>hero_001.png</key>
    <dict>
      <key>textureRect</key>
      <string>{{0,0},{16,16}}</string>
      <key>spriteSize</key>
      <string>{16,16}</string>
      <key>spriteOffset</key>
      <string>{0,0}</string>
      <key>spriteSourceSize</key>
      <string>{16,16}</string>
      <key>textureRotated</key>
      <false/>
    </dict>
  </dict>
  <key>metadata</key>
  <dict>
    <key>realTextureFileName</key>
    <string>atlas.png</string>
  </dict>
</dict></plist>"#,
        )
        .expect("plist");

        let sample = load_preview_icon_from_plist_path(&plist_path).expect("load");
        assert!(sample.primary.pixels().any(|p| p.0 == [255, 80, 40, 255]));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
