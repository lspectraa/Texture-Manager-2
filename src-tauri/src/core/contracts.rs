use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OperationKind {
    Splitter,
    PorterSplitter,
    Merger,
    ConvertToNewVersion,
    Randomizer,
    GlowMaker,
    GeodeButtons,
    Upscaler,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DimensionOverride {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SplitterOptions {
    /// Max concurrent gamesheets (plist/png pairs) processed in parallel.
    pub sheet_concurrency: u32,
    /// When true, skip discovering/splitting sheets under an `icons` folder.
    #[serde(default)]
    pub skip_icons: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PorterOptions {
    /// UI: "Port to Low Graphics". When true, UHD/HD splitter porter writes **two** atlases: medium
    /// (`-hd` names; UHD at ½ linear, HD at source scale) and low (suffix stripped; half of medium’s linear scale).
    /// Tier-less stems still get a single 0.5-scale pass with low-style plist renames.
    pub low_port: bool,
    pub dimensions: Option<DimensionOverride>,
    /// Max concurrent plist/png gamesheets and standalone `.png` copy-through jobs.
    pub sheet_concurrency: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MergerOptions {
    pub include_outside_plist_files: bool,
    pub dimensions: Option<DimensionOverride>,
    /// Max concurrent gamesheet plist merges (one job per plist file under discovered source dirs).
    pub sheet_concurrency: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConvertToNewVersionOptions {
    pub game_version: String,
    /// Max concurrent plist/png gamesheets processed in parallel.
    pub sheet_concurrency: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum UpscalerModel {
    /// Real-ESRGAN AnimeVideo v3 — used automatically for icon sprites,
    /// including glow layers and bird/UFO capsules.
    RealesrganAnime,
    /// Waifu2x CUNet — user/default model for non-icon sprites.
    Waifu2x,
}

impl UpscalerModel {
    /// Gamesheet default. Icons still route to [`Self::RealesrganAnime`].
    pub const USER_DEFAULT: Self = Self::Waifu2x;
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum UpscalerTargetGraphics {
    Hd,
    Uhd,
}

/// How pack sprites are matched to vanilla game-file sprites for cache reuse.
/// Kept for serde compatibility; upscaler always uses loose similarity after exact hash.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum UpscalerCacheMatchMode {
    ExactHash,
    #[default]
    LooseSimilarity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpscalerOptions {
    pub model: UpscalerModel,
    pub target_graphics: UpscalerTargetGraphics,
    /// When true, run Convert to Latest on the Upscaled/ tree after upscaling.
    pub convert_to_latest: bool,
    /// Previous game version for convert (required when `convert_to_latest`).
    pub game_version: String,
    /// Max concurrent gamesheets (1–4; VRAM-bound).
    pub sheet_concurrency: u32,
    /// Sprite-cache matching strategy against vanilla game files.
    #[serde(default)]
    pub cache_match_mode: UpscalerCacheMatchMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RandomizerOptions {
    pub seed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GlowMakerOptions {
    pub thickness: u32,
    pub tolerance: u8,
    pub dimensions: Option<DimensionOverride>,
    pub rainbow_glow: bool,
    pub composite_layers: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HsvDelta {
    /// Hue delta in degrees (wraps 0..360).
    pub hue_deg: f32,
    /// Saturation delta, additive (-1..1 clamped after apply).
    pub sat_delta: f32,
    /// Value delta, additive (-1..1 clamped after apply).
    pub val_delta: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum GeodeButtonsVariant {
    Primary,
    Secondary,
    DarkAqua,
    DarkPurple,
    Gray,
    Error,
    Info,
    Pink,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GeodeButtonsVariantRule {
    pub variant: GeodeButtonsVariant,
    pub hsv: HsvDelta,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GeodeButtonsTemplates {
    /// One template image per family id (e.g. `circleBig`, `editorBase`), except `tabs`.
    pub family_templates: std::collections::BTreeMap<String, String>,
    /// Optional per-tab-state templates (frame keys). If missing, falls back to `family_templates["tabs"]`.
    pub tab_selected: Option<String>,
    pub tab_unselected: Option<String>,
    pub tab_unselected_dark: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GeodeButtonsOptions {
    /// If non-empty, only sheets whose stem matches (case-insensitive) are processed.
    /// Default will target `BlankSheet-uhd`.
    pub sheet_stem: String,
    pub templates: GeodeButtonsTemplates,
    /// Global variant HSV rules (applies unless overridden per family).
    pub variant_rules: Vec<GeodeButtonsVariantRule>,
    /// Optional per-family overrides: family id -> variant -> hsv delta.
    pub family_variant_rules: Option<
        std::collections::BTreeMap<
            String,
            std::collections::BTreeMap<GeodeButtonsVariant, HsvDelta>,
        >,
    >,
    /// Max concurrent sheets (1–64). Typically 1 here.
    pub sheet_concurrency: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum OperationOptions {
    Splitter(SplitterOptions),
    PorterSplitter(PorterOptions),
    Merger(MergerOptions),
    ConvertToNewVersion(ConvertToNewVersionOptions),
    Randomizer(RandomizerOptions),
    GlowMaker(GlowMakerOptions),
    GeodeButtons(GeodeButtonsOptions),
    Upscaler(UpscalerOptions),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OperationRequest {
    pub kind: OperationKind,
    pub input_dir: String,
    pub output_dir: String,
    pub options: Option<OperationOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OperationPlan {
    pub kind: OperationKind,
    pub input_dir: String,
    pub output_dir: String,
    pub options: OperationOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PhaseDefaults {
    pub splitter: SplitterOptions,
    pub porter: PorterOptions,
    pub merger: MergerOptions,
    pub convert_to_new_version: ConvertToNewVersionOptions,
    pub upscaler: UpscalerOptions,
}

pub fn phase_defaults() -> PhaseDefaults {
    PhaseDefaults {
        splitter: SplitterOptions {
            sheet_concurrency: 5,
            skip_icons: false,
        },
        porter: PorterOptions {
            low_port: false,
            dimensions: None,
            sheet_concurrency: 5,
        },
        merger: MergerOptions {
            include_outside_plist_files: false,
            dimensions: None,
            sheet_concurrency: 5,
        },
        convert_to_new_version: ConvertToNewVersionOptions {
            game_version: String::new(),
            sheet_concurrency: 5,
        },
        upscaler: UpscalerOptions {
            model: UpscalerModel::USER_DEFAULT,
            target_graphics: UpscalerTargetGraphics::Uhd,
            convert_to_latest: false,
            game_version: String::new(),
            sheet_concurrency: 1,
            cache_match_mode: UpscalerCacheMatchMode::LooseSimilarity,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::phase_defaults;

    #[test]
    fn phase_defaults_include_convert_to_new_version() {
        let defaults = phase_defaults();
        assert_eq!(defaults.convert_to_new_version.game_version, "");
        assert_eq!(defaults.convert_to_new_version.sheet_concurrency, 5);
        assert_eq!(defaults.upscaler.sheet_concurrency, 1);
        assert!(!defaults.upscaler.convert_to_latest);
    }
}
