//! Cocos2d-x / Particle Designer `.plist` open, save, and texture-resolve commands.
//!
//! # Texture resolution order
//! 1. Sibling file in the same directory as the plist (case-insensitive match on `textureFileName`).
//! 2. Embedded `textureImageData`: `<data>` or base64 `<string>` → gunzip → TIFF/PNG via `image` crate.
//! 3. Neither available → return `TextureSource::None` with a warning.

use std::fs;
use std::io::{Cursor, Read as IoRead, Write as IoWrite};
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use image::ImageFormat;
use plist::{Dictionary, Value};
use serde::{Deserialize, Serialize};

use crate::core::errors::AppError;
use crate::core::safe_fs::{
    decode_png_data_url, ensure_existing_user_file, ensure_readable_image_file,
    parse_user_absolute_path, png_file_to_data_url,
};

// ---------------------------------------------------------------------------
// Public DTOs
// ---------------------------------------------------------------------------

/// Where the resolved texture came from.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TextureSource {
    Sibling,
    Embedded,
    None,
}

/// All editable Cocos2d Particle Designer keys.
///
/// Field names are `snake_case`; serialised to the frontend as `camelCase`.
/// For the irregular all-lowercase plist keys (`gravityx`, `gravityy`,
/// `sourcePositionVariancex/y`), serde's camelCase transform naturally
/// produces the correct JSON names:
/// - `gravityx`              → `"gravityx"`
/// - `source_position_variancex` → `"sourcePositionVariancex"`
///
/// Fields with explicit `#[serde(rename)]` override the camelCase rule for
/// plist keys whose capitalisation differs from what camelCase would produce
/// (e.g. `sourcePositionx` has a lowercase `x`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleConfig {
    // Emitter
    pub angle: f64,
    pub angle_variance: f64,
    pub emitter_type: i32,
    pub duration: f64,
    pub max_particles: i32,
    /// Cocos2d plist key `sourcePositionx` (lowercase x).
    #[serde(rename = "sourcePositionx")]
    pub source_positionx: f64,
    /// Cocos2d plist key `sourcePositiony` (lowercase y).
    #[serde(rename = "sourcePositiony")]
    pub source_positiony: f64,
    pub source_position_variancex: f64,
    pub source_position_variancey: f64,

    // Lifetime & emission
    pub particle_lifespan: f64,
    pub particle_lifespan_variance: f64,
    /// Stored explicitly for round-trip fidelity (Cocos2d = maxParticles / lifespan).
    pub emission_rate: f64,

    // Motion – Gravity mode
    pub gravityx: f64,
    pub gravityy: f64,
    pub speed: f64,
    pub speed_variance: f64,
    pub radial_acceleration: f64,
    pub radial_acceleration_variance: f64,
    pub tangential_acceleration: f64,
    pub tangential_acceleration_variance: f64,
    /// Whether particle rotation tracks the velocity direction (plist key `rotationIsDir`).
    pub rotation_is_dir: bool,
    /// 0=Free (world trail), 1=Relative (shift with emitter), 2=Grouped (locked to emitter).
    /// Plist key: `positionType`. Default: 0.
    pub position_type: i32,
    /// Y-axis coordinate flip factor for physics (plist key `yCoordFlipped`). Default: 1.
    pub y_coord_flipped: f64,
    /// Pre-multiply RGB channels by alpha at spawn (plist key `opacityModifyRGB`). Default: false.
    #[serde(rename = "opacityModifyRGB")]
    pub opacity_modify_rgb: bool,

    // Motion – Radius mode
    pub max_radius: f64,
    pub max_radius_variance: f64,
    pub min_radius: f64,
    pub min_radius_variance: f64,
    pub rotate_per_second: f64,
    pub rotate_per_second_variance: f64,

    // Start color (RGBA components, 0.0–1.0)
    pub start_color_red: f64,
    pub start_color_green: f64,
    pub start_color_blue: f64,
    pub start_color_alpha: f64,
    pub start_color_variance_red: f64,
    pub start_color_variance_green: f64,
    pub start_color_variance_blue: f64,
    pub start_color_variance_alpha: f64,

    // Finish color (RGBA components, 0.0–1.0)
    pub finish_color_red: f64,
    pub finish_color_green: f64,
    pub finish_color_blue: f64,
    pub finish_color_alpha: f64,
    pub finish_color_variance_red: f64,
    pub finish_color_variance_green: f64,
    pub finish_color_variance_blue: f64,
    pub finish_color_variance_alpha: f64,

    // Size
    pub start_particle_size: f64,
    pub start_particle_size_variance: f64,
    pub finish_particle_size: f64,
    pub finish_particle_size_variance: f64,

    // Rotation – always emitted so the frontend never receives undefined
    pub rotation_start: f64,
    pub rotation_start_variance: f64,
    pub rotation_end: f64,
    pub rotation_end_variance: f64,

    // Blend
    pub blend_func_source: i32,
    pub blend_func_destination: i32,

    // Texture
    pub texture_file_name: String,
}

impl Default for ParticleConfig {
    fn default() -> Self {
        ParticleConfig {
            angle: 90.0,
            angle_variance: 0.0,
            emitter_type: 0,
            duration: -1.0,
            max_particles: 100,
            source_positionx: 0.0,
            source_positiony: 0.0,
            source_position_variancex: 0.0,
            source_position_variancey: 0.0,
            particle_lifespan: 1.0,
            particle_lifespan_variance: 0.0,
            emission_rate: 0.0,
            gravityx: 0.0,
            gravityy: 0.0,
            speed: 100.0,
            speed_variance: 0.0,
            radial_acceleration: 0.0,
            radial_acceleration_variance: 0.0,
            tangential_acceleration: 0.0,
            tangential_acceleration_variance: 0.0,
            rotation_is_dir: false,
            position_type: 0,
            y_coord_flipped: 1.0,
            opacity_modify_rgb: false,
            max_radius: 100.0,
            max_radius_variance: 0.0,
            min_radius: 0.0,
            min_radius_variance: 0.0,
            rotate_per_second: 0.0,
            rotate_per_second_variance: 0.0,
            start_color_red: 1.0,
            start_color_green: 1.0,
            start_color_blue: 1.0,
            start_color_alpha: 1.0,
            start_color_variance_red: 0.0,
            start_color_variance_green: 0.0,
            start_color_variance_blue: 0.0,
            start_color_variance_alpha: 0.0,
            finish_color_red: 0.0,
            finish_color_green: 0.0,
            finish_color_blue: 0.0,
            finish_color_alpha: 0.0,
            finish_color_variance_red: 0.0,
            finish_color_variance_green: 0.0,
            finish_color_variance_blue: 0.0,
            finish_color_variance_alpha: 0.0,
            start_particle_size: 24.0,
            start_particle_size_variance: 0.0,
            finish_particle_size: 0.0,
            finish_particle_size_variance: 0.0,
            rotation_start: 0.0,
            rotation_start_variance: 0.0,
            rotation_end: 0.0,
            rotation_end_variance: 0.0,
            blend_func_source: 770,
            blend_func_destination: 1,
            texture_file_name: String::new(),
        }
    }
}

/// Return type for `particle_editor_open`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleOpenResult {
    pub config: ParticleConfig,
    /// PNG data URL for the resolved texture, or `None` when not found.
    pub texture_png_data_url: Option<String>,
    /// Raw `textureFileName` value read from the plist.
    pub texture_file_name: String,
    pub texture_source: TextureSource,
    /// Non-fatal warnings (missing texture, failed embed decode, etc.).
    pub warnings: Vec<String>,
}

/// Input type for `particle_editor_save`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticleSaveRequest {
    pub path: String,
    pub config: ParticleConfig,
    /// Optional PNG data URL for the texture (used for embedding and/or sibling PNG write).
    pub texture_png_data_url: Option<String>,
    /// When `true`, gzip-compress the PNG and embed it as `textureImageData` in the plist.
    pub embed_texture: bool,
    /// When `true`, write a sibling `.png` file next to the plist using `config.texture_file_name`.
    pub write_sibling_png: bool,
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn dict_get_f64(dict: &Dictionary, key: &str) -> Option<f64> {
    match dict.get(key) {
        Some(Value::Real(v)) => Some(*v),
        Some(Value::Integer(v)) => v.as_signed().map(|i| i as f64),
        _ => None,
    }
}

fn dict_get_i64(dict: &Dictionary, key: &str) -> Option<i64> {
    match dict.get(key) {
        Some(Value::Integer(v)) => v.as_signed(),
        Some(Value::Real(v)) => Some(*v as i64),
        _ => None,
    }
}

fn dict_get_string(dict: &Dictionary, key: &str) -> Option<String> {
    match dict.get(key) {
        Some(Value::String(s)) => Some(s.clone()),
        _ => None,
    }
}

fn dict_get_bool(dict: &Dictionary, key: &str) -> Option<bool> {
    match dict.get(key) {
        Some(Value::Boolean(b)) => Some(*b),
        Some(Value::Integer(v)) => v.as_signed().map(|i| i != 0),
        _ => None,
    }
}

/// Search `dir` for a file whose name matches `name` (exact first, then case-insensitive).
fn find_sibling_file(dir: &Path, name: &str) -> Option<PathBuf> {
    if name.is_empty() {
        return None;
    }
    let exact = dir.join(name);
    if exact.is_file() {
        return Some(exact);
    }
    let name_lower = name.to_ascii_lowercase();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let entry_lower = file_name.to_string_lossy().to_ascii_lowercase();
            if entry_lower == name_lower {
                let p = entry.path();
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    None
}

/// Read any image file (PNG, TIFF, …) and return it as a `data:image/png;base64,…` URL.
fn image_file_to_png_data_url(path: &Path) -> Result<String, AppError> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext == "png" {
        return png_file_to_data_url(path);
    }
    let bytes = fs::read(path)?;
    image_bytes_to_png_data_url(&bytes)
}

/// Decode raw image bytes (any format supported by the `image` crate) → PNG data URL.
fn image_bytes_to_png_data_url(bytes: &[u8]) -> Result<String, AppError> {
    let img = image::load_from_memory(bytes)
        .map_err(|e| AppError::ParseError(format!("image decode failed: {e}")))?;
    let mut png_buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_buf), ImageFormat::Png)
        .map_err(|e| AppError::IoError(format!("PNG encode failed: {e}")))?;
    let encoded = BASE64_STANDARD.encode(&png_buf);
    Ok(format!("data:image/png;base64,{encoded}"))
}

/// Gunzip `bytes` → raw decompressed bytes.
fn gunzip(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    let mut decoder = GzDecoder::new(bytes);
    let mut out = Vec::new();
    decoder
        .read_to_end(&mut out)
        .map_err(|e| AppError::ParseError(format!("gunzip failed: {e}")))?;
    Ok(out)
}

/// Gzip-compress `bytes`.
fn gzip(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(bytes)
        .map_err(|e| AppError::IoError(format!("gzip write failed: {e}")))?;
    encoder
        .finish()
        .map_err(|e| AppError::IoError(format!("gzip finish failed: {e}")))
}

/// Extract raw gzip bytes from a plist `textureImageData` value.
///
/// Handles both `Value::Data` (plist `<data>` tag – already base64-decoded by the plist crate)
/// and `Value::String` (some tools emit base64-encoded gzip as a plain `<string>`).
fn get_texture_embed_bytes(dict: &Dictionary) -> Option<Vec<u8>> {
    match dict.get("textureImageData") {
        Some(Value::Data(bytes)) if !bytes.is_empty() => Some(bytes.clone()),
        Some(Value::String(s)) if !s.trim().is_empty() => {
            BASE64_STANDARD.decode(s.trim()).ok().filter(|b| !b.is_empty())
        }
        _ => None,
    }
}

/// Resolve a particle texture from disk sibling or embedded data.
///
/// Returns `(data_url_option, source, warnings)`.
fn resolve_particle_texture(
    plist_dir: &Path,
    texture_file_name: &str,
    embed_bytes: Option<Vec<u8>>,
) -> (Option<String>, TextureSource, Vec<String>) {
    let mut warnings = Vec::new();

    // 1. Prefer a sibling file on disk.
    if !texture_file_name.is_empty() {
        if let Some(sibling) = find_sibling_file(plist_dir, texture_file_name) {
            match image_file_to_png_data_url(&sibling) {
                Ok(url) => return (Some(url), TextureSource::Sibling, warnings),
                Err(e) => warnings.push(format!(
                    "sibling '{}' could not be loaded: {e}",
                    sibling.display()
                )),
            }
        }
    }

    // 2. Fall back to embedded textureImageData.
    if let Some(bytes) = embed_bytes {
        match gunzip(&bytes).and_then(|raw| image_bytes_to_png_data_url(&raw)) {
            Ok(url) => return (Some(url), TextureSource::Embedded, warnings),
            Err(e) => warnings.push(format!("textureImageData decode failed: {e}")),
        }
    }

    // 3. Nothing worked.
    if !texture_file_name.is_empty() {
        warnings.push(format!(
            "texture '{}' not found alongside the plist and no valid embed present",
            texture_file_name
        ));
    }
    (None, TextureSource::None, warnings)
}

/// Build a `ParticleConfig` from a plist root dictionary, using defaults for absent keys.
fn parse_particle_config(dict: &Dictionary) -> ParticleConfig {
    let def = ParticleConfig::default();
    ParticleConfig {
        angle: dict_get_f64(dict, "angle").unwrap_or(def.angle),
        angle_variance: dict_get_f64(dict, "angleVariance").unwrap_or(def.angle_variance),
        emitter_type: dict_get_i64(dict, "emitterType")
            .unwrap_or(def.emitter_type as i64) as i32,
        duration: dict_get_f64(dict, "duration").unwrap_or(def.duration),
        max_particles: dict_get_i64(dict, "maxParticles")
            .unwrap_or(def.max_particles as i64) as i32,
        source_positionx: dict_get_f64(dict, "sourcePositionx")
            .unwrap_or(def.source_positionx),
        source_positiony: dict_get_f64(dict, "sourcePositiony")
            .unwrap_or(def.source_positiony),
        source_position_variancex: dict_get_f64(dict, "sourcePositionVariancex")
            .unwrap_or(def.source_position_variancex),
        source_position_variancey: dict_get_f64(dict, "sourcePositionVariancey")
            .unwrap_or(def.source_position_variancey),
        particle_lifespan: dict_get_f64(dict, "particleLifespan")
            .unwrap_or(def.particle_lifespan),
        particle_lifespan_variance: dict_get_f64(dict, "particleLifespanVariance")
            .unwrap_or(def.particle_lifespan_variance),
        emission_rate: dict_get_f64(dict, "emissionRate").unwrap_or(def.emission_rate),
        gravityx: dict_get_f64(dict, "gravityx").unwrap_or(def.gravityx),
        gravityy: dict_get_f64(dict, "gravityy").unwrap_or(def.gravityy),
        speed: dict_get_f64(dict, "speed").unwrap_or(def.speed),
        speed_variance: dict_get_f64(dict, "speedVariance").unwrap_or(def.speed_variance),
        radial_acceleration: dict_get_f64(dict, "radialAcceleration")
            .unwrap_or(def.radial_acceleration),
        radial_acceleration_variance: dict_get_f64(dict, "radialAccelerationVariance")
            .unwrap_or(def.radial_acceleration_variance),
        tangential_acceleration: dict_get_f64(dict, "tangentialAcceleration")
            .unwrap_or(def.tangential_acceleration),
        tangential_acceleration_variance: dict_get_f64(dict, "tangentialAccelerationVariance")
            .unwrap_or(def.tangential_acceleration_variance),
        rotation_is_dir: dict_get_bool(dict, "rotationIsDir")
            .unwrap_or(def.rotation_is_dir),
        position_type: dict_get_i64(dict, "positionType")
            .unwrap_or(def.position_type as i64) as i32,
        y_coord_flipped: dict_get_f64(dict, "yCoordFlipped")
            .unwrap_or(def.y_coord_flipped),
        opacity_modify_rgb: dict_get_bool(dict, "opacityModifyRGB")
            .unwrap_or(def.opacity_modify_rgb),
        max_radius: dict_get_f64(dict, "maxRadius").unwrap_or(def.max_radius),
        max_radius_variance: dict_get_f64(dict, "maxRadiusVariance")
            .unwrap_or(def.max_radius_variance),
        min_radius: dict_get_f64(dict, "minRadius").unwrap_or(def.min_radius),
        min_radius_variance: dict_get_f64(dict, "minRadiusVariance")
            .unwrap_or(def.min_radius_variance),
        rotate_per_second: dict_get_f64(dict, "rotatePerSecond")
            .unwrap_or(def.rotate_per_second),
        rotate_per_second_variance: dict_get_f64(dict, "rotatePerSecondVariance")
            .unwrap_or(def.rotate_per_second_variance),
        start_color_red: dict_get_f64(dict, "startColorRed").unwrap_or(def.start_color_red),
        start_color_green: dict_get_f64(dict, "startColorGreen")
            .unwrap_or(def.start_color_green),
        start_color_blue: dict_get_f64(dict, "startColorBlue").unwrap_or(def.start_color_blue),
        start_color_alpha: dict_get_f64(dict, "startColorAlpha")
            .unwrap_or(def.start_color_alpha),
        start_color_variance_red: dict_get_f64(dict, "startColorVarianceRed")
            .unwrap_or(def.start_color_variance_red),
        start_color_variance_green: dict_get_f64(dict, "startColorVarianceGreen")
            .unwrap_or(def.start_color_variance_green),
        start_color_variance_blue: dict_get_f64(dict, "startColorVarianceBlue")
            .unwrap_or(def.start_color_variance_blue),
        start_color_variance_alpha: dict_get_f64(dict, "startColorVarianceAlpha")
            .unwrap_or(def.start_color_variance_alpha),
        finish_color_red: dict_get_f64(dict, "finishColorRed").unwrap_or(def.finish_color_red),
        finish_color_green: dict_get_f64(dict, "finishColorGreen")
            .unwrap_or(def.finish_color_green),
        finish_color_blue: dict_get_f64(dict, "finishColorBlue")
            .unwrap_or(def.finish_color_blue),
        finish_color_alpha: dict_get_f64(dict, "finishColorAlpha")
            .unwrap_or(def.finish_color_alpha),
        finish_color_variance_red: dict_get_f64(dict, "finishColorVarianceRed")
            .unwrap_or(def.finish_color_variance_red),
        finish_color_variance_green: dict_get_f64(dict, "finishColorVarianceGreen")
            .unwrap_or(def.finish_color_variance_green),
        finish_color_variance_blue: dict_get_f64(dict, "finishColorVarianceBlue")
            .unwrap_or(def.finish_color_variance_blue),
        finish_color_variance_alpha: dict_get_f64(dict, "finishColorVarianceAlpha")
            .unwrap_or(def.finish_color_variance_alpha),
        start_particle_size: dict_get_f64(dict, "startParticleSize")
            .unwrap_or(def.start_particle_size),
        start_particle_size_variance: dict_get_f64(dict, "startParticleSizeVariance")
            .unwrap_or(def.start_particle_size_variance),
        finish_particle_size: dict_get_f64(dict, "finishParticleSize")
            .unwrap_or(def.finish_particle_size),
        finish_particle_size_variance: dict_get_f64(dict, "finishParticleSizeVariance")
            .unwrap_or(def.finish_particle_size_variance),
        rotation_start: dict_get_f64(dict, "rotationStart").unwrap_or(def.rotation_start),
        rotation_start_variance: dict_get_f64(dict, "rotationStartVariance")
            .unwrap_or(def.rotation_start_variance),
        rotation_end: dict_get_f64(dict, "rotationEnd").unwrap_or(def.rotation_end),
        rotation_end_variance: dict_get_f64(dict, "rotationEndVariance")
            .unwrap_or(def.rotation_end_variance),
        blend_func_source: dict_get_i64(dict, "blendFuncSource")
            .unwrap_or(def.blend_func_source as i64) as i32,
        blend_func_destination: dict_get_i64(dict, "blendFuncDestination")
            .unwrap_or(def.blend_func_destination as i64) as i32,
        texture_file_name: dict_get_string(dict, "textureFileName")
            .unwrap_or_default(),
    }
}

/// Serialize a `ParticleConfig` into a plist `Dictionary`, preserving original plist key names.
fn config_to_plist_dict(config: &ParticleConfig) -> Dictionary {
    let mut d = Dictionary::new();

    macro_rules! put_real {
        ($key:expr, $val:expr) => {
            d.insert($key.to_string(), Value::Real($val));
        };
    }
    macro_rules! put_int {
        ($key:expr, $val:expr) => {
            d.insert(
                $key.to_string(),
                Value::Integer(plist::Integer::from($val as i64)),
            );
        };
    }
    put_real!("angle", config.angle);
    put_real!("angleVariance", config.angle_variance);
    put_int!("emitterType", config.emitter_type);
    put_real!("duration", config.duration);
    put_int!("maxParticles", config.max_particles);
    put_real!("sourcePositionx", config.source_positionx);
    put_real!("sourcePositiony", config.source_positiony);
    put_real!("sourcePositionVariancex", config.source_position_variancex);
    put_real!("sourcePositionVariancey", config.source_position_variancey);
    put_real!("particleLifespan", config.particle_lifespan);
    put_real!("particleLifespanVariance", config.particle_lifespan_variance);
    put_real!("emissionRate", config.emission_rate);
    put_real!("gravityx", config.gravityx);
    put_real!("gravityy", config.gravityy);
    put_real!("speed", config.speed);
    put_real!("speedVariance", config.speed_variance);
    put_real!("radialAcceleration", config.radial_acceleration);
    put_real!("radialAccelerationVariance", config.radial_acceleration_variance);
    put_real!("tangentialAcceleration", config.tangential_acceleration);
    put_real!("tangentialAccelerationVariance", config.tangential_acceleration_variance);
    d.insert(
        "rotationIsDir".to_string(),
        Value::Integer(plist::Integer::from(i64::from(config.rotation_is_dir))),
    );
    put_int!("positionType", config.position_type);
    put_real!("yCoordFlipped", config.y_coord_flipped);
    d.insert(
        "opacityModifyRGB".to_string(),
        Value::Boolean(config.opacity_modify_rgb),
    );
    put_real!("maxRadius", config.max_radius);
    put_real!("maxRadiusVariance", config.max_radius_variance);
    put_real!("minRadius", config.min_radius);
    put_real!("minRadiusVariance", config.min_radius_variance);
    put_real!("rotatePerSecond", config.rotate_per_second);
    put_real!("rotatePerSecondVariance", config.rotate_per_second_variance);
    put_real!("startColorRed", config.start_color_red);
    put_real!("startColorGreen", config.start_color_green);
    put_real!("startColorBlue", config.start_color_blue);
    put_real!("startColorAlpha", config.start_color_alpha);
    put_real!("startColorVarianceRed", config.start_color_variance_red);
    put_real!("startColorVarianceGreen", config.start_color_variance_green);
    put_real!("startColorVarianceBlue", config.start_color_variance_blue);
    put_real!("startColorVarianceAlpha", config.start_color_variance_alpha);
    put_real!("finishColorRed", config.finish_color_red);
    put_real!("finishColorGreen", config.finish_color_green);
    put_real!("finishColorBlue", config.finish_color_blue);
    put_real!("finishColorAlpha", config.finish_color_alpha);
    put_real!("finishColorVarianceRed", config.finish_color_variance_red);
    put_real!("finishColorVarianceGreen", config.finish_color_variance_green);
    put_real!("finishColorVarianceBlue", config.finish_color_variance_blue);
    put_real!("finishColorVarianceAlpha", config.finish_color_variance_alpha);
    put_real!("startParticleSize", config.start_particle_size);
    put_real!("startParticleSizeVariance", config.start_particle_size_variance);
    put_real!("finishParticleSize", config.finish_particle_size);
    put_real!("finishParticleSizeVariance", config.finish_particle_size_variance);
    put_real!("rotationStart", config.rotation_start);
    put_real!("rotationStartVariance", config.rotation_start_variance);
    put_real!("rotationEnd", config.rotation_end);
    put_real!("rotationEndVariance", config.rotation_end_variance);
    put_int!("blendFuncSource", config.blend_func_source);
    put_int!("blendFuncDestination", config.blend_func_destination);
    d.insert(
        "textureFileName".to_string(),
        Value::String(config.texture_file_name.clone()),
    );

    d
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Open a Cocos2d particle plist file, resolve its texture, and return everything
/// the editor needs.
pub fn particle_editor_open(path: &str) -> Result<ParticleOpenResult, AppError> {
    let plist_path = parse_user_absolute_path(path)?;
    ensure_existing_user_file(&plist_path)?;

    let root = Value::from_file(&plist_path)
        .map_err(|e| AppError::ParseError(format!("failed to parse plist: {e}")))?;

    let dict = match &root {
        Value::Dictionary(d) => d,
        _ => {
            return Err(AppError::ParseError(
                "plist root is not a dictionary".to_string(),
            ))
        }
    };

    let config = parse_particle_config(dict);
    let texture_file_name = config.texture_file_name.clone();
    let embed_bytes = get_texture_embed_bytes(dict);

    let plist_dir = plist_path
        .parent()
        .unwrap_or_else(|| Path::new(""));

    let (texture_png_data_url, texture_source, warnings) =
        resolve_particle_texture(plist_dir, &texture_file_name, embed_bytes);

    Ok(ParticleOpenResult {
        config,
        texture_png_data_url,
        texture_file_name,
        texture_source,
        warnings,
    })
}

/// Write (or overwrite) a Cocos2d particle plist, optionally embedding the texture and/or
/// writing a sibling PNG file.
pub fn particle_editor_save(request: ParticleSaveRequest) -> Result<(), AppError> {
    let plist_path = parse_user_absolute_path(&request.path)?;

    // Ensure the parent directory exists.
    if let Some(parent) = plist_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    let mut dict = config_to_plist_dict(&request.config);

    if request.embed_texture {
        if let Some(ref data_url) = request.texture_png_data_url {
            let png_bytes = decode_png_data_url(data_url)?;
            let gz_bytes = gzip(&png_bytes)?;
            dict.insert("textureImageData".to_string(), Value::Data(gz_bytes));
        }
        // If no texture was provided but embed is requested, leave any pre-existing embed out –
        // we never copy forward a stale embed since the caller controls the full save payload.
    }
    // When embed is false, textureImageData is simply absent from the output dict.

    // Optionally write the sibling PNG.
    if request.write_sibling_png {
        if let Some(ref data_url) = request.texture_png_data_url {
            let fname = request.config.texture_file_name.trim();
            if !fname.is_empty() {
                let sibling = plist_path.with_file_name(fname);
                let png_bytes = decode_png_data_url(data_url)?;
                fs::write(&sibling, &png_bytes).map_err(|e| {
                    AppError::IoError(format!("failed to write sibling PNG: {e}"))
                })?;
            }
        }
    }

    Value::Dictionary(dict)
        .to_file_xml(&plist_path)
        .map_err(|e| AppError::IoError(format!("failed to write plist: {e}")))
}

/// Read an arbitrary image file (PNG, TIFF, …) from disk and return it as a PNG data URL.
/// Used by the "Replace Texture" action in the editor.
pub fn particle_editor_load_texture(path: &str) -> Result<String, AppError> {

    let file_path = parse_user_absolute_path(path)?;
    ensure_readable_image_file(&file_path)?;

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if ext == "png" {
        return png_file_to_data_url(&file_path);
    }

    let bytes = fs::read(&file_path)?;
    image_bytes_to_png_data_url(&bytes)
}

// ---------------------------------------------------------------------------
// Verify-samples tests – call the real open path against GD pack plists.
// Run with: cargo test -p texture-manager-2-lib verify_samples -- --nocapture
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    const KNOBBELBOY_PLIST: &str =
        r"C:\Program Files (x86)\Steam\steamapps\common\Geometry Dash\geode\config\geode.texture-loader\packs\Knobbelboy Particles\dragEffect.plist";

    const SUNIX_PLIST: &str =
        r"C:\Program Files (x86)\Steam\steamapps\common\Geometry Dash\geode\config\geode.texture-loader\packs\Sunix Arrow Particles\dragEffect.plist";

    #[test]
    fn verify_samples_knobbelboy_sibling_png() {
        let result = particle_editor_open(KNOBBELBOY_PLIST)
            .expect("particle_editor_open should succeed for Knobbelboy dragEffect.plist");

        println!("[Knobbelboy] textureFileName = {}", result.texture_file_name);
        println!("[Knobbelboy] textureSource   = {:?}", result.texture_source);
        println!(
            "[Knobbelboy] data URL present = {}",
            result.texture_png_data_url.is_some()
        );
        println!("[Knobbelboy] maxParticles    = {}", result.config.max_particles);
        println!("[Knobbelboy] warnings        = {:?}", result.warnings);

        assert_eq!(
            result.texture_source,
            TextureSource::Sibling,
            "Knobbelboy should resolve texture from sibling estrella.png"
        );
        let data_url = result
            .texture_png_data_url
            .expect("Knobbelboy should return a non-None PNG data URL");
        assert!(
            data_url.starts_with("data:image/png;base64,"),
            "data URL must start with PNG prefix, got: {}",
            &data_url[..data_url.len().min(60)]
        );
        assert!(
            data_url.len() > 100,
            "data URL should contain real image data"
        );
        assert!(
            result.config.max_particles > 0,
            "maxParticles should be positive"
        );
        assert!(
            result.texture_file_name.to_ascii_lowercase().contains("estrella"),
            "textureFileName should reference estrella.png"
        );
    }

    #[test]
    fn verify_samples_sunix_texture_loads() {
        let result = particle_editor_open(SUNIX_PLIST)
            .expect("particle_editor_open should succeed for Sunix dragEffect.plist");

        println!("[Sunix] textureFileName = {}", result.texture_file_name);
        println!("[Sunix] textureSource   = {:?}", result.texture_source);
        println!(
            "[Sunix] data URL present = {}",
            result.texture_png_data_url.is_some()
        );
        println!("[Sunix] maxParticles    = {}", result.config.max_particles);
        println!("[Sunix] warnings        = {:?}", result.warnings);

        // Sunix ships loose PNGs; sibling is preferred, embedded is the fallback.
        assert_ne!(
            result.texture_source,
            TextureSource::None,
            "Sunix texture should resolve (sibling or embedded), not None"
        );
        let data_url = result
            .texture_png_data_url
            .expect("Sunix should return a non-None PNG data URL");
        assert!(
            data_url.starts_with("data:image/png;base64,"),
            "data URL must start with PNG prefix"
        );
        assert!(
            data_url.len() > 100,
            "data URL should contain real image data"
        );
        assert!(
            result.config.max_particles > 0,
            "maxParticles should be positive"
        );
        // The plist has textureFileName = "Square2.png"; loose "square2.png" on disk → Sibling.
        assert_eq!(
            result.texture_source,
            TextureSource::Sibling,
            "Sunix has loose square2.png on disk – should resolve as Sibling (case-insensitive)"
        );
    }
}
