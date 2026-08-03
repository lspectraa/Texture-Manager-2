//! Texture pack installer: discover zip/folder install units, copy into Geode paths,
//! and scaffold new texture-loader packs.

use std::fs::{self, File};
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::core::contracts::{
    ConvertToNewVersionOptions, OperationKind, OperationOptions, OperationPlan, PorterOptions,
};
use crate::core::convert_to_new_version::execute_convert_to_new_version;
use crate::core::discovery::is_reserved_output_dir_name;
use crate::core::errors::AppError;
use crate::core::executor::{execute_operation_plan, execute_porter_splitter};
use crate::core::game_files::{geometry_dash_required_error, GameFilesLayout};
use crate::core::report::{OperationProgress, ReportLevel};
use crate::core::safe_fs::{
    ensure_existing_user_file, ensure_no_parent_dir_components, ensure_user_absolute_path,
    ensure_user_directory_path, is_safe_path_segment, parse_user_absolute_path,
    remove_dir_all_under_root, shorten_path_for_display,
};

const PACK_INSTALL_TEMP_DIR: &str = "pack-install-temp";
const MAX_TREE_ENTRIES: usize = 400;
/// How deep to search for a texture-loader `packs/` directory under a source root.
const MAX_PACKS_DIR_SEARCH_DEPTH: usize = 6;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PackMetadata {
    pub textureldr: String,
    pub name: String,
    pub id: String,
    pub version: String,
    pub author: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InstallUnitKind {
    Pack,
    ConfigTree,
    Mod,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallTreeNode {
    pub name: String,
    pub is_dir: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<InstallTreeNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallUnit {
    pub id: String,
    pub kind: InstallUnitKind,
    pub label: String,
    pub source_path: String,
    pub destination_path: String,
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tree: Option<InstallTreeNode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<PackMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack_png_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub source_path: String,
    pub work_root: String,
    pub is_zip: bool,
    pub units: Vec<InstallUnit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temp_dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTexturePackRequest {
    pub folder_name: String,
    pub metadata: PackMetadata,
    #[serde(default)]
    pub pack_png_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateTexturePackResult {
    pub pack_dir: String,
    pub pack_json_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pack_png_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReadPackMetadataResult {
    pub metadata: Option<PackMetadata>,
    pub pack_png_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PackInstallIssue {
    pub level: ReportLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstallPackResult {
    pub installed: usize,
    pub skipped: usize,
    pub issues: Vec<PackInstallIssue>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PackInstallProgress {
    pub unit_id: String,
    pub label: String,
    pub completed: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPackOptions {
    /// When true, run Convert to New Version on each installed Pack unit and overlay results.
    #[serde(default)]
    pub convert_to_latest_version: bool,
    /// Previous game version for convert (e.g. `"2.2"`, `"2.11"`). Required when convert is on.
    #[serde(default)]
    pub game_version: String,
    /// When true, run Porter on each installed Pack unit and overlay `{temp}/Ported` into the pack.
    #[serde(default)]
    pub port_packs: bool,
    /// Porter "Port to Low Graphics" — write medium + low tier outputs when enabled.
    #[serde(default)]
    pub low_port: bool,
    #[serde(default = "default_pack_install_sheet_concurrency")]
    pub sheet_concurrency: u32,
}

fn default_pack_install_sheet_concurrency() -> u32 {
    5
}

impl Default for InstallPackOptions {
    fn default() -> Self {
        Self {
            convert_to_latest_version: false,
            game_version: String::new(),
            port_packs: false,
            low_port: false,
            sheet_concurrency: default_pack_install_sheet_concurrency(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPackSummary {
    pub id: String,
    pub folder_name: String,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<PackMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack_png_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_count: Option<usize>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PackOperationKind {
    ConvertToNewVersion,
    PorterSplitter,
    Splitter,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunPackOperationOptions {
    #[serde(default)]
    pub game_version: String,
    #[serde(default)]
    pub low_port: bool,
    /// Output directory for Splitter (writes `Split/` under this path).
    #[serde(default)]
    pub output_dir: String,
    #[serde(default = "default_pack_install_sheet_concurrency")]
    pub sheet_concurrency: u32,
}

impl Default for RunPackOperationOptions {
    fn default() -> Self {
        Self {
            game_version: String::new(),
            low_port: false,
            output_dir: String::new(),
            sheet_concurrency: default_pack_install_sheet_concurrency(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunPackOperationResult {
    pub message: String,
    pub issues: Vec<PackInstallIssue>,
}

/// Discover install units from a folder or `.zip` path.
pub fn discover_pack_install(
    path: &str,
    layout: &GameFilesLayout,
) -> Result<InstallPlan, AppError> {
    if !layout.geometry_dash_found() {
        return Err(geometry_dash_required_error());
    }

    let source = parse_user_absolute_path(path)?;
    if !source.exists() {
        return Err(AppError::InvalidPath("path does not exist"));
    }

    let is_zip = source.is_file()
        && source
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"));

    let (work_root, temp_dir) = if is_zip {
        ensure_existing_user_file(&source)?;
        let temp = create_pack_install_temp_dir(layout)?;
        extract_zip_to_dir(&source, &temp)?;
        let discovered = resolve_discovery_root(&temp);
        (discovered, Some(temp))
    } else {
        if !source.is_dir() {
            return Err(AppError::InvalidOperation(
                "path must be a folder or a .zip archive",
            ));
        }
        let discovered = resolve_discovery_root(&source);
        (discovered, None)
    };

    let units = discover_units(&work_root, layout)?;
    Ok(InstallPlan {
        source_path: source.to_string_lossy().into_owned(),
        work_root: work_root.to_string_lossy().into_owned(),
        is_zip,
        units,
        temp_dir: temp_dir.map(|p| p.to_string_lossy().into_owned()),
    })
}

/// Install selected units from a previously discovered plan.
pub fn install_pack_plan<F>(
    plan: &InstallPlan,
    unit_ids: &[String],
    layout: &GameFilesLayout,
    options: &InstallPackOptions,
    on_progress: F,
) -> Result<InstallPackResult, AppError>
where
    F: FnMut(PackInstallProgress) + Send + 'static,
{
    if !layout.geometry_dash_found() {
        return Err(geometry_dash_required_error());
    }

    if options.convert_to_latest_version && options.game_version.trim().is_empty() {
        return Err(AppError::InvalidOperation(
            "previous game version is required when Convert to Latest Version is enabled",
        ));
    }

    let selected: Vec<&InstallUnit> = plan
        .units
        .iter()
        .filter(|unit| unit_ids.iter().any(|id| id == &unit.id))
        .collect();

    let total = selected.len() as u32;
    let mut installed = 0usize;
    let mut skipped = 0usize;
    let mut issues = Vec::new();
    let on_progress = Arc::new(Mutex::new(on_progress));

    if total == 0 {
        issues.push(PackInstallIssue {
            level: ReportLevel::Warning,
            message: "No install units were selected.".to_string(),
        });
        return Ok(InstallPackResult {
            installed,
            skipped,
            issues,
        });
    }

    let config_root = layout.geode_config();
    let mods_root = layout.geode_mods();
    fs::create_dir_all(&config_root)?;
    fs::create_dir_all(&mods_root)?;

    for (index, unit) in selected.iter().enumerate() {
        on_progress.lock().unwrap()(PackInstallProgress {
            unit_id: unit.id.clone(),
            label: unit.label.clone(),
            completed: index as u32,
            total,
        });

        if !unit.enabled {
            skipped += 1;
            issues.push(PackInstallIssue {
                level: ReportLevel::Info,
                message: format!("Skipped disabled unit `{}`.", unit.label),
            });
            continue;
        }

        let source = parse_user_absolute_path(&unit.source_path)?;
        let destination = parse_user_absolute_path(&unit.destination_path)?;
        ensure_destination_allowed(&destination, &config_root, &mods_root)?;

        match install_unit(unit.kind, &source, &destination) {
            Ok(()) => {
                if let Err(err) = apply_pack_install_overrides(unit, &destination) {
                    skipped += 1;
                    issues.push(PackInstallIssue {
                        level: ReportLevel::Error,
                        message: format!(
                            "Installed `{}` files but failed to apply pack metadata: {err}",
                            unit.label
                        ),
                    });
                    continue;
                }

                let mut unit_ok = true;

                if options.convert_to_latest_version && unit.kind == InstallUnitKind::Pack {
                    let phase = format!("Converting {}", unit.label);
                    emit_pack_progress(
                        &on_progress,
                        &unit.id,
                        &phase,
                        index as u32,
                        total,
                    );
                    let progress = Arc::clone(&on_progress);
                    let unit_id = unit.id.clone();
                    let phase_label = phase.clone();
                    match convert_installed_pack_to_latest(
                        &destination,
                        layout,
                        options,
                        move |op| {
                            emit_mapped_operation_progress(
                                &progress,
                                &unit_id,
                                &phase_label,
                                &op,
                            );
                        },
                    ) {
                        Ok(info) => {
                            if !info.trim().is_empty() {
                                issues.push(PackInstallIssue {
                                    level: ReportLevel::Info,
                                    message: format!(
                                        "Converted pack `{}` to latest version: {info}",
                                        unit.label
                                    ),
                                });
                            }
                        }
                        Err(err) => {
                            unit_ok = false;
                            issues.push(PackInstallIssue {
                                level: ReportLevel::Error,
                                message: format!(
                                    "Installed `{}` but Convert to Latest Version failed: {err}",
                                    unit.label
                                ),
                            });
                        }
                    }
                }

                if unit_ok && options.port_packs && unit.kind == InstallUnitKind::Pack {
                    let phase = format!("Porting {}", unit.label);
                    emit_pack_progress(
                        &on_progress,
                        &unit.id,
                        &phase,
                        index as u32,
                        total,
                    );
                    let progress = Arc::clone(&on_progress);
                    let unit_id = unit.id.clone();
                    let phase_label = phase.clone();
                    match port_installed_pack(
                        &destination,
                        layout,
                        options,
                        move |op| {
                            emit_mapped_operation_progress(
                                &progress,
                                &unit_id,
                                &phase_label,
                                &op,
                            );
                        },
                    ) {
                        Ok(info) => {
                            if !info.trim().is_empty() {
                                issues.push(PackInstallIssue {
                                    level: ReportLevel::Info,
                                    message: format!(
                                        "Ported pack `{}` into install folder: {info}",
                                        unit.label
                                    ),
                                });
                            }
                        }
                        Err(err) => {
                            unit_ok = false;
                            issues.push(PackInstallIssue {
                                level: ReportLevel::Error,
                                message: format!(
                                    "Installed `{}` but Porter failed: {err}",
                                    unit.label
                                ),
                            });
                        }
                    }
                }

                if unit_ok {
                    installed += 1;
                } else {
                    skipped += 1;
                }
            }
            Err(err) => {
                skipped += 1;
                issues.push(PackInstallIssue {
                    level: ReportLevel::Error,
                    message: format!(
                        "Failed to install `{}`: {err}",
                        unit.label
                    ),
                });
            }
        }
    }

    emit_pack_progress(&on_progress, "", "Complete", total, total);

    Ok(InstallPackResult {
        installed,
        skipped,
        issues,
    })
}

fn emit_pack_progress<F>(
    on_progress: &Arc<Mutex<F>>,
    unit_id: &str,
    label: &str,
    completed: u32,
    total: u32,
) where
    F: FnMut(PackInstallProgress) + Send + 'static,
{
    on_progress.lock().unwrap()(PackInstallProgress {
        unit_id: unit_id.to_string(),
        label: label.to_string(),
        completed,
        total,
    });
}

fn emit_mapped_operation_progress<F>(
    on_progress: &Arc<Mutex<F>>,
    unit_id: &str,
    phase_label: &str,
    op: &OperationProgress,
) where
    F: FnMut(PackInstallProgress) + Send + 'static,
{
    let sheet = op.gamesheet_name.trim();
    let label = if sheet.is_empty() {
        phase_label.to_string()
    } else {
        format!("{phase_label} · {sheet}")
    };
    let total = op.sprites_total.max(1);
    on_progress.lock().unwrap()(PackInstallProgress {
        unit_id: unit_id.to_string(),
        label,
        completed: op.sprites_completed.min(total),
        total,
    });
}

/// Copy pack is already at `pack_dest`; convert sheets against live GD and overlay updates.
fn convert_installed_pack_to_latest<F>(
    pack_dest: &Path,
    layout: &GameFilesLayout,
    options: &InstallPackOptions,
    on_op_progress: F,
) -> Result<String, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let temp = create_pack_install_temp_dir(layout)?;
    let convert_options = ConvertToNewVersionOptions {
        game_version: options.game_version.trim().to_string(),
        sheet_concurrency: options.sheet_concurrency.clamp(1, 64),
    };
    let op_plan = OperationPlan {
        kind: OperationKind::ConvertToNewVersion,
        input_dir: pack_dest.to_string_lossy().into_owned(),
        output_dir: temp.to_string_lossy().into_owned(),
        options: OperationOptions::ConvertToNewVersion(convert_options.clone()),
    };

    let progress = Arc::new(Mutex::new(on_op_progress));
    let cancel = Arc::new(AtomicBool::new(false));
    let report = execute_convert_to_new_version(
        &op_plan,
        pack_dest,
        &temp,
        Instant::now(),
        &convert_options,
        layout,
        &progress,
        cancel,
    )?;

    let converted_dir = temp.join("ConvertedToLatestVersion");
    if converted_dir.is_dir() {
        overlay_directory_files(&converted_dir, pack_dest)?;
    }

    let _ = remove_dir_all_under_root(&temp, &pack_install_temp_root(layout));

    let errors = report
        .issues
        .iter()
        .filter(|issue| issue.level == ReportLevel::Error)
        .count();
    if errors > 0 {
        return Err(AppError::IoError(format!(
            "convert reported {errors} error(s)"
        )));
    }

    Ok(format!(
        "{} sheet/file update(s)",
        report.files_processed
    ))
}

/// Port an already-installed pack and overlay `{temp}/Ported` into the pack folder.
fn port_installed_pack<F>(
    pack_dest: &Path,
    layout: &GameFilesLayout,
    options: &InstallPackOptions,
    on_op_progress: F,
) -> Result<String, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let temp = create_pack_install_temp_dir(layout)?;
    let porter_options = PorterOptions {
        low_port: options.low_port,
        dimensions: None,
        sheet_concurrency: options.sheet_concurrency.clamp(1, 64),
    };
    let op_plan = OperationPlan {
        kind: OperationKind::PorterSplitter,
        input_dir: pack_dest.to_string_lossy().into_owned(),
        output_dir: temp.to_string_lossy().into_owned(),
        options: OperationOptions::PorterSplitter(porter_options.clone()),
    };

    let progress = Arc::new(Mutex::new(on_op_progress));
    let cancel = Arc::new(AtomicBool::new(false));
    let report = execute_porter_splitter(
        &op_plan,
        pack_dest,
        &temp,
        Instant::now(),
        &porter_options,
        layout,
        &progress,
        cancel,
    )?;

    let ported_dir = temp.join("Ported");
    if ported_dir.is_dir() {
        overlay_directory_files(&ported_dir, pack_dest)?;
    }

    let _ = remove_dir_all_under_root(&temp, &pack_install_temp_root(layout));

    let errors = report
        .issues
        .iter()
        .filter(|issue| issue.level == ReportLevel::Error)
        .count();
    if errors > 0 {
        return Err(AppError::IoError(format!(
            "porter reported {errors} error(s)"
        )));
    }

    Ok(format!("{} file(s) ported", report.files_processed))
}

/// Copy every file under `from` onto `onto`, preserving relative paths (overwrite).
fn overlay_directory_files(from: &Path, onto: &Path) -> Result<(), AppError> {
    if !from.is_dir() {
        return Ok(());
    }
    let mut stack = vec![from.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let src = entry.path();
            let rel = src
                .strip_prefix(from)
                .map_err(|_| AppError::InvalidPath("convert overlay path escape"))?;
            ensure_no_parent_dir_components(rel)?;
            let dest = onto.join(rel);
            if src.is_dir() {
                fs::create_dir_all(&dest)?;
                stack.push(src);
            } else if src.is_file() {
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(&src, &dest)?;
            }
        }
    }
    Ok(())
}

/// Scaffold a new empty texture pack under texture-loader packs.
pub fn create_texture_pack(
    request: &CreateTexturePackRequest,
    layout: &GameFilesLayout,
) -> Result<CreateTexturePackResult, AppError> {
    if !layout.geometry_dash_found() {
        return Err(geometry_dash_required_error());
    }

    let folder_name = request.folder_name.trim();
    if !is_safe_path_segment(folder_name) {
        return Err(AppError::InvalidPath(
            "folder name must be a single safe path segment",
        ));
    }

    let packs_dir = layout.texture_loader_packs();
    fs::create_dir_all(&packs_dir)?;
    let pack_dir = packs_dir.join(folder_name);
    ensure_destination_allowed(&pack_dir, &layout.geode_config(), &layout.geode_mods())?;

    if pack_dir.exists() {
        return Err(AppError::IoError(format!(
            "pack folder already exists: {}",
            shorten_path_for_display(&pack_dir)
        )));
    }

    fs::create_dir_all(&pack_dir)?;
    let pack_json_path = pack_dir.join("pack.json");
    let json = serde_json::to_string_pretty(&request.metadata).map_err(|err| {
        AppError::ParseError(format!("failed to serialize pack.json: {err}"))
    })?;
    fs::write(&pack_json_path, format!("{json}\n"))?;

    let mut written_png = None;
    if let Some(raw_png) = request.pack_png_path.as_deref() {
        let trimmed = raw_png.trim();
        if !trimmed.is_empty() {
            let src = parse_user_absolute_path(trimmed)?;
            ensure_existing_user_file(&src)?;
            let dest_png = pack_dir.join("pack.png");
            fs::copy(&src, &dest_png)?;
            written_png = Some(dest_png.to_string_lossy().into_owned());
        }
    }

    Ok(CreateTexturePackResult {
        pack_dir: pack_dir.to_string_lossy().into_owned(),
        pack_json_path: pack_json_path.to_string_lossy().into_owned(),
        pack_png_path: written_png,
    })
}

/// Load `pack.json` / `pack.png` from an existing pack directory.
pub fn read_pack_metadata(pack_dir: &str) -> Result<ReadPackMetadataResult, AppError> {
    let dir = parse_user_absolute_path(pack_dir)?;
    if !dir.is_dir() {
        return Err(AppError::InvalidPath("pack directory does not exist"));
    }

    let json_path = dir.join("pack.json");
    let metadata = if json_path.is_file() {
        let text = fs::read_to_string(&json_path)?;
        match serde_json::from_str::<PackMetadata>(&text) {
            Ok(meta) => Some(meta),
            Err(_) => {
                // Tolerate extra fields / alternate shapes via Value extraction.
                parse_pack_metadata_lenient(&text)
            }
        }
    } else {
        None
    };

    let pack_png_path = find_pack_png_in_dir(&dir).map(|p| p.to_string_lossy().into_owned());

    Ok(ReadPackMetadataResult {
        metadata,
        pack_png_path,
    })
}

/// List immediate child packs under texture-loader's packs folder.
pub fn list_installed_packs(
    layout: &GameFilesLayout,
) -> Result<Vec<InstalledPackSummary>, AppError> {
    if !layout.geometry_dash_found() {
        return Err(geometry_dash_required_error());
    }

    let packs_dir = layout.texture_loader_packs();
    if !packs_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut packs = Vec::new();
    for child in list_child_dirs(&packs_dir) {
        let Some(folder_name) = child
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|n| is_safe_path_segment(n))
        else {
            continue;
        };
        if is_reserved_output_dir_name(child.file_name().unwrap_or_default()) {
            continue;
        }

        let meta_result = read_pack_metadata(&child.to_string_lossy())?;
        let metadata = meta_result.metadata.or_else(|| Some(default_pack_metadata(folder_name)));
        let (_, file_count) = build_tree_and_count(&child);
        packs.push(InstalledPackSummary {
            id: format!("library:{folder_name}"),
            folder_name: folder_name.to_string(),
            path: child.to_string_lossy().into_owned(),
            metadata,
            pack_png_path: meta_result.pack_png_path,
            file_count: Some(file_count),
        });
    }

    packs.sort_by(|a, b| {
        let a_name = a
            .metadata
            .as_ref()
            .map(|m| m.name.as_str())
            .unwrap_or(a.folder_name.as_str());
        let b_name = b
            .metadata
            .as_ref()
            .map(|m| m.name.as_str())
            .unwrap_or(b.folder_name.as_str());
        a_name.to_lowercase().cmp(&b_name.to_lowercase())
    });
    Ok(packs)
}

/// Write `pack.json` and optionally update/clear `pack.png` for an installed pack.
pub fn update_installed_pack_metadata(
    pack_dir: &str,
    metadata: &PackMetadata,
    update_pack_png: bool,
    pack_png_path: Option<&str>,
    layout: &GameFilesLayout,
) -> Result<ReadPackMetadataResult, AppError> {
    if !layout.geometry_dash_found() {
        return Err(geometry_dash_required_error());
    }

    let dir = resolve_installed_pack_dir(pack_dir, layout)?;

    let pack_json_path = dir.join("pack.json");
    let json = serde_json::to_string_pretty(metadata).map_err(|err| {
        AppError::ParseError(format!("failed to serialize pack.json: {err}"))
    })?;
    fs::write(&pack_json_path, format!("{json}\n"))?;

    if update_pack_png {
        let dest_png = dir.join("pack.png");
        match pack_png_path.map(str::trim).filter(|p| !p.is_empty()) {
            Some(png_path) => {
                let src = parse_user_absolute_path(png_path)?;
                ensure_existing_user_file(&src)?;
                // Remove any case-variant pack.png first so we always land on pack.png.
                if let Some(existing) = find_pack_png_in_dir(&dir) {
                    if existing != dest_png {
                        let _ = fs::remove_file(&existing);
                    }
                }
                fs::copy(&src, &dest_png)?;
            }
            None => {
                if let Some(existing) = find_pack_png_in_dir(&dir) {
                    fs::remove_file(&existing)?;
                }
            }
        }
    }

    read_pack_metadata(&dir.to_string_lossy())
}

/// Permanently delete an installed pack folder under texture-loader packs.
pub fn delete_installed_pack(
    pack_dir: &str,
    layout: &GameFilesLayout,
) -> Result<(), AppError> {
    if !layout.geometry_dash_found() {
        return Err(geometry_dash_required_error());
    }

    let dir = resolve_installed_pack_dir(pack_dir, layout)?;
    let packs_root = layout.texture_loader_packs();
    fs::create_dir_all(&packs_root)?;
    remove_dir_all_under_root(&dir, &packs_root)
}

/// Run Convert / Port / Split / Merge against an installed pack directory.
pub fn run_pack_operation<F>(
    pack_dir: &str,
    kind: PackOperationKind,
    options: &RunPackOperationOptions,
    layout: &GameFilesLayout,
    on_progress: F,
) -> Result<RunPackOperationResult, AppError>
where
    F: FnMut(PackInstallProgress) + Send + 'static,
{
    if !layout.geometry_dash_found() {
        return Err(geometry_dash_required_error());
    }

    let dir = resolve_installed_pack_dir(pack_dir, layout)?;
    let folder_name = dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("pack")
        .to_string();
    let unit_id = format!("library:{folder_name}");
    let sheet_concurrency = options.sheet_concurrency.clamp(1, 64);
    let phase_label = operation_progress_label(kind, &folder_name);
    let on_progress = Arc::new(Mutex::new(on_progress));

    emit_pack_progress(&on_progress, &unit_id, &phase_label, 0, 1);

    let progress = Arc::clone(&on_progress);
    let progress_unit_id = unit_id.clone();
    let progress_phase = phase_label.clone();
    let map_progress = move |op: OperationProgress| {
        emit_mapped_operation_progress(&progress, &progress_unit_id, &progress_phase, &op);
    };

    let message = match kind {
        PackOperationKind::ConvertToNewVersion => {
            let game_version = options.game_version.trim();
            if game_version.is_empty() {
                return Err(AppError::InvalidOperation(
                    "convert requires a previous game version",
                ));
            }
            let install_options = InstallPackOptions {
                convert_to_latest_version: true,
                game_version: game_version.to_string(),
                port_packs: false,
                low_port: false,
                sheet_concurrency,
            };
            convert_installed_pack_to_latest(&dir, layout, &install_options, map_progress)?
        }
        PackOperationKind::PorterSplitter => {
            let install_options = InstallPackOptions {
                convert_to_latest_version: false,
                game_version: String::new(),
                port_packs: true,
                low_port: options.low_port,
                sheet_concurrency,
            };
            port_installed_pack(&dir, layout, &install_options, map_progress)?
        }
        PackOperationKind::Splitter => {
            let output = options.output_dir.trim();
            if output.is_empty() {
                return Err(AppError::InvalidOperation(
                    "split requires an output folder",
                ));
            }
            let output_dir = parse_user_absolute_path(output)?;
            if !output_dir.exists() {
                fs::create_dir_all(&output_dir)?;
            }
            ensure_user_directory_path(&output_dir)?;
            run_pack_split_operation(
                &dir,
                &output_dir,
                sheet_concurrency,
                layout,
                map_progress,
            )?
        }
    };

    emit_pack_progress(&on_progress, &unit_id, &phase_label, 1, 1);

    Ok(RunPackOperationResult {
        message,
        issues: Vec::new(),
    })
}

fn operation_progress_label(kind: PackOperationKind, folder_name: &str) -> String {
    match kind {
        PackOperationKind::ConvertToNewVersion => format!("Converting {folder_name}"),
        PackOperationKind::PorterSplitter => format!("Porting {folder_name}"),
        PackOperationKind::Splitter => format!("Splitting {folder_name}"),
    }
}

/// Split pack sheets into `{output_dir}/Split/...`.
fn run_pack_split_operation<F>(
    pack_dir: &Path,
    output_dir: &Path,
    sheet_concurrency: u32,
    layout: &GameFilesLayout,
    on_op_progress: F,
) -> Result<String, AppError>
where
    F: FnMut(OperationProgress) + Send + 'static,
{
    let plan = OperationPlan {
        kind: OperationKind::Splitter,
        input_dir: pack_dir.to_string_lossy().into_owned(),
        output_dir: output_dir.to_string_lossy().into_owned(),
        options: OperationOptions::Splitter(crate::core::contracts::SplitterOptions {
            sheet_concurrency: sheet_concurrency.clamp(1, 64),
        }),
    };
    let cancel = Arc::new(AtomicBool::new(false));
    let report = execute_operation_plan(&plan, layout, on_op_progress, cancel)?;
    let errors = report
        .issues
        .iter()
        .filter(|issue| issue.level == ReportLevel::Error)
        .count();
    if errors > 0 {
        return Err(AppError::IoError(format!(
            "operation reported {errors} error(s)"
        )));
    }
    Ok(format!(
        "{} file(s) split → {}",
        report.files_processed,
        shorten_path_for_display(output_dir)
    ))
}

fn resolve_installed_pack_dir(
    pack_dir: &str,
    layout: &GameFilesLayout,
) -> Result<PathBuf, AppError> {
    let dir = parse_user_absolute_path(pack_dir)?;
    if !dir.is_dir() {
        return Err(AppError::InvalidPath("pack directory does not exist"));
    }

    let packs_root = layout.texture_loader_packs();
    if !path_is_under_prefix(&dir, &packs_root) {
        return Err(AppError::InvalidPath(
            "pack must stay under geode.texture-loader/packs",
        ));
    }

    let folder_name = dir
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| is_safe_path_segment(n))
        .ok_or(AppError::InvalidPath("pack folder has invalid name"))?;

    if is_reserved_output_dir_name(dir.file_name().unwrap_or_default()) {
        return Err(AppError::InvalidPath(
            "reserved output folder names cannot be treated as packs",
        ));
    }

    // Require an immediate child of the packs root (no nested escape).
    let expected = packs_root.join(folder_name);
    if !path_is_under_prefix(&dir, &expected) || !path_is_under_prefix(&expected, &dir) {
        return Err(AppError::InvalidPath(
            "pack must be an immediate child of texture-loader packs",
        ));
    }

    Ok(dir)
}

/// Remove a temp extract directory created by discovery (under game-files root).
pub fn cleanup_pack_install_temp(
    temp_dir: &str,
    layout: &GameFilesLayout,
) -> Result<(), AppError> {
    let path = parse_user_absolute_path(temp_dir)?;
    let temp_root = pack_install_temp_root(layout);
    if !temp_root.exists() {
        return Ok(());
    }
    fs::create_dir_all(&temp_root)?;
    remove_dir_all_under_root(&path, &temp_root)
}

fn pack_install_temp_root(layout: &GameFilesLayout) -> PathBuf {
    layout.root.join(PACK_INSTALL_TEMP_DIR)
}

fn create_pack_install_temp_dir(layout: &GameFilesLayout) -> Result<PathBuf, AppError> {
    let root = pack_install_temp_root(layout);
    fs::create_dir_all(&root)?;
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = root.join(format!("extract-{nanos}"));
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn extract_zip_to_dir(zip_path: &Path, dest: &Path) -> Result<(), AppError> {
    let file = File::open(zip_path).map_err(|err| {
        AppError::IoError(format!(
            "failed to open zip `{}`: {err}",
            shorten_path_for_display(zip_path)
        ))
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|err| {
        AppError::IoError(format!(
            "failed to read zip `{}`: {err}",
            shorten_path_for_display(zip_path)
        ))
    })?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|err| {
            AppError::IoError(format!("failed to read zip entry {i}: {err}"))
        })?;
        let Some(enclosed) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        if enclosed.as_os_str().is_empty() {
            continue;
        }
        ensure_no_parent_dir_components(&enclosed)?;
        let out_path = dest.join(&enclosed);

        if entry.is_dir() {
            fs::create_dir_all(&out_path)?;
            continue;
        }

        // Nested archives inside a package are ignored after extract; discovery
        // does not treat them as sources. Still extract non-zip content normally.
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut outfile = File::create(&out_path).map_err(|err| {
            AppError::IoError(format!(
                "failed to create `{}`: {err}",
                shorten_path_for_display(&out_path)
            ))
        })?;
        io::copy(&mut entry, &mut outfile)?;
    }
    Ok(())
}

/// Unwrap a single top-level folder wrapper when present.
fn resolve_discovery_root(work_root: &Path) -> PathBuf {
    if has_config_or_mods(work_root) || directory_looks_like_pack(work_root) {
        return work_root.to_path_buf();
    }

    let dirs = list_child_dirs(work_root);
    let files = list_child_files(work_root);
    // Ignore nested zips at the wrapper root when deciding unwrap.
    let non_zip_files: Vec<_> = files
        .iter()
        .filter(|p| {
            !p.extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("zip"))
        })
        .collect();

    if dirs.len() == 1 && non_zip_files.is_empty() {
        let child = &dirs[0];
        if has_config_or_mods(child)
            || directory_looks_like_pack(child)
            || !find_pack_folders(child).is_empty()
        {
            return child.clone();
        }
    }
    work_root.to_path_buf()
}

fn discover_units(root: &Path, layout: &GameFilesLayout) -> Result<Vec<InstallUnit>, AppError> {
    if has_config_or_mods(root) {
        return discover_geode_mirror_units(root, layout);
    }

    // Source is already a Geode `config/` directory (children are mod folders).
    if looks_like_geode_config_dir(root) {
        let sibling_mods = root
            .parent()
            .map(|parent| parent.join("mods"))
            .filter(|mods| mods.is_dir());
        return discover_geode_config_contents(root, layout, sibling_mods.as_deref());
    }

    let packs = find_pack_folders(root);
    if !packs.is_empty() {
        let mut units = Vec::with_capacity(packs.len());
        for pack_dir in packs {
            units.push(build_pack_unit(&pack_dir, layout)?);
        }
        return Ok(units);
    }

    if directory_looks_like_pack(root) {
        return Ok(vec![build_pack_unit(root, layout)?]);
    }

    Ok(Vec::new())
}

fn discover_geode_mirror_units(
    root: &Path,
    layout: &GameFilesLayout,
) -> Result<Vec<InstallUnit>, AppError> {
    let config_dir = root.join("config");
    let mods_dir = root.join("mods");
    let mods = mods_dir.is_dir().then_some(mods_dir.as_path());

    if config_dir.is_dir() {
        return discover_geode_config_contents(&config_dir, layout, mods);
    }

    // Mods-only mirror (no config directory).
    let mut units = Vec::new();
    if let Some(mods_dir) = mods {
        append_mod_units(mods_dir, layout, &mut units)?;
    }
    Ok(units)
}

/// Copy every immediate folder under a Geode config directory to `{GD}/geode/config/{name}`,
/// regardless of whether those folders (or their children) look like texture packs.
/// Pack units are still surfaced for metadata editing.
fn discover_geode_config_contents(
    config_dir: &Path,
    layout: &GameFilesLayout,
    mods_dir: Option<&Path>,
) -> Result<Vec<InstallUnit>, AppError> {
    let mut units = Vec::new();

    // Emit one unit per config/* folder so non-pack configs (e.g. more_icons) are copied.
    // Never install `geode.texture-loader` as a config tree — only its discovered packs.
    if looks_like_geode_config_dir(config_dir)
        || config_dir
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.eq_ignore_ascii_case("config"))
    {
        for child in list_child_dirs(config_dir) {
            let Some(name_os) = child.file_name() else {
                continue;
            };
            if is_reserved_output_dir_name(name_os) {
                continue;
            }
            let Some(name) = name_os.to_str() else {
                continue;
            };
            if !is_safe_path_segment(name) {
                continue;
            }
            if is_texture_loader_config_dir_name(name) {
                continue;
            }
            let dest = layout.geode_config().join(name);
            let (tree, file_count) = build_tree_and_count(&child);
            units.push(InstallUnit {
                id: format!("configTree:{name}"),
                kind: InstallUnitKind::ConfigTree,
                label: name.to_string(),
                source_path: child.to_string_lossy().into_owned(),
                destination_path: dest.to_string_lossy().into_owned(),
                enabled: true,
                tree: Some(tree),
                metadata: None,
                pack_png_path: None,
                file_count: Some(file_count),
            });
        }
    }

    if let Some(mods_dir) = mods_dir {
        append_mod_units(mods_dir, layout, &mut units)?;
    }

    // Texture-loader packs (and any other pack markers under config/*) install as Pack units.
    if looks_like_geode_config_dir(config_dir)
        || config_dir
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.eq_ignore_ascii_case("config"))
    {
        for pack_dir in find_pack_folders_under_config(config_dir) {
            units.push(build_pack_unit(&pack_dir, layout)?);
        }
    }

    Ok(units)
}

fn is_texture_loader_config_dir_name(name: &str) -> bool {
    name.eq_ignore_ascii_case("geode.texture-loader")
}

/// True when `dir` looks like Geode's `config` folder (mod-id children, texture-loader, etc.).
fn looks_like_geode_config_dir(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    if dir.join("geode.texture-loader").is_dir() {
        return true;
    }
    // Any child with a `packs/` subdirectory is a strong Geode-config signal.
    list_child_dirs(dir)
        .iter()
        .any(|child| child.join("packs").is_dir())
}

fn append_mod_units(
    mods_dir: &Path,
    layout: &GameFilesLayout,
    units: &mut Vec<InstallUnit>,
) -> Result<(), AppError> {
    let mut entries: Vec<PathBuf> = fs::read_dir(mods_dir)?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("geode"))
        })
        .collect();
    entries.sort();
    for mod_path in entries {
        let Some(name) = mod_path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !is_safe_path_segment(name) {
            continue;
        }
        let dest = layout.geode_mods().join(name);
        units.push(InstallUnit {
            id: format!("mod:{name}"),
            kind: InstallUnitKind::Mod,
            label: name.to_string(),
            source_path: mod_path.to_string_lossy().into_owned(),
            destination_path: dest.to_string_lossy().into_owned(),
            enabled: true,
            tree: None,
            metadata: None,
            pack_png_path: None,
            file_count: Some(1),
        });
    }
    Ok(())
}

/// Folder names that are pack *content*, never pack roots (e.g. Sunix `icons/`).
fn is_pack_content_dir_name(name: &std::ffi::OsStr) -> bool {
    let name = name.to_string_lossy();
    name.eq_ignore_ascii_case("icons") || name.eq_ignore_ascii_case("geode.loader")
}

fn find_pack_folders(root: &Path) -> Vec<PathBuf> {
    // Prefer texture-loader `packs/` directories anywhere under the root — this covers
    // layouts like `geode.texture-loader/packs/{Pack}` that are deeper than one wrapper.
    let mut packs = find_pack_folders_under_packs_dirs(root);
    if !packs.is_empty() {
        packs.sort();
        packs.dedup();
        return packs;
    }

    let mut packs = Vec::new();
    for child in list_child_dirs(root) {
        let Some(name) = child.file_name() else {
            continue;
        };
        if is_reserved_output_dir_name(name) || is_pack_content_dir_name(name) {
            continue;
        }
        let name_str = name.to_string_lossy();
        if name_str.eq_ignore_ascii_case("config") || name_str.eq_ignore_ascii_case("mods") {
            continue;
        }
        if directory_looks_like_pack(&child) {
            packs.push(child);
        }
    }

    if !packs.is_empty() {
        packs.sort();
        return packs;
    }

    // Shallow nested wrappers: one extra level (e.g. `Collection/Pack A`).
    for child in list_child_dirs(root) {
        let Some(name) = child.file_name() else {
            continue;
        };
        if is_reserved_output_dir_name(name) || is_pack_content_dir_name(name) {
            continue;
        }
        let name_str = name.to_string_lossy();
        if name_str.eq_ignore_ascii_case("config")
            || name_str.eq_ignore_ascii_case("mods")
            || name_str.eq_ignore_ascii_case("packs")
        {
            continue;
        }
        if directory_looks_like_pack(&child) {
            continue;
        }
        for grandchild in list_child_dirs(&child) {
            let Some(gname) = grandchild.file_name() else {
                continue;
            };
            if is_reserved_output_dir_name(gname) || is_pack_content_dir_name(gname) {
                continue;
            }
            if directory_looks_like_pack(&grandchild) {
                packs.push(grandchild);
            }
        }
    }
    packs.sort();
    packs
}

/// Find pack entries under every immediate child of a Geode `config/` directory.
///
/// Checks `config/* /packs/*` and any nested folder that contains pack marker files
/// (`pack.png` / `pack.json`), not only `config/geode.texture-loader/...`.
fn find_pack_folders_under_config(config_dir: &Path) -> Vec<PathBuf> {
    let mut packs = Vec::new();
    for mod_folder in list_child_dirs(config_dir) {
        let Some(name) = mod_folder.file_name() else {
            continue;
        };
        if is_reserved_output_dir_name(name) {
            continue;
        }

        let packs_subdir = mod_folder.join("packs");
        if packs_subdir.is_dir() {
            for child in list_child_dirs(&packs_subdir) {
                let Some(child_name) = child.file_name() else {
                    continue;
                };
                if is_reserved_output_dir_name(child_name) {
                    continue;
                }
                packs.push(child);
            }
        }

        // Pack folders may also sit directly under a config mod folder (or nested)
        // with pack.png / pack.json as the marker.
        packs.extend(find_dirs_with_pack_markers(&mod_folder, MAX_PACKS_DIR_SEARCH_DEPTH));
    }
    packs.sort();
    packs.dedup();
    packs
}

/// Find directories named `packs` under `root` and treat each immediate child folder
/// as a pack entry (`pack.png` lives in that child folder).
fn find_pack_folders_under_packs_dirs(root: &Path) -> Vec<PathBuf> {
    let mut packs = Vec::new();
    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];

    while let Some((dir, depth)) = stack.pop() {
        if depth > MAX_PACKS_DIR_SEARCH_DEPTH {
            continue;
        }

        let dir_name = dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();

        if depth > 0 && dir_name.eq_ignore_ascii_case("packs") {
            for child in list_child_dirs(&dir) {
                let Some(name) = child.file_name() else {
                    continue;
                };
                if is_reserved_output_dir_name(name) {
                    continue;
                }
                // Children of `packs/` are pack folder entries; accept directories even
                // when heuristics are weak so pack.png beside them is still associated.
                packs.push(child);
            }
            // Do not walk into pack entries looking for nested packs dirs.
            continue;
        }

        for child in list_child_dirs(&dir) {
            let Some(name) = child.file_name() else {
                continue;
            };
            if is_reserved_output_dir_name(name) {
                continue;
            }
            let name_str = name.to_string_lossy();
            // Skip descending into known pack-content folders to keep the walk small.
            if name_str.eq_ignore_ascii_case("icons")
                || name_str.eq_ignore_ascii_case("geode.loader")
            {
                continue;
            }
            stack.push((child, depth + 1));
        }
    }

    packs.sort();
    packs.dedup();
    packs
}

/// Walk `root` for directories that contain `pack.png` or `pack.json` at their root.
fn find_dirs_with_pack_markers(root: &Path, max_depth: usize) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];

    while let Some((dir, depth)) = stack.pop() {
        if depth > max_depth {
            continue;
        }

        // Only treat nested directories as pack entries — not the mod-config root itself
        // (e.g. skip `config/geode.texture-loader` even if it somehow had markers).
        if depth > 0 && directory_has_pack_markers(&dir) {
            let Some(name) = dir.file_name() else {
                continue;
            };
            if name
                .to_str()
                .is_some_and(|n| n.eq_ignore_ascii_case("packs"))
            {
                // Prefer children of packs/ (handled separately); don't treat packs/ as a pack.
            } else if !is_reserved_output_dir_name(name) {
                found.push(dir.clone());
                // Pack entry root — don't look for packs nested inside it.
                continue;
            }
        }

        for child in list_child_dirs(&dir) {
            let Some(name) = child.file_name() else {
                continue;
            };
            if is_reserved_output_dir_name(name) {
                continue;
            }
            let name_str = name.to_string_lossy();
            if name_str.eq_ignore_ascii_case("icons")
                || name_str.eq_ignore_ascii_case("geode.loader")
            {
                continue;
            }
            stack.push((child, depth + 1));
        }
    }

    found
}

fn directory_has_pack_markers(dir: &Path) -> bool {
    dir.join("pack.json").is_file() || find_pack_png_in_dir(dir).is_some()
}

fn directory_looks_like_pack(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    // `icons/` and `geode.loader/` hold assets inside a pack — never treat them as pack roots
    // just because they contain .png/.plist (Sunix Icons layout).
    if dir
        .file_name()
        .is_some_and(|n| is_pack_content_dir_name(n))
    {
        return dir.join("pack.json").is_file() || find_pack_png_in_dir(dir).is_some();
    }
    if dir.join("pack.json").is_file() || find_pack_png_in_dir(dir).is_some() {
        return true;
    }
    if dir.join("icons").is_dir() || dir.join("geode.loader").is_dir() {
        return true;
    }
    // Texture assets at root (sheet packs).
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        // pack.png is handled above; ignore it here so sheet detection stays separate.
        if name.eq_ignore_ascii_case("pack.png") {
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if ext.eq_ignore_ascii_case("plist")
            || ext.eq_ignore_ascii_case("png")
            || ext.eq_ignore_ascii_case("fnt")
        {
            return true;
        }
    }
    false
}

/// `pack.png` is always at the pack folder root (case-insensitive on disk).
fn find_pack_png_in_dir(dir: &Path) -> Option<PathBuf> {
    let direct = dir.join("pack.png");
    if direct.is_file() {
        return Some(direct);
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return None;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.eq_ignore_ascii_case("pack.png"))
        {
            return Some(path);
        }
    }
    None
}

fn has_config_or_mods(root: &Path) -> bool {
    root.join("config").is_dir() || root.join("mods").is_dir()
}

fn build_pack_unit(pack_dir: &Path, layout: &GameFilesLayout) -> Result<InstallUnit, AppError> {
    let folder_name = pack_dir
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| is_safe_path_segment(n))
        .ok_or(AppError::InvalidPath("pack folder has invalid name"))?;

    let dest = layout.texture_loader_packs().join(folder_name);
    let meta_result = read_pack_metadata(&pack_dir.to_string_lossy())?;
    let metadata = meta_result
        .metadata
        .unwrap_or_else(|| default_pack_metadata(folder_name));
    let label = if metadata.name.trim().is_empty() {
        folder_name.to_string()
    } else {
        metadata.name.clone()
    };

    let (tree, file_count) = build_tree_and_count(pack_dir);
    Ok(InstallUnit {
        id: format!("pack:{folder_name}"),
        kind: InstallUnitKind::Pack,
        label,
        source_path: pack_dir.to_string_lossy().into_owned(),
        destination_path: dest.to_string_lossy().into_owned(),
        enabled: true,
        tree: Some(tree),
        metadata: Some(metadata),
        pack_png_path: meta_result.pack_png_path,
        file_count: Some(file_count),
    })
}

fn build_tree_and_count(root: &Path) -> (InstallTreeNode, usize) {
    let name = root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("root")
        .to_string();
    let mut count = 0usize;
    let mut budget = MAX_TREE_ENTRIES;
    let children = build_tree_children(root, &mut count, &mut budget);
    (
        InstallTreeNode {
            name,
            is_dir: true,
            children: Some(children),
        },
        count,
    )
}

fn build_tree_children(
    dir: &Path,
    file_count: &mut usize,
    budget: &mut usize,
) -> Vec<InstallTreeNode> {
    if *budget == 0 {
        return Vec::new();
    }
    let Ok(read) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    for entry in read.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()).map(str::to_string) else {
            continue;
        };
        // Nested zips inside packages are not install sources; omit from preview.
        if path.is_file()
            && path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("zip"))
        {
            continue;
        }
        if path.is_dir() {
            dirs.push((name, path));
        } else if path.is_file() {
            files.push((name, path));
        }
    }
    dirs.sort_by(|a, b| a.0.cmp(&b.0));
    files.sort_by(|a, b| a.0.cmp(&b.0));

    let mut nodes = Vec::new();
    for (name, path) in dirs {
        if *budget == 0 {
            break;
        }
        *budget = budget.saturating_sub(1);
        let children = build_tree_children(&path, file_count, budget);
        nodes.push(InstallTreeNode {
            name,
            is_dir: true,
            children: Some(children),
        });
    }
    for (name, _) in files {
        if *budget == 0 {
            break;
        }
        *budget = budget.saturating_sub(1);
        *file_count += 1;
        nodes.push(InstallTreeNode {
            name,
            is_dir: false,
            children: None,
        });
    }
    nodes
}

/// Write edited `pack.json` / `pack.png` after a pack folder copy.
/// When `pack_png_path` is absent, remove any copied `pack.png` (user cleared the image).
fn apply_pack_install_overrides(unit: &InstallUnit, destination: &Path) -> Result<(), AppError> {
    if unit.kind != InstallUnitKind::Pack {
        return Ok(());
    }

    if let Some(metadata) = &unit.metadata {
        let pack_json_path = destination.join("pack.json");
        let json = serde_json::to_string_pretty(metadata).map_err(|err| {
            AppError::ParseError(format!("failed to serialize pack.json: {err}"))
        })?;
        fs::write(pack_json_path, format!("{json}\n"))?;
    }

    let dest_png = destination.join("pack.png");
    match &unit.pack_png_path {
        Some(png_path) => {
            let src = parse_user_absolute_path(png_path)?;
            ensure_existing_user_file(&src)?;
            fs::copy(&src, &dest_png)?;
        }
        None => {
            if dest_png.is_file() {
                fs::remove_file(&dest_png)?;
            }
        }
    }

    Ok(())
}

fn default_pack_metadata(folder_name: &str) -> PackMetadata {
    PackMetadata {
        textureldr: "1.5.0".to_string(),
        name: folder_name.to_string(),
        id: String::new(),
        version: "1.0.0".to_string(),
        author: String::new(),
    }
}

fn install_unit(
    kind: InstallUnitKind,
    source: &Path,
    destination: &Path,
) -> Result<(), AppError> {
    match kind {
        InstallUnitKind::Mod => {
            ensure_existing_user_file(source)?;
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            if destination.exists() {
                fs::remove_file(destination).or_else(|_| {
                    if destination.is_dir() {
                        fs::remove_dir_all(destination)
                    } else {
                        Ok(())
                    }
                })?;
            }
            fs::copy(source, destination)?;
            Ok(())
        }
        InstallUnitKind::Pack | InstallUnitKind::ConfigTree => {
            if !source.is_dir() {
                return Err(AppError::InvalidPath("source must be a directory"));
            }
            copy_dir_overwrite(source, destination)
        }
    }
}

fn copy_dir_overwrite(source: &Path, destination: &Path) -> Result<(), AppError> {
    if destination.exists() {
        if destination.is_dir() {
            fs::remove_dir_all(destination)?;
        } else {
            fs::remove_file(destination)?;
        }
    }
    copy_dir_recursive(source, destination)
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), AppError> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let src = entry.path();
        let Some(name) = src.file_name() else {
            continue;
        };
        // Skip nested zip archives inside packages.
        if src.is_file()
            && src
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("zip"))
        {
            continue;
        }
        let dest = destination.join(name);
        if src.is_dir() {
            copy_dir_recursive(&src, &dest)?;
        } else if src.is_file() {
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&src, &dest)?;
        }
    }
    Ok(())
}

fn ensure_destination_allowed(
    destination: &Path,
    config_root: &Path,
    mods_root: &Path,
) -> Result<(), AppError> {
    ensure_user_absolute_path(destination)?;
    if path_is_under_prefix(destination, config_root) || path_is_under_prefix(destination, mods_root)
    {
        return Ok(());
    }
    Err(AppError::InvalidPath(
        "destination must stay under geode/config or geode/mods",
    ))
}

fn path_is_under_prefix(path: &Path, root: &Path) -> bool {
    let path_components: Vec<_> = path.components().collect();
    let root_components: Vec<_> = root.components().collect();
    if root_components.is_empty() || path_components.len() < root_components.len() {
        return false;
    }
    path_components
        .iter()
        .zip(root_components.iter())
        .all(|(a, b)| component_eq(a, b))
}

fn component_eq(a: &Component<'_>, b: &Component<'_>) -> bool {
    match (a, b) {
        (Component::Prefix(ap), Component::Prefix(bp)) => {
            ap.as_os_str().eq_ignore_ascii_case(bp.as_os_str())
        }
        (Component::RootDir, Component::RootDir) => true,
        (Component::Normal(a), Component::Normal(b)) => a == b,
        (Component::CurDir, Component::CurDir) => true,
        _ => false,
    }
}

fn parse_pack_metadata_lenient(text: &str) -> Option<PackMetadata> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    let obj = value.as_object()?;
    let get = |key: &str| {
        obj.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    Some(PackMetadata {
        textureldr: get("textureldr"),
        name: get("name"),
        id: get("id"),
        version: get("version"),
        author: get("author"),
    })
}

fn list_child_dirs(dir: &Path) -> Vec<PathBuf> {
    let Ok(read) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs: Vec<PathBuf> = read
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    dirs
}

fn list_child_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(read) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = read
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_file())
        .collect();
    files.sort();
    files
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("tm2-pack-installer-{label}-{nanos}"));
        fs::create_dir_all(&dir).expect("temp");
        dir
    }

    fn test_layout(root: &Path, gd: &Path) -> GameFilesLayout {
        // Create minimal GD shape so geometry_dash_found is true.
        fs::create_dir_all(gd.join("Resources")).expect("resources");
        // looks_like_geometry_dash_dir may need more — mirror other tests.
        GameFilesLayout {
            root: root.to_path_buf(),
            geometry_dash_dir: gd.to_path_buf(),
            resources: gd.join("Resources"),
            geode_resources: gd.join("geode").join("resources"),
            geode_unzipped: gd.join("geode").join("unzipped"),
            current_split: root.join("split-cache"),
            legacy: root.join("legacy"),
        }
    }

    fn write_pack_json(dir: &Path, name: &str, id: &str) {
        fs::create_dir_all(dir).expect("pack dir");
        let meta = PackMetadata {
            textureldr: "1.5.0".to_string(),
            name: name.to_string(),
            id: id.to_string(),
            version: "1.0.0".to_string(),
            author: "tester".to_string(),
        };
        let json = serde_json::to_string_pretty(&meta).expect("json");
        fs::write(dir.join("pack.json"), json).expect("write pack.json");
    }

    fn make_gd_found(gd: &Path) {
        // Match looks_like_geometry_dash_dir requirements.
        let resources = gd.join("Resources");
        fs::create_dir_all(resources.join("icons")).expect("resources/icons");
        let _ = fs::write(gd.join("GeometryDash.exe"), b"");
        let _ = fs::write(gd.join("libcocos2d.dll"), b"");
    }

    #[test]
    fn discovers_geode_mirror_tpfull_style() {
        let root = unique_temp("root-tpfull");
        let gd = unique_temp("gd-tpfull");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let source = unique_temp("tpfull");
        let config = source
            .join("config")
            .join("geode.texture-loader")
            .join("packs")
            .join("NestedPack");
        write_pack_json(&config, "Nested Pack", "tester.nested");
        fs::write(config.join("pack.png"), b"png").expect("pack png");
        fs::create_dir_all(source.join("config").join("hiimjustin000.more_icons"))
            .expect("more icons");
        fs::write(
            source.join("config").join("hiimjustin000.more_icons").join("settings.json"),
            "{}",
        )
        .expect("settings");
        fs::create_dir_all(source.join("mods")).expect("mods");
        fs::write(
            source.join("mods").join("weebify.st2_wallpaper.geode"),
            b"geode",
        )
        .expect("mod");
        // Nested zip at root should be ignored as a unit.
        fs::write(source.join("extra.zip"), b"not a real zip").expect("nested zip");

        let plan = discover_pack_install(&source.to_string_lossy(), &layout).expect("discover");
        assert!(!plan.is_zip);
        assert!(plan.temp_dir.is_none());
        // texture-loader config itself must never be a config install unit.
        assert!(!plan.units.iter().any(|u| {
            u.kind == InstallUnitKind::ConfigTree && u.id == "configTree:geode.texture-loader"
        }));
        // Other config/* folders still copy as config units.
        assert!(plan.units.iter().any(|u| {
            u.kind == InstallUnitKind::ConfigTree && u.id == "configTree:hiimjustin000.more_icons"
        }));
        assert!(plan.units.iter().any(|u| {
            u.kind == InstallUnitKind::Mod && u.label == "weebify.st2_wallpaper.geode"
        }));
        // Packs under texture-loader/packs install as Pack units only.
        let nested = plan
            .units
            .iter()
            .find(|u| u.kind == InstallUnitKind::Pack && u.label == "Nested Pack")
            .expect("nested pack unit");
        assert!(nested.pack_png_path.as_ref().is_some_and(|p| {
            PathBuf::from(p).file_name().and_then(|n| n.to_str()) == Some("pack.png")
        }));
    }

    #[test]
    fn discovers_packs_under_all_config_mod_folders() {
        let root = unique_temp("root-config-star");
        let gd = unique_temp("gd-config-star");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let source = unique_temp("config-star-src");
        let texture_pack = source
            .join("config")
            .join("geode.texture-loader")
            .join("packs")
            .join("Loader Pack");
        write_pack_json(&texture_pack, "Loader Pack", "tester.loader");
        fs::write(texture_pack.join("pack.png"), b"a").expect("png");

        // Packs under a different config/* mod folder must also be detected.
        let other_pack = source
            .join("config")
            .join("some.other.mod")
            .join("packs")
            .join("Other Pack");
        write_pack_json(&other_pack, "Other Pack", "tester.other");
        fs::write(other_pack.join("pack.png"), b"b").expect("png");

        // Direct pack folder under config/another.mod (no packs/ wrapper).
        let direct = source.join("config").join("another.mod").join("Direct Pack");
        fs::create_dir_all(&direct).expect("direct");
        fs::write(direct.join("pack.png"), b"c").expect("png");
        fs::create_dir_all(direct.join("icons")).expect("icons");

        let plan = discover_pack_install(&source.to_string_lossy(), &layout).expect("discover");
        let pack_labels: Vec<_> = plan
            .units
            .iter()
            .filter(|u| u.kind == InstallUnitKind::Pack)
            .map(|u| u.label.as_str())
            .collect();
        assert!(
            pack_labels.contains(&"Loader Pack"),
            "missing texture-loader pack: {pack_labels:?}"
        );
        assert!(
            pack_labels.contains(&"Other Pack"),
            "missing other.mod packs/ entry: {pack_labels:?}"
        );
        assert!(
            pack_labels.contains(&"Direct Pack"),
            "missing direct pack under config/*: {pack_labels:?}"
        );
        for unit in plan.units.iter().filter(|u| u.kind == InstallUnitKind::Pack) {
            assert!(unit.pack_png_path.is_some(), "pack.png for {}", unit.label);
        }
    }

    #[test]
    fn discovers_nested_texture_loader_packs_folder_with_pack_png() {
        let root = unique_temp("root-nested-packs");
        let gd = unique_temp("gd-nested-packs");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        // Deeper than the old one-level grandchild scan:
        // wrapper/geode.texture-loader/packs/{PackA,PackB}
        let source = unique_temp("nested-packs-src");
        let packs = source
            .join("wrapper")
            .join("geode.texture-loader")
            .join("packs");
        let pack_a = packs.join("Pack A");
        let pack_b = packs.join("Pack B");
        fs::create_dir_all(&pack_a).expect("a");
        fs::create_dir_all(&pack_b).expect("b");
        fs::write(pack_a.join("pack.png"), b"a").expect("a png");
        fs::write(pack_b.join("Pack.PNG"), b"b").expect("b png case");
        fs::create_dir_all(pack_a.join("icons")).expect("icons");
        fs::write(pack_b.join("sheet.plist"), "x").expect("plist");

        let plan = discover_pack_install(&source.to_string_lossy(), &layout).expect("discover");
        let pack_units: Vec<_> = plan
            .units
            .iter()
            .filter(|u| u.kind == InstallUnitKind::Pack)
            .collect();
        assert_eq!(pack_units.len(), 2, "expected both packs under nested packs/");
        for unit in pack_units {
            assert!(
                unit.pack_png_path.is_some(),
                "pack.png missing for {}",
                unit.label
            );
            let png = PathBuf::from(unit.pack_png_path.as_ref().unwrap());
            assert_eq!(
                png.parent().map(|p| p.to_path_buf()),
                Some(PathBuf::from(&unit.source_path))
            );
        }
    }

    #[test]
    fn discovers_loose_multi_pack_waifu_style() {
        let root = unique_temp("root-waifu");
        let gd = unique_temp("gd-waifu");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let source = unique_temp("waifu");
        write_pack_json(&source.join("Iino Menu"), "Iino Menu", "tester.iino");
        write_pack_json(&source.join("Waifu Dash"), "Waifu Dash", "tester.waifu");
        fs::create_dir_all(source.join("Split")).expect("reserved");
        fs::write(source.join("Split").join("pack.json"), "{}").expect("reserved pack");

        let plan = discover_pack_install(&source.to_string_lossy(), &layout).expect("discover");
        let pack_labels: Vec<_> = plan
            .units
            .iter()
            .filter(|u| u.kind == InstallUnitKind::Pack)
            .map(|u| u.label.as_str())
            .collect();
        assert_eq!(pack_labels, vec!["Iino Menu", "Waifu Dash"]);
        assert!(plan.units.iter().all(|u| {
            PathBuf::from(&u.destination_path).starts_with(layout.texture_loader_packs())
                || u.destination_path
                    .replace('\\', "/")
                    .contains("geode.texture-loader/packs")
        }));
    }

    #[test]
    fn discovers_root_pack_sunix_style() {
        let root = unique_temp("root-sunix");
        let gd = unique_temp("gd-sunix");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let parent = unique_temp("sunix-parent");
        let source = parent.join("Sunix Icons");
        fs::create_dir_all(&source).expect("sunix dir");
        fs::write(source.join("icons.png"), b"png").expect("png");
        fs::write(source.join("icons.plist"), b"plist").expect("plist");
        fs::create_dir_all(source.join("icons")).expect("icons dir");

        let plan = discover_pack_install(&source.to_string_lossy(), &layout).expect("discover");
        assert_eq!(plan.units.len(), 1);
        assert_eq!(plan.units[0].kind, InstallUnitKind::Pack);
        assert_eq!(plan.units[0].label, "Sunix Icons");
        assert!(plan.units[0]
            .destination_path
            .replace('\\', "/")
            .contains("geode.texture-loader/packs/Sunix Icons"));
    }

    #[test]
    fn discovers_wrapper_sunix_with_pack_png_not_icons_subdir() {
        // Real layout: Downloads/sunix icons/Sunix Icons/{pack.png, icons/*.png}
        // Must not treat `icons/` as the pack (it has texture files but no pack.png).
        let root = unique_temp("root-sunix-wrap");
        let gd = unique_temp("gd-sunix-wrap");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let wrapper = unique_temp("sunix icons");
        let pack = wrapper.join("Sunix Icons");
        let icons = pack.join("icons");
        fs::create_dir_all(&icons).expect("icons");
        fs::write(pack.join("pack.png"), b"pack-preview").expect("pack.png");
        fs::write(icons.join("player_01-uhd.png"), b"tex").expect("tex png");
        fs::write(icons.join("player_01-uhd.plist"), b"plist").expect("tex plist");

        let plan = discover_pack_install(&wrapper.to_string_lossy(), &layout).expect("discover");
        assert_eq!(plan.units.len(), 1, "units: {:?}", plan.units);
        assert_eq!(plan.units[0].kind, InstallUnitKind::Pack);
        assert_eq!(plan.units[0].label, "Sunix Icons");
        let png = plan.units[0]
            .pack_png_path
            .as_ref()
            .expect("pack.png should be detected on pack root");
        assert!(
            PathBuf::from(png).ends_with("pack.png")
                || PathBuf::from(png)
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case("pack.png"))
        );
        assert_eq!(
            PathBuf::from(png).parent().map(|p| p.to_path_buf()),
            Some(PathBuf::from(&plan.units[0].source_path))
        );
    }

    #[test]
    fn install_pack_plan_overwrites_and_copies() {
        let root = unique_temp("root-install");
        let gd = unique_temp("gd-install");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let source = unique_temp("pack-src");
        write_pack_json(&source.join("Demo"), "Demo", "tester.demo");
        fs::write(source.join("Demo").join("sheet.png"), b"a").expect("sheet");

        let plan = discover_pack_install(&source.to_string_lossy(), &layout).expect("discover");
        let unit_ids: Vec<String> = plan.units.iter().map(|u| u.id.clone()).collect();

        let dest = PathBuf::from(&plan.units[0].destination_path);
        fs::create_dir_all(&dest).expect("preexist");
        fs::write(dest.join("old.txt"), b"old").expect("old");

        let progresses = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let progresses_cb = Arc::clone(&progresses);
        let result = install_pack_plan(
            &plan,
            &unit_ids,
            &layout,
            &InstallPackOptions::default(),
            move |_| {
                progresses_cb.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            },
        )
        .expect("install");
        assert_eq!(result.installed, 1);
        assert_eq!(result.skipped, 0);
        assert!(progresses.load(std::sync::atomic::Ordering::Relaxed) >= 1);
        assert!(dest.join("pack.json").is_file());
        assert!(dest.join("sheet.png").is_file());
        assert!(!dest.join("old.txt").exists(), "overwrite should replace dir");
    }

    #[test]
    fn install_pack_plan_applies_edited_metadata_and_png() {
        let root = unique_temp("root-meta");
        let gd = unique_temp("gd-meta");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let source = unique_temp("pack-meta-src");
        write_pack_json(&source.join("Demo"), "Demo", "tester.demo");
        fs::write(source.join("Demo").join("pack.png"), b"old-png").expect("old png");
        fs::write(source.join("Demo").join("sheet.png"), b"a").expect("sheet");

        let mut plan = discover_pack_install(&source.to_string_lossy(), &layout).expect("discover");
        let override_png = unique_temp("png-override").join("new.png");
        fs::write(&override_png, b"new-png").expect("new png");
        plan.units[0].metadata = Some(PackMetadata {
            textureldr: "1.5.0".to_string(),
            name: "Edited Name".to_string(),
            id: "tester.edited".to_string(),
            version: "2.0.0".to_string(),
            author: "Editor".to_string(),
        });
        plan.units[0].pack_png_path = Some(override_png.to_string_lossy().into_owned());
        let unit_ids = vec![plan.units[0].id.clone()];
        let dest = PathBuf::from(&plan.units[0].destination_path);

        install_pack_plan(
            &plan,
            &unit_ids,
            &layout,
            &InstallPackOptions::default(),
            |_| {},
        )
        .expect("install");

        let json = fs::read_to_string(dest.join("pack.json")).expect("read json");
        assert!(json.contains("Edited Name"));
        assert!(json.contains("tester.edited"));
        assert_eq!(fs::read(dest.join("pack.png")).expect("png"), b"new-png");
    }

    #[test]
    fn create_texture_pack_writes_metadata_and_rejects_conflict() {
        let root = unique_temp("root-create");
        let gd = unique_temp("gd-create");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let png_src = unique_temp("png").join("icon.png");
        fs::write(&png_src, b"\x89PNG\r\n\x1a\nfake").expect("png");

        let request = CreateTexturePackRequest {
            folder_name: "MyPack".to_string(),
            metadata: PackMetadata {
                textureldr: "1.5.0".to_string(),
                name: "My Pack".to_string(),
                id: "tester.my-pack".to_string(),
                version: "1.0.0".to_string(),
                author: "tester".to_string(),
            },
            pack_png_path: Some(png_src.to_string_lossy().into_owned()),
        };

        let created = create_texture_pack(&request, &layout).expect("create");
        assert!(PathBuf::from(&created.pack_dir).join("pack.json").is_file());
        assert!(created.pack_png_path.is_some());

        let err = create_texture_pack(&request, &layout).expect_err("conflict");
        assert!(err.to_string().contains("already exists"));

        let read = read_pack_metadata(&created.pack_dir).expect("read");
        assert_eq!(read.metadata.unwrap().name, "My Pack");
        assert!(read.pack_png_path.is_some());
    }

    #[test]
    fn discover_zip_extracts_and_cleanup_removes_temp() {
        let root = unique_temp("root-zip");
        let gd = unique_temp("gd-zip");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let pack_dir = unique_temp("zip-pack");
        write_pack_json(&pack_dir.join("ZipPack"), "Zip Pack", "tester.zip");
        fs::write(pack_dir.join("ZipPack").join("a.png"), b"x").expect("png");

        let zip_path = unique_temp("zip-file").join("pack.zip");
        {
            let file = File::create(&zip_path).expect("zip create");
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.add_directory("ZipPack/", options).expect("dir");
            zip.start_file("ZipPack/pack.json", options).expect("start");
            let json = fs::read(pack_dir.join("ZipPack").join("pack.json")).expect("read json");
            zip.write_all(&json).expect("write json");
            zip.start_file("ZipPack/a.png", options).expect("start png");
            zip.write_all(b"x").expect("write png");
            zip.finish().expect("finish");
        }

        let plan =
            discover_pack_install(&zip_path.to_string_lossy(), &layout).expect("discover zip");
        assert!(plan.is_zip);
        let temp = plan.temp_dir.clone().expect("temp");
        assert!(PathBuf::from(&temp).exists());
        assert_eq!(plan.units.len(), 1);
        assert_eq!(plan.units[0].kind, InstallUnitKind::Pack);

        cleanup_pack_install_temp(&temp, &layout).expect("cleanup");
        assert!(!PathBuf::from(&temp).exists());
    }

    #[test]
    fn rejects_destination_escape() {
        let root = unique_temp("root-escape");
        let gd = unique_temp("gd-escape");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);
        let outside = unique_temp("outside").join("evil");
        let err = ensure_destination_allowed(
            &outside,
            &layout.geode_config(),
            &layout.geode_mods(),
        )
        .expect_err("escape");
        assert!(err.to_string().contains("geode/config") || err.to_string().contains("destination"));
    }

    #[test]
    fn list_installed_packs_returns_fixture_packs_and_skips_reserved() {
        let root = unique_temp("root-list");
        let gd = unique_temp("gd-list");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let packs = layout.texture_loader_packs();
        write_pack_json(&packs.join("Alpha"), "Alpha Pack", "tester.alpha");
        fs::write(packs.join("Alpha").join("pack.png"), b"png").expect("png");
        write_pack_json(&packs.join("Beta"), "Beta Pack", "tester.beta");
        fs::create_dir_all(packs.join("Split")).expect("reserved");
        fs::write(packs.join("Split").join("pack.json"), "{}").expect("reserved json");

        let listed = list_installed_packs(&layout).expect("list");
        let names: Vec<_> = listed
            .iter()
            .map(|p| p.folder_name.as_str())
            .collect();
        assert_eq!(names, vec!["Alpha", "Beta"]);
        assert!(listed.iter().any(|p| p.pack_png_path.is_some()));
        assert!(listed.iter().all(|p| p.id.starts_with("library:")));
    }

    #[test]
    fn update_installed_pack_metadata_round_trip_and_rejects_escape() {
        let root = unique_temp("root-update-meta");
        let gd = unique_temp("gd-update-meta");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let pack = layout.texture_loader_packs().join("Demo");
        write_pack_json(&pack, "Demo", "tester.demo");
        fs::write(pack.join("pack.png"), b"old").expect("old png");

        let new_png = unique_temp("new-png").join("icon.png");
        fs::write(&new_png, b"new").expect("new png");

        let updated = update_installed_pack_metadata(
            &pack.to_string_lossy(),
            &PackMetadata {
                textureldr: "1.5.0".to_string(),
                name: "Updated Demo".to_string(),
                id: "tester.updated".to_string(),
                version: "2.0.0".to_string(),
                author: "Editor".to_string(),
            },
            true,
            Some(new_png.to_string_lossy().as_ref()),
            &layout,
        )
        .expect("update");
        assert_eq!(updated.metadata.as_ref().unwrap().name, "Updated Demo");
        assert_eq!(fs::read(pack.join("pack.png")).expect("png"), b"new");

        let cleared = update_installed_pack_metadata(
            &pack.to_string_lossy(),
            &PackMetadata {
                textureldr: "1.5.0".to_string(),
                name: "Updated Demo".to_string(),
                id: "tester.updated".to_string(),
                version: "2.0.0".to_string(),
                author: "Editor".to_string(),
            },
            true,
            None,
            &layout,
        )
        .expect("clear png");
        assert!(cleared.pack_png_path.is_none());
        assert!(!pack.join("pack.png").exists());

        let outside = unique_temp("outside-pack");
        fs::create_dir_all(&outside).expect("outside");
        let err = update_installed_pack_metadata(
            &outside.to_string_lossy(),
            &PackMetadata {
                textureldr: "1.5.0".to_string(),
                name: "Evil".to_string(),
                id: "evil".to_string(),
                version: "1.0.0".to_string(),
                author: "x".to_string(),
            },
            false,
            None,
            &layout,
        )
        .expect_err("escape");
        assert!(
            err.to_string().contains("texture-loader")
                || err.to_string().contains("packs")
                || err.to_string().contains("pack must")
        );
    }

    #[test]
    fn run_pack_operation_rejects_path_escape() {
        let root = unique_temp("root-op-escape");
        let gd = unique_temp("gd-op-escape");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);
        let outside = unique_temp("outside-op");
        fs::create_dir_all(&outside).expect("outside");

        let err = run_pack_operation(
            &outside.to_string_lossy(),
            PackOperationKind::Splitter,
            &RunPackOperationOptions::default(),
            &layout,
            |_| {},
        )
        .expect_err("escape");
        assert!(
            err.to_string().contains("texture-loader")
                || err.to_string().contains("packs")
                || err.to_string().contains("pack must")
        );
    }

    #[test]
    fn delete_installed_pack_removes_folder_and_rejects_escape() {
        let root = unique_temp("root-delete");
        let gd = unique_temp("gd-delete");
        make_gd_found(&gd);
        let layout = test_layout(&root, &gd);

        let packs = layout.texture_loader_packs();
        let pack = packs.join("Delete Me");
        fs::create_dir_all(pack.join("icons")).expect("pack");
        fs::write(pack.join("pack.json"), r#"{"name":"Delete Me"}"#).expect("json");
        fs::write(pack.join("icons").join("a.png"), b"x").expect("png");

        delete_installed_pack(&pack.to_string_lossy(), &layout).expect("delete");
        assert!(!pack.exists());

        let outside = unique_temp("outside-delete");
        fs::create_dir_all(&outside).expect("outside");
        let err = delete_installed_pack(&outside.to_string_lossy(), &layout).expect_err("escape");
        assert!(
            err.to_string().contains("texture-loader")
                || err.to_string().contains("packs")
                || err.to_string().contains("pack must")
        );
    }
}
