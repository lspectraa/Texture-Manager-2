//! Shared path / image validation for IPC and pack file joins.

use std::fs;
use std::path::{Component, Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;

use crate::core::errors::AppError;

/// Max bytes read into memory for PNG data-URL IPC (compressed file or decoded payload).
pub const MAX_IMAGE_BYTES: u64 = 48 * 1024 * 1024;

const PNG_MAGIC: &[u8] = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const PNG_DATA_URL_PREFIX: &str = "data:image/png;base64,";

/// True when `name` is a single non-empty Normal path segment (no `..`, `/`, drive prefixes).
pub fn is_safe_path_segment(name: &str) -> bool {
    if name.is_empty() || name == "." || name == ".." {
        return false;
    }
    let path = Path::new(name);
    let mut components = path.components();
    match components.next() {
        Some(Component::Normal(os)) if os.to_str() == Some(name) => components.next().is_none(),
        _ => false,
    }
}

/// Reject absolute paths and any non-Normal component (`..`, `.`, prefixes, roots).
pub fn ensure_safe_relative_path(value: &str) -> Result<(), AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidPath("path cannot be empty"));
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(AppError::InvalidPath("absolute paths are not allowed"));
    }
    let mut saw_normal = false;
    for component in path.components() {
        match component {
            Component::Normal(os) => {
                let Some(part) = os.to_str() else {
                    return Err(AppError::InvalidPath("path contains invalid UTF-8"));
                };
                if part.is_empty() || part == "." || part == ".." {
                    return Err(AppError::InvalidPath(
                        "path contains empty or parent/current segments",
                    ));
                }
                saw_normal = true;
            }
            Component::CurDir | Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::InvalidPath(
                    "path must contain only normal relative segments",
                ));
            }
        }
    }
    if !saw_normal {
        return Err(AppError::InvalidPath("path cannot be empty"));
    }
    Ok(())
}

/// Build a relative [`PathBuf`] from `/`-separated segments; rejects traversal and empty parts.
pub fn path_from_slashes(value: &str) -> Result<PathBuf, AppError> {
    let normalized = value.replace('\\', "/");
    ensure_safe_relative_path(&normalized)?;
    let mut out = PathBuf::new();
    for part in normalized.split('/') {
        if part.is_empty() {
            continue;
        }
        if !is_safe_path_segment(part) {
            return Err(AppError::InvalidPath(
                "path contains unsafe or empty segments",
            ));
        }
        out.push(part);
    }
    if out.as_os_str().is_empty() {
        return Err(AppError::InvalidPath("path cannot be empty"));
    }
    Ok(out)
}

/// Join `relative` under `parent` after validating it has only Normal components.
pub fn join_under_parent(parent: &Path, relative: &str) -> Result<PathBuf, AppError> {
    ensure_safe_relative_path(relative)?;
    Ok(parent.join(relative))
}

fn ensure_file_size_ok(path: &Path) -> Result<u64, AppError> {
    let meta = fs::metadata(path)?;
    if !meta.is_file() {
        return Err(AppError::InvalidPath("path must be a regular file"));
    }
    let len = meta.len();
    if len > MAX_IMAGE_BYTES {
        return Err(AppError::InvalidOperation(
            "image file exceeds maximum allowed size",
        ));
    }
    Ok(len)
}

fn ensure_png_magic(bytes: &[u8]) -> Result<(), AppError> {
    if bytes.len() < PNG_MAGIC.len() || !bytes.starts_with(PNG_MAGIC) {
        return Err(AppError::InvalidOperation("file is not a PNG image"));
    }
    Ok(())
}

/// Read a PNG from disk (existence, file, size, magic) and return a data URL.
pub fn png_file_to_data_url(path: &Path) -> Result<String, AppError> {
    if path.as_os_str().is_empty() {
        return Err(AppError::InvalidPath("path cannot be empty"));
    }
    if !path.exists() {
        return Err(AppError::InvalidPath("texture file does not exist"));
    }
    ensure_file_size_ok(path)?;
    let bytes = fs::read(path)?;
    ensure_png_magic(&bytes)?;
    let encoded = BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{encoded}"))
}

/// Validate output path for writing a PNG (non-empty, ends with `.png`, no traversal tricks in name).
pub fn ensure_png_output_path(path: &Path) -> Result<(), AppError> {
    if path.as_os_str().is_empty() {
        return Err(AppError::InvalidPath("output path cannot be empty"));
    }
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return Err(AppError::InvalidPath("output path has no file name"));
    };
    if name.is_empty() || name == "." || name == ".." {
        return Err(AppError::InvalidPath("output path has invalid file name"));
    }
    let has_png = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("png"))
        .unwrap_or(false);
    if !has_png {
        return Err(AppError::InvalidPath("output path must end with .png"));
    }
    // Reject path strings that embed `..` as a component anywhere.
    for component in path.components() {
        if matches!(component, Component::ParentDir) {
            return Err(AppError::InvalidPath("output path must not contain '..'"));
        }
    }
    Ok(())
}

/// Decode a `data:image/png;base64,...` payload with size and magic checks.
pub fn decode_png_data_url(png_data_url: &str) -> Result<Vec<u8>, AppError> {
    let trimmed = png_data_url.trim();
    let encoded = if let Some(rest) = trimmed
        .strip_prefix(PNG_DATA_URL_PREFIX)
        .or_else(|| {
            // Allow optional whitespace / case variants of the media type prefix.
            let lower = trimmed.to_ascii_lowercase();
            if lower.starts_with("data:image/png;base64,") {
                trimmed.get("data:image/png;base64,".len()..)
            } else {
                None
            }
        }) {
        rest
    } else {
        return Err(AppError::InvalidOperation(
            "expected a PNG data URL (data:image/png;base64,...)",
        ));
    };

    // Reject oversized base64 before allocating decoded buffer (~4/3 expansion).
    let approx_decoded = (encoded.len() as u64).saturating_mul(3) / 4;
    if approx_decoded > MAX_IMAGE_BYTES {
        return Err(AppError::InvalidOperation(
            "PNG data URL exceeds maximum allowed size",
        ));
    }

    let bytes = BASE64_STANDARD
        .decode(encoded.trim())
        .map_err(|err| AppError::ParseError(format!("failed to decode png data: {err}")))?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(AppError::InvalidOperation(
            "decoded PNG exceeds maximum allowed size",
        ));
    }
    ensure_png_magic(&bytes)?;
    Ok(bytes)
}

/// Decode a PNG data URL and write it to `output_path` after path checks.
pub fn save_png_data_url(output_path: &Path, png_data_url: &str) -> Result<(), AppError> {
    ensure_png_output_path(output_path)?;
    let bytes = decode_png_data_url(png_data_url)?;
    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(output_path, bytes)?;
    Ok(())
}

/// Ensure a user-supplied image path exists, is a file, and is within size limits before `image::open`.
pub fn ensure_readable_image_file(path: &Path) -> Result<(), AppError> {
    if path.as_os_str().is_empty() {
        return Err(AppError::InvalidPath("path cannot be empty"));
    }
    if !path.exists() {
        return Err(AppError::InvalidPath("image file does not exist"));
    }
    ensure_file_size_ok(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_from_slashes_rejects_traversal() {
        assert!(path_from_slashes("../etc/passwd").is_err());
        assert!(path_from_slashes("foo/../../bar").is_err());
        assert!(path_from_slashes("").is_err());
        assert!(path_from_slashes("/abs").is_err());
    }

    #[test]
    fn path_from_slashes_accepts_nested() {
        let path = path_from_slashes("geode.loader/base.png").expect("ok");
        assert_eq!(path, PathBuf::from("geode.loader").join("base.png"));
    }

    #[test]
    fn ensure_safe_relative_rejects_absolute_and_dotdot() {
        assert!(ensure_safe_relative_path("..\\secret.png").is_err());
        assert!(ensure_safe_relative_path("ok.png").is_ok());
    }

    #[test]
    fn png_output_requires_extension() {
        assert!(ensure_png_output_path(Path::new("out.PNG")).is_ok());
        assert!(ensure_png_output_path(Path::new("out.jpg")).is_err());
        assert!(ensure_png_output_path(Path::new("")).is_err());
    }
}
