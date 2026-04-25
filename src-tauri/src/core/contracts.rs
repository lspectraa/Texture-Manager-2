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
    /// Max concurrent merge source folders (each may contain multiple plists).
    pub sheet_concurrency: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConvertToNewVersionOptions {
    pub game_version: String,
    /// Max concurrent plist/png gamesheets processed in parallel.
    pub sheet_concurrency: u32,
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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum OperationOptions {
    Splitter(SplitterOptions),
    PorterSplitter(PorterOptions),
    Merger(MergerOptions),
    ConvertToNewVersion(ConvertToNewVersionOptions),
    Randomizer(RandomizerOptions),
    GlowMaker(GlowMakerOptions),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OperationRequest {
    pub kind: OperationKind,
    pub input_dir: String,
    pub output_dir: String,
    pub options: Option<OperationOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
}

pub fn phase_defaults() -> PhaseDefaults {
    PhaseDefaults {
        splitter: SplitterOptions {
            sheet_concurrency: 5,
        },
        porter: PorterOptions {
            low_port: false,
            dimensions: None,
            sheet_concurrency: 5,
        },
        merger: MergerOptions {
            include_outside_plist_files: false,
            dimensions: None,
            sheet_concurrency: 5
        },
        convert_to_new_version: ConvertToNewVersionOptions {
            game_version: String::new(),
            sheet_concurrency: 5,
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
    }
}
