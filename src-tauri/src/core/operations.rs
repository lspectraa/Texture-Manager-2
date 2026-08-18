use std::path::Path;

use crate::core::contracts::{
    phase_defaults, ConvertToNewVersionOptions, GeodeButtonsOptions, GlowMakerOptions,
    MergerOptions, OperationKind, OperationOptions, OperationPlan, OperationRequest, PorterOptions,
    RandomizerOptions, SplitterOptions, UpscalerModel, UpscalerOptions,
};
use crate::core::errors::AppError;
use crate::core::safe_fs::{ensure_user_directory_path, parse_user_absolute_path};

pub fn build_operation_plan(request: OperationRequest) -> Result<OperationPlan, AppError> {
    // Absolute dirs from the folder dialog are allowed; reject empty / relative / `..` tricks.
    let input_dir = parse_user_absolute_path(&request.input_dir)?;
    let output_dir = parse_user_absolute_path(&request.output_dir)?;
    ensure_user_directory_path(Path::new(&input_dir))?;
    ensure_user_directory_path(Path::new(&output_dir))?;

    let defaults = phase_defaults();
    let options = match request.kind.clone() {
        OperationKind::Splitter => match request.options {
            Some(OperationOptions::Splitter(existing)) => {
                OperationOptions::Splitter(SplitterOptions {
                    sheet_concurrency: existing.sheet_concurrency.clamp(1, 64),
                    skip_icons: existing.skip_icons,
                })
            }
            None => OperationOptions::Splitter(defaults.splitter),
            Some(_) => return Err(AppError::InvalidOperation("splitter options mismatch")),
        },
        OperationKind::PorterSplitter => match request.options {
            Some(OperationOptions::PorterSplitter(existing)) => {
                OperationOptions::PorterSplitter(with_porter_phase_one_defaults(existing))
            }
            None => OperationOptions::PorterSplitter(defaults.porter),
            Some(_) => {
                return Err(AppError::InvalidOperation(
                    "porter splitter options mismatch",
                ))
            }
        },
        OperationKind::Merger => match request.options {
            Some(OperationOptions::Merger(existing)) => {
                OperationOptions::Merger(with_merger_phase_one_defaults(existing))
            }
            None => OperationOptions::Merger(defaults.merger),
            Some(_) => return Err(AppError::InvalidOperation("merger options mismatch")),
        },
        OperationKind::ConvertToNewVersion => match request.options {
            Some(OperationOptions::ConvertToNewVersion(existing)) => {
                OperationOptions::ConvertToNewVersion(with_convert_to_new_version_defaults(
                    existing,
                ))
            }
            None => OperationOptions::ConvertToNewVersion(defaults.convert_to_new_version),
            Some(_) => {
                return Err(AppError::InvalidOperation(
                    "convert to new version options mismatch",
                ));
            }
        },
        OperationKind::Randomizer => match request.options {
            Some(OperationOptions::Randomizer(existing)) => OperationOptions::Randomizer(existing),
            None => OperationOptions::Randomizer(RandomizerOptions { seed: None }),
            Some(_) => return Err(AppError::InvalidOperation("randomizer options mismatch")),
        },
        OperationKind::GlowMaker => match request.options {
            Some(OperationOptions::GlowMaker(existing)) => {
                OperationOptions::GlowMaker(with_glow_phase_three_defaults(existing))
            }
            None => OperationOptions::GlowMaker(GlowMakerOptions {
                thickness: 4,
                tolerance: 6,
                dimensions: None,
                rainbow_glow: false,
                composite_layers: true,
            }),
            Some(_) => return Err(AppError::InvalidOperation("glow maker options mismatch")),
        },
        OperationKind::GeodeButtons => match request.options {
            Some(OperationOptions::GeodeButtons(existing)) => {
                OperationOptions::GeodeButtons(with_geode_buttons_defaults(existing))
            }
            None => OperationOptions::GeodeButtons(GeodeButtonsOptions {
                sheet_stem: "BlankSheet-uhd".to_string(),
                templates: crate::core::contracts::GeodeButtonsTemplates {
                    family_templates: std::collections::BTreeMap::new(),
                    tab_selected: None,
                    tab_unselected: None,
                    tab_unselected_dark: None,
                },
                variant_rules: Vec::new(),
                family_variant_rules: None,
                sheet_concurrency: 1,
            }),
            Some(_) => return Err(AppError::InvalidOperation("geode buttons options mismatch")),
        },
        OperationKind::Upscaler => match request.options {
            Some(OperationOptions::Upscaler(existing)) => {
                OperationOptions::Upscaler(with_upscaler_defaults(existing)?)
            }
            None => OperationOptions::Upscaler(defaults.upscaler),
            Some(_) => return Err(AppError::InvalidOperation("upscaler options mismatch")),
        },
    };

    Ok(OperationPlan {
        kind: request.kind,
        input_dir: input_dir.to_string_lossy().into_owned(),
        output_dir: output_dir.to_string_lossy().into_owned(),
        options,
    })
}

fn with_porter_phase_one_defaults(existing: PorterOptions) -> PorterOptions {
    PorterOptions {
        low_port: existing.low_port,
        dimensions: existing.dimensions,
        sheet_concurrency: existing.sheet_concurrency.clamp(1, 64),
    }
}

fn with_glow_phase_three_defaults(existing: GlowMakerOptions) -> GlowMakerOptions {
    GlowMakerOptions {
        thickness: existing.thickness.clamp(1, 128),
        tolerance: existing.tolerance,
        dimensions: existing.dimensions,
        rainbow_glow: existing.rainbow_glow,
        composite_layers: existing.composite_layers,
    }
}

fn with_geode_buttons_defaults(existing: GeodeButtonsOptions) -> GeodeButtonsOptions {
    GeodeButtonsOptions {
        sheet_stem: existing.sheet_stem.trim().to_string(),
        templates: existing.templates,
        variant_rules: existing.variant_rules,
        family_variant_rules: existing.family_variant_rules,
        sheet_concurrency: existing.sheet_concurrency.clamp(1, 64),
    }
}

fn with_merger_phase_one_defaults(existing: MergerOptions) -> MergerOptions {
    MergerOptions {
        include_outside_plist_files: existing.include_outside_plist_files,
        dimensions: existing.dimensions,
        sheet_concurrency: existing.sheet_concurrency.clamp(1, 64),
    }
}

fn with_convert_to_new_version_defaults(
    existing: ConvertToNewVersionOptions,
) -> ConvertToNewVersionOptions {
    ConvertToNewVersionOptions {
        game_version: existing.game_version.trim().to_string(),
        sheet_concurrency: existing.sheet_concurrency.clamp(1, 64),
    }
}

fn with_upscaler_defaults(existing: UpscalerOptions) -> Result<UpscalerOptions, AppError> {
    let game_version = existing.game_version.trim().to_string();
    if existing.convert_to_latest && game_version.is_empty() {
        return Err(AppError::InvalidOperation(
            "game version is required when convert to latest is enabled",
        ));
    }
    Ok(UpscalerOptions {
        model: UpscalerModel::USER_DEFAULT,
        target_graphics: existing.target_graphics,
        convert_to_latest: existing.convert_to_latest,
        game_version,
        sheet_concurrency: existing.sheet_concurrency.clamp(1, 1),
        cache_match_mode: existing.cache_match_mode,
        glow_thickness: existing.glow_thickness.clamp(1, 128),
        glow_tolerance: existing.glow_tolerance,
    })
}

#[cfg(test)]
mod tests {
    use crate::core::contracts::{
        ConvertToNewVersionOptions, MergerOptions, OperationKind, OperationOptions,
        OperationRequest, PorterOptions,
    };
    use crate::core::operations::build_operation_plan;

    fn abs_dir(name: &str) -> String {
        std::env::temp_dir()
            .join(name)
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn splitter_forces_non_toggleable_defaults() {
        let request = OperationRequest {
            kind: OperationKind::Splitter,
            input_dir: abs_dir("tm2-op-in"),
            output_dir: abs_dir("tm2-op-out"),
            options: Some(OperationOptions::Splitter(
                crate::core::contracts::SplitterOptions {
                    sheet_concurrency: 2,
                    skip_icons: true,
                },
            )),
        };

        let plan = build_operation_plan(request).expect("plan should be built");
        match plan.options {
            OperationOptions::Splitter(options) => {
                assert_eq!(options.sheet_concurrency, 2);
                assert!(options.skip_icons);
            }
            _ => panic!("expected splitter options"),
        }
    }

    #[test]
    fn porter_forces_auto_adjust_and_alpha_trim() {
        let request = OperationRequest {
            kind: OperationKind::PorterSplitter,
            input_dir: abs_dir("tm2-op-in"),
            output_dir: abs_dir("tm2-op-out"),
            options: Some(OperationOptions::PorterSplitter(PorterOptions {
                low_port: true,
                dimensions: None,
                sheet_concurrency: 3,
            })),
        };

        let plan = build_operation_plan(request).expect("plan should be built");
        match plan.options {
            OperationOptions::PorterSplitter(options) => {
                assert!(options.low_port);
                assert_eq!(options.sheet_concurrency, 3);
            }
            _ => panic!("expected porter splitter options"),
        }
    }

    #[test]
    fn merger_forces_auto_adjust_and_alpha_trim() {
        let request = OperationRequest {
            kind: OperationKind::Merger,
            input_dir: abs_dir("tm2-op-in"),
            output_dir: abs_dir("tm2-op-out"),
            options: Some(OperationOptions::Merger(MergerOptions {
                include_outside_plist_files: true,
                dimensions: None,
                sheet_concurrency: 8,
            })),
        };

        let plan = build_operation_plan(request).expect("plan should be built");
        match plan.options {
            OperationOptions::Merger(options) => {
                assert!(options.include_outside_plist_files);
                assert_eq!(options.sheet_concurrency, 8);
            }
            _ => panic!("expected merger options"),
        }
    }

    #[test]
    fn convert_to_new_version_clamps_and_trims_fields() {
        let request = OperationRequest {
            kind: OperationKind::ConvertToNewVersion,
            input_dir: abs_dir("tm2-op-in"),
            output_dir: abs_dir("tm2-op-out"),
            options: Some(OperationOptions::ConvertToNewVersion(
                ConvertToNewVersionOptions {
                    game_version: " 2.206 ".to_string(),
                    sheet_concurrency: 99,
                },
            )),
        };

        let plan = build_operation_plan(request).expect("plan should be built");
        match plan.options {
            OperationOptions::ConvertToNewVersion(options) => {
                assert_eq!(options.game_version, "2.206");
                assert_eq!(options.sheet_concurrency, 64);
            }
            _ => panic!("expected convert to new version options"),
        }
    }

    #[test]
    fn upscaler_clamps_concurrency_and_requires_version_when_converting() {
        use crate::core::contracts::{UpscalerModel, UpscalerOptions, UpscalerTargetGraphics};

        let ok = OperationRequest {
            kind: OperationKind::Upscaler,
            input_dir: abs_dir("tm2-op-in"),
            output_dir: abs_dir("tm2-op-out"),
            options: Some(OperationOptions::Upscaler(UpscalerOptions {
                model: UpscalerModel::Waifu2x,
                target_graphics: UpscalerTargetGraphics::Hd,
                convert_to_latest: false,
                game_version: String::new(),
                sheet_concurrency: 99,
                cache_match_mode: Default::default(),
                glow_thickness: 4,
                glow_tolerance: 32,
            })),
        };
        let plan = build_operation_plan(ok).expect("plan should be built");
        match plan.options {
            OperationOptions::Upscaler(options) => {
                assert_eq!(options.sheet_concurrency, 1);
                assert_eq!(options.model, UpscalerModel::Waifu2x);
            }
            _ => panic!("expected upscaler options"),
        }

        let forced_default = OperationRequest {
            kind: OperationKind::Upscaler,
            input_dir: abs_dir("tm2-op-in"),
            output_dir: abs_dir("tm2-op-out"),
            options: Some(OperationOptions::Upscaler(UpscalerOptions {
                model: UpscalerModel::RealesrganAnime,
                target_graphics: UpscalerTargetGraphics::Hd,
                convert_to_latest: false,
                game_version: String::new(),
                sheet_concurrency: 1,
                cache_match_mode: Default::default(),
                glow_thickness: 4,
                glow_tolerance: 32,
            })),
        };
        let plan = build_operation_plan(forced_default).expect("plan should be built");
        match plan.options {
            OperationOptions::Upscaler(options) => {
                assert_eq!(options.model, UpscalerModel::Waifu2x);
            }
            _ => panic!("expected upscaler options"),
        }

        let missing_version = OperationRequest {
            kind: OperationKind::Upscaler,
            input_dir: abs_dir("tm2-op-in"),
            output_dir: abs_dir("tm2-op-out"),
            options: Some(OperationOptions::Upscaler(UpscalerOptions {
                model: UpscalerModel::RealesrganAnime,
                target_graphics: UpscalerTargetGraphics::Uhd,
                convert_to_latest: true,
                game_version: "  ".to_string(),
                sheet_concurrency: 1,
                cache_match_mode: Default::default(),
                glow_thickness: 4,
                glow_tolerance: 32,
            })),
        };
        assert!(build_operation_plan(missing_version).is_err());
    }

    #[test]
    fn rejects_relative_operation_dirs() {
        let request = OperationRequest {
            kind: OperationKind::Splitter,
            input_dir: "relative-in".to_string(),
            output_dir: "relative-out".to_string(),
            options: None,
        };
        assert!(build_operation_plan(request).is_err());
    }
}
