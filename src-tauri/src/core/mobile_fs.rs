//! Copy picked files/folders into the app sandbox and export results.
//!
//! Desktop import is a no-op (returns the original absolute path). Android copies
//! into `{game-files}/imports` so existing commands only see sandbox paths.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use zip::write::SimpleFileOptions;
use zip::CompressionMethod;
use zip::ZipWriter;

use crate::core::errors::AppError;
use crate::core::game_files::resolve_game_files_root;
use crate::core::safe_fs::{is_safe_path_segment, parse_user_absolute_path};

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn copy_recursive(from: &Path, to: &Path) -> Result<(), AppError> {
    if from.is_file() {
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(from, to)?;
        return Ok(());
    }
    if !from.is_dir() {
        return Err(AppError::IoError(
            "Selected path is not a readable file or folder.".to_string(),
        ));
    }
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        copy_recursive(&entry.path(), &dest)?;
    }
    Ok(())
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn unique_import_dest(root: &Path, source: &Path) -> PathBuf {
    let stamp = timestamp_millis();
    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| is_safe_path_segment(value))
        .unwrap_or("import");
    root.join(format!("{stamp}-{name}"))
}

/// Copy a picked file/folder into the sandbox on Android; pass through on desktop.
pub fn import_user_path(source_path: &str) -> Result<PathBuf, AppError> {
    #[cfg(not(target_os = "android"))]
    {
        parse_user_absolute_path(source_path)
    }

    #[cfg(target_os = "android")]
    {
        let src = PathBuf::from(source_path.trim());
        if !src.exists() {
            return Err(AppError::IoError(
                "Selected path is not a readable file or folder. Pick it again from the file picker."
                    .to_string(),
            ));
        }
        let imports = resolve_game_files_root().join("imports");
        fs::create_dir_all(&imports)?;
        let dest = unique_import_dest(&imports, &src);
        copy_recursive(&src, &dest)?;
        Ok(dest)
    }
}

pub fn allocate_output_dir(tool_id: &str) -> Result<PathBuf, AppError> {
    let safe_tool = if is_safe_path_segment(tool_id) {
        tool_id
    } else {
        "tool"
    };
    let dir = resolve_game_files_root()
        .join("outputs")
        .join(safe_tool)
        .join(timestamp_millis().to_string());
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn zip_walk(zip: &mut ZipWriter<fs::File>, root: &Path, current: &Path) -> Result<(), AppError> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let relative = path.strip_prefix(root).map_err(|_| {
            AppError::IoError("failed to build zip entry path".to_string())
        })?;
        let name = relative.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            zip.add_directory(&format!("{name}/"), SimpleFileOptions::default())
                .map_err(|err| AppError::IoError(format!("failed to add zip directory: {err}")))?;
            zip_walk(zip, root, &path)?;
        } else if path.is_file() {
            zip.start_file(
                &name,
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
            )
            .map_err(|err| AppError::IoError(format!("failed to start zip file: {err}")))?;
            let bytes = fs::read(&path)?;
            zip.write_all(&bytes)
                .map_err(|err| AppError::IoError(format!("failed to write zip file: {err}")))?;
        }
    }
    Ok(())
}

pub fn export_directory_as_zip(source_dir: &str, zip_path: &str) -> Result<(), AppError> {
    let source = parse_user_absolute_path(source_dir)?;
    if !source.is_dir() {
        return Err(AppError::IoError(
            "Output folder does not exist or is not a directory.".to_string(),
        ));
    }
    let dest = parse_user_absolute_path(zip_path)?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let file = fs::File::create(&dest).map_err(|err| {
        AppError::IoError(format!(
            "failed to create zip at `{}`: {err}",
            dest.display()
        ))
    })?;
    let mut zip = ZipWriter::new(file);
    zip_walk(&mut zip, &source, &source)?;
    zip.finish()
        .map_err(|err| AppError::IoError(format!("failed to finish zip: {err}")))?;
    Ok(())
}
