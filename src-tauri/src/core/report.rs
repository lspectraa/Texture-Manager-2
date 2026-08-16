use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReportLevel {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReportIssue {
    pub level: ReportLevel,
    pub message: String,
    pub file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OperationProgress {
    pub gamesheet_name: String,
    pub sprites_completed: u32,
    pub sprites_total: u32,
    /// Gamesheets (plist/png pairs) finished; meaningful for porter splitter.
    #[serde(default)]
    pub plists_completed: u32,
    #[serde(default)]
    pub plists_total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct OperationReport {
    pub operation: String,
    pub files_seen: usize,
    pub files_processed: usize,
    pub output_dir: String,
    pub elapsed_ms: u128,
    pub issues: Vec<ReportIssue>,
    /// Sprites resolved via AI sidecar (upscaler).
    #[serde(default)]
    pub sprites_ai_upscaled: usize,
    /// Sprites reused from the sprite hash / game-files cache (upscaler).
    #[serde(default)]
    pub sprites_from_cache: usize,
}
