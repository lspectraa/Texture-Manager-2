use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ExtendedColorType, ImageEncoder, RgbaImage};

use crate::core::errors::AppError;

/// PNG write tuned for speed over smallest file size (batch splits / atlases).
///
/// Uses `FilterType::NoFilter` instead of adaptive filtering: adaptive per-row selection is
/// much slower on large RGBA atlases with little benefit for tooling output size.
pub fn save_rgba_png_fast(path: &Path, rgba: &RgbaImage) -> Result<(), AppError> {
    let (width, height) = rgba.dimensions();
    let file = File::create(path).map_err(|e| AppError::IoError(e.to_string()))?;
    let writer = BufWriter::new(file);
    let encoder = PngEncoder::new_with_quality(writer, CompressionType::Fast, FilterType::Adaptive);
    encoder
        .write_image(rgba.as_raw(), width, height, ExtendedColorType::Rgba8)
        .map_err(|e| AppError::IoError(e.to_string()))
}

pub fn save_dynamic_png_fast(path: &Path, image: &DynamicImage) -> Result<(), AppError> {
    let rgba = image.to_rgba8();
    save_rgba_png_fast(path, &rgba)
}
