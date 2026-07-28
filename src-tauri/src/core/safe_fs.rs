//! Shared path / image validation for IPC and pack file joins.
//!
//! # Path policy (defense-in-depth)
//!
//! **Relative joins** (`ensure_safe_relative_path`, `path_from_slashes`, `join_under_parent`):
//! only Normal segments; no absolute paths, `.`, or `..`.
//!
//! **User-chosen absolute paths** (dialogs / operation dirs / icon-editor files):
//! allowed (product needs arbitrary pack folders), but must be:
//! - non-empty
//! - absolute
//! - free of lexical `..` (`ParentDir`) components
//!
//! Reads may require the path to exist as a regular file (and size/magic for images).
//! Writes to PNG destinations use [`ensure_png_output_path`] (extension + no `..` + absolute).
//!
//! This is **not** a workspace jail — compromised UI can still target any absolute path the
//! OS user can access. The goal is rejecting traversal tricks and malformed IPC strings.
//!
//! **Env overrides** (`TM_GAME_FILES_DIR`, etc.): same absolute / no-`..` checks when validated.

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

/// Reject any lexical `..` component in `path` (defense against traversal in absolute IPC strings).
pub fn ensure_no_parent_dir_components(path: &Path) -> Result<(), AppError> {
    for component in path.components() {
        if matches!(component, Component::ParentDir) {
            return Err(AppError::InvalidPath("path must not contain '..'"));
        }
    }
    Ok(())
}

/// User-supplied absolute path: non-empty, absolute, no `..` components.
///
/// Relative paths are rejected so IPC cannot depend on the process cwd.
pub fn ensure_user_absolute_path(path: &Path) -> Result<(), AppError> {
    if path.as_os_str().is_empty() {
        return Err(AppError::InvalidPath("path cannot be empty"));
    }
    if !path.is_absolute() {
        return Err(AppError::InvalidPath("path must be absolute"));
    }
    ensure_no_parent_dir_components(path)
}

/// Parse a trimmed user path string and apply [`ensure_user_absolute_path`].
pub fn parse_user_absolute_path(value: &str) -> Result<PathBuf, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidPath("path cannot be empty"));
    }
    let path = PathBuf::from(trimmed);
    ensure_user_absolute_path(&path)?;
    Ok(path)
}

/// Operation / dialog directory: absolute, no `..`. Existence is optional (output may be created).
pub fn ensure_user_directory_path(path: &Path) -> Result<(), AppError> {
    ensure_user_absolute_path(path)
}

/// Existing regular file for reads (absolute, no `..`, exists, is a file).
pub fn ensure_existing_user_file(path: &Path) -> Result<(), AppError> {
    ensure_user_absolute_path(path)?;
    if !path.exists() {
        return Err(AppError::InvalidPath("file does not exist"));
    }
    let meta = fs::metadata(path)?;
    if !meta.is_file() {
        return Err(AppError::InvalidPath("path must be a regular file"));
    }
    Ok(())
}

/// Canonicalize `path` and ensure it stays under `root` (both must exist).
/// Resolves symlinks/junctions where the OS supports it — mitigates delete/write escape.
pub fn ensure_canonical_under_root(path: &Path, root: &Path) -> Result<PathBuf, AppError> {
    let root_canon = root.canonicalize().map_err(|err| {
        AppError::IoError(format!(
            "failed to resolve root `{}`: {err}",
            shorten_path_for_display(root)
        ))
    })?;
    let path_canon = path.canonicalize().map_err(|err| {
        AppError::IoError(format!(
            "failed to resolve path `{}`: {err}",
            shorten_path_for_display(path)
        ))
    })?;
    if path_canon.strip_prefix(&root_canon).is_err() {
        return Err(AppError::InvalidPath(
            "path escapes its allowed root directory",
        ));
    }
    Ok(path_canon)
}

/// `remove_dir_all` only when `path` canonicalizes under `root` (symlink/junction hardening).
pub fn remove_dir_all_under_root(path: &Path, root: &Path) -> Result<(), AppError> {
    if !path.exists() {
        return Ok(());
    }
    let safe = ensure_canonical_under_root(path, root)?;
    fs::remove_dir_all(&safe).map_err(|err| {
        AppError::IoError(format!(
            "failed to remove directory `{}`: {err}",
            shorten_path_for_display(&safe)
        ))
    })?;
    Ok(())
}

/// Basename (or last two segments) for user-facing errors / CSV — reduces absolute-path leakage.
pub fn shorten_path_for_display(path: &Path) -> String {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    if file_name.is_empty() {
        return path.to_string_lossy().into_owned();
    }
    let parent_name = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str());
    match parent_name {
        Some(parent) if !parent.is_empty() => format!("{parent}/{file_name}"),
        _ => file_name.to_string(),
    }
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

/// Read a PNG from disk (path policy, existence, file, size, magic) and return a data URL.
pub fn png_file_to_data_url(path: &Path) -> Result<String, AppError> {
    ensure_existing_user_file(path)?;
    ensure_file_size_ok(path)?;
    let bytes = fs::read(path)?;
    ensure_png_magic(&bytes)?;
    let encoded = BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{encoded}"))
}

/// Validate output path for writing a PNG (absolute, ends with `.png`, no `..`).
pub fn ensure_png_output_path(path: &Path) -> Result<(), AppError> {
    ensure_user_absolute_path(path)?;
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
///
/// Parent directory is created if needed. The write always targets
/// `canonicalize(parent)/file_name` so junction/symlink parents resolve to a
/// concrete directory before the file is written. Existing symlink leaves are
/// rejected (do not follow a link as the write destination).
pub fn save_png_data_url(output_path: &Path, png_data_url: &str) -> Result<(), AppError> {
    ensure_png_output_path(output_path)?;
    let bytes = decode_png_data_url(png_data_url)?;
    let Some(parent) = output_path.parent() else {
        return Err(AppError::InvalidPath("output path has no parent directory"));
    };
    if parent.as_os_str().is_empty() {
        return Err(AppError::InvalidPath("output path has no parent directory"));
    }
    ensure_no_parent_dir_components(parent)?;
    fs::create_dir_all(parent)?;
    let parent_canon = parent.canonicalize().map_err(|err| {
        AppError::IoError(format!(
            "failed to resolve output directory `{}`: {err}",
            shorten_path_for_display(parent)
        ))
    })?;
    let Some(file_name) = output_path.file_name() else {
        return Err(AppError::InvalidPath("output path has no file name"));
    };
    let final_path = parent_canon.join(file_name);
    if final_path
        .symlink_metadata()
        .map(|meta| meta.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err(AppError::InvalidPath(
            "refusing to write through a symbolic link",
        ));
    }
    fs::write(&final_path, bytes)?;
    Ok(())
}

/// Ensure a user-supplied image path exists, is a file, within size limits, and passes path policy.
pub fn ensure_readable_image_file(path: &Path) -> Result<(), AppError> {
    ensure_existing_user_file(path)?;
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
    fn png_output_requires_extension_and_absolute() {
        #[cfg(windows)]
        {
            assert!(ensure_png_output_path(Path::new(r"C:\out\sheet.PNG")).is_ok());
            assert!(ensure_png_output_path(Path::new(r"C:\out\..\evil.png")).is_err());
            assert!(ensure_png_output_path(Path::new(r"C:\out\sheet.jpg")).is_err());
        }
        #[cfg(not(windows))]
        {
            assert!(ensure_png_output_path(Path::new("/tmp/out/sheet.PNG")).is_ok());
            assert!(ensure_png_output_path(Path::new("/tmp/out/../evil.png")).is_err());
            assert!(ensure_png_output_path(Path::new("/tmp/out/sheet.jpg")).is_err());
        }
        assert!(ensure_png_output_path(Path::new("relative.png")).is_err());
        assert!(ensure_png_output_path(Path::new("")).is_err());
    }

    #[test]
    fn user_absolute_rejects_relative_and_dotdot() {
        assert!(ensure_user_absolute_path(Path::new("relative/dir")).is_err());
        #[cfg(windows)]
        {
            assert!(ensure_user_absolute_path(Path::new(r"C:\packs\input")).is_ok());
            assert!(ensure_user_absolute_path(Path::new(r"C:\packs\..\Windows")).is_err());
        }
        #[cfg(not(windows))]
        {
            assert!(ensure_user_absolute_path(Path::new("/packs/input")).is_ok());
            assert!(ensure_user_absolute_path(Path::new("/packs/../etc")).is_err());
        }
    }

    #[test]
    fn shorten_path_keeps_basename_context() {
        #[cfg(windows)]
        {
            assert_eq!(
                shorten_path_for_display(Path::new(r"C:\Users\Kevin\TextureManager2\game-files")),
                "TextureManager2/game-files"
            );
        }
        #[cfg(not(windows))]
        {
            assert_eq!(
                shorten_path_for_display(Path::new("/home/kevin/TextureManager2/game-files")),
                "TextureManager2/game-files"
            );
        }
    }

    #[test]
    fn save_png_data_url_writes_under_canonical_parent() {
        let root = std::env::temp_dir().join(format!(
            "tm2-png-write-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        ));
        let out_dir = root.join("out");
        fs::create_dir_all(&out_dir).expect("mkdir");
        let out_path = out_dir.join("sheet.png");
        // Minimal valid PNG (1x1) magic + IHDR/IDAT/IEND is large; use magic-only
        // decode path — decode_png_data_url requires magic, write uses full bytes.
        let png_bytes: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, b't', b'e', b's', b't',
        ];
        let data_url = format!(
            "data:image/png;base64,{}",
            BASE64_STANDARD.encode(png_bytes)
        );
        save_png_data_url(&out_path, &data_url).expect("write");
        assert!(out_path.exists());
        let written = fs::read(&out_path).expect("read");
        assert_eq!(written, png_bytes);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn remove_dir_all_under_root_rejects_escape() {
        let root = std::env::temp_dir().join(format!(
            "tm2-safe-fs-root-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        ));
        let inside = root.join("cache").join("sheet");
        fs::create_dir_all(&inside).expect("mkdir");
        let outside = std::env::temp_dir().join(format!(
            "tm2-safe-fs-outside-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(1)
        ));
        fs::create_dir_all(&outside).expect("mkdir outside");

        assert!(remove_dir_all_under_root(&inside, &root.join("cache")).is_ok());
        assert!(!inside.exists());
        assert!(remove_dir_all_under_root(&outside, &root.join("cache")).is_err());
        assert!(outside.exists());

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }
}
