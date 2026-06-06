use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::GameFilesLayout;
use crate::core::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalManifestFileEntry {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalManifest {
    pub schema_version: u32,
    pub installed_at: String,
    #[serde(default)]
    pub files: Vec<LocalManifestFileEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncStatus {
    NotConfigured,
    UpToDate,
}

/// Placeholder for future GitHub-hosted manifest sync. No network I/O yet.
pub fn check_for_updates(layout: &GameFilesLayout) -> Result<SyncStatus, AppError> {
    ensure_local_manifest_placeholder(&layout.root)?;
    Ok(SyncStatus::NotConfigured)
}

fn ensure_local_manifest_placeholder(root: &Path) -> Result<(), AppError> {
    let manifest_path = root.join("manifest.local.json");
    if manifest_path.exists() {
        return Ok(());
    }

    let manifest = LocalManifest {
        schema_version: 1,
        installed_at: chrono_lite_timestamp(),
        files: Vec::new(),
    };
    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|err| AppError::IoError(format!("failed to serialize manifest: {err}")))?;
    fs::write(&manifest_path, json)?;
    Ok(())
}

fn chrono_lite_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{secs}")
}
