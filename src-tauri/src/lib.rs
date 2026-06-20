mod core;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use tauri::{AppHandle, Emitter, Manager};

use crate::core::contracts::{phase_defaults, OperationRequest, PhaseDefaults};
use crate::core::executor::execute_operation_plan;
use crate::core::game_files::{bootstrap_game_files, GameFilesLayoutDto, GameFilesState};
use crate::core::geode_buttons::{
    geode_buttons_target_index, geode_buttons_template_preview_data_url, resolve_geode_buttons_plist,
    GeodeButtonsTargetGroup,
};
use crate::core::icon_editor::{
    icon_editor_add_frame as icon_editor_add_frame_core,
    icon_editor_extract_frames as icon_editor_extract_frames_core,
    icon_editor_import_frame as icon_editor_import_frame_core,
    icon_editor_png_data_url as icon_editor_png_data_url_core,
    icon_editor_rotate_frame as icon_editor_rotate_frame_core,
    icon_editor_copy_sheet as icon_editor_copy_sheet_core,
    icon_editor_rename_sheet as icon_editor_rename_sheet_core,
    icon_editor_swap_rename_sheet as icon_editor_swap_rename_sheet_core,
    icon_editor_save_plist as icon_editor_save_plist_core,
    icon_editor_sheet_info as icon_editor_sheet_info_core, IconEditorExtractedFrame,
    IconEditorFrameTextureUpdate, IconEditorFrameUpdate, IconEditorRenameResult, IconEditorSheetInfo,
};
use crate::core::operations::build_operation_plan;
use crate::core::pipeline::{alpha_trim_bounds, normalize_rotation, nullify_offset};
use crate::core::plist::{format_pair, parse_pair, scale_pair_ceil, scale_pair_floor};
use crate::core::report::{OperationReport, ReportIssue, ReportLevel};

#[tauri::command]
fn get_phase_defaults() -> PhaseDefaults {
    phase_defaults()
}

#[tauri::command]
fn validate_operation_request(request: OperationRequest) -> Result<String, String> {
    let plan = build_operation_plan(request).map_err(|err| err.to_string())?;
    serde_json::to_string(&plan).map_err(|err| err.to_string())
}

/// Shared cancel flag for the blocking operation worker (see `cancel_operation`).
#[derive(Clone, Default)]
pub struct OperationCancel(Arc<AtomicBool>);

impl OperationCancel {
    fn prepare_run(&self) {
        self.0.store(false, Ordering::SeqCst);
    }

    fn token(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.0)
    }

    fn request_cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

#[tauri::command]
fn cancel_operation(cancel: tauri::State<'_, OperationCancel>) {
    cancel.request_cancel();
}

#[tauri::command]
async fn run_operation(
    app: AppHandle,
    cancel: tauri::State<'_, OperationCancel>,
    game_files: tauri::State<'_, GameFilesState>,
    request: OperationRequest,
) -> Result<OperationReport, String> {
    cancel.prepare_run();
    let cancel_flag = cancel.token();
    let plan = build_operation_plan(request).map_err(|err| err.to_string())?;
    let layout = Arc::clone(&game_files.0);
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        execute_operation_plan(
            &plan,
            layout.as_ref(),
            move |progress| {
                let _ = app_handle.emit("operation-progress", &progress);
            },
            cancel_flag,
        )
    })
    .await
    .map_err(|err| format!("blocking task join: {err}"))?
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn phase1_primitives_smoke_report() -> OperationReport {
    let mut issues: Vec<ReportIssue> = Vec::new();

    match parse_pair("{10.0,20.0}") {
        Ok(parsed) => match scale_pair_ceil(parsed, 2.0) {
            Ok(scaled) => {
                let _formatted = format_pair(scaled);
                let _scaled_floor = scale_pair_floor(parsed, 2.0);
            }
            Err(err) => {
                issues.push(ReportIssue {
                    level: ReportLevel::Error,
                    message: format!("scale_pair_ceil failed: {err}"),
                    file: None,
                });
            }
        },
        Err(err) => {
            issues.push(ReportIssue {
                level: ReportLevel::Error,
                message: format!("parse_pair failed: {err}"),
                file: None,
            });
        }
    }

    let alpha = vec![vec![0_u8, 0_u8, 0_u8], vec![0_u8, 255_u8, 0_u8]];
    if alpha_trim_bounds(&alpha).is_none() {
        issues.push(ReportIssue {
            level: ReportLevel::Warning,
            message: "alpha_trim_bounds returned None for non-empty alpha".to_string(),
            file: None,
        });
    }

    let _normalized = normalize_rotation(true);
    let _offset = nullify_offset();

    OperationReport {
        operation: "phase1PrimitivesSmoke".to_string(),
        files_seen: 1,
        files_processed: 1,
        output_dir: "in-memory".to_string(),
        elapsed_ms: 0,
        issues,
    }
}

#[tauri::command]
fn icon_editor_sheet_info(plist_path: String) -> Result<IconEditorSheetInfo, String> {
    icon_editor_sheet_info_core(std::path::Path::new(&plist_path)).map_err(|err| err.to_string())
}

#[tauri::command]
fn icon_editor_save_plist(
    plist_path: String,
    updates: Vec<IconEditorFrameUpdate>,
    removed_frame_names: Option<Vec<String>>,
    frame_texture_updates: Option<Vec<IconEditorFrameTextureUpdate>>,
) -> Result<(), String> {
    let removed = removed_frame_names.unwrap_or_default();
    let texture_updates = frame_texture_updates.unwrap_or_default();
    icon_editor_save_plist_core(
        std::path::Path::new(&plist_path),
        &updates,
        removed.as_slice(),
        texture_updates.as_slice(),
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn icon_editor_import_frame(
    plist_path: String,
    frame_name: String,
    texture_path: String,
) -> Result<(), String> {
    icon_editor_import_frame_core(
        std::path::Path::new(&plist_path),
        frame_name.as_str(),
        std::path::Path::new(&texture_path),
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn icon_editor_rotate_frame(
    plist_path: String,
    frame_name: String,
    direction: String,
) -> Result<(), String> {
    icon_editor_rotate_frame_core(
        std::path::Path::new(&plist_path),
        frame_name.as_str(),
        direction.as_str(),
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn icon_editor_add_frame(
    plist_path: String,
    frame_name: String,
    texture_path: String,
) -> Result<(), String> {
    icon_editor_add_frame_core(
        std::path::Path::new(&plist_path),
        frame_name.as_str(),
        std::path::Path::new(&texture_path),
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn icon_editor_extract_frames(plist_path: String) -> Result<Vec<IconEditorExtractedFrame>, String> {
    icon_editor_extract_frames_core(std::path::Path::new(&plist_path))
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn icon_editor_rename_sheet(
    plist_path: String,
    new_stem: String,
) -> Result<IconEditorRenameResult, String> {
    icon_editor_rename_sheet_core(std::path::Path::new(&plist_path), new_stem.as_str())
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn icon_editor_swap_rename_sheet(
    plist_path: String,
    new_stem: String,
) -> Result<IconEditorRenameResult, String> {
    icon_editor_swap_rename_sheet_core(std::path::Path::new(&plist_path), new_stem.as_str())
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn icon_editor_copy_sheet(
    plist_path: String,
    new_stem: String,
    updates: Vec<IconEditorFrameUpdate>,
    removed_frame_names: Option<Vec<String>>,
    frame_texture_updates: Option<Vec<IconEditorFrameTextureUpdate>>,
) -> Result<IconEditorRenameResult, String> {
    let removed = removed_frame_names.unwrap_or_default();
    let texture_updates = frame_texture_updates.unwrap_or_default();
    icon_editor_copy_sheet_core(
        std::path::Path::new(&plist_path),
        new_stem.as_str(),
        &updates,
        removed.as_slice(),
        texture_updates.as_slice(),
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn icon_editor_png_data_url(texture_path: String) -> Result<String, String> {
    icon_editor_png_data_url_core(std::path::Path::new(&texture_path)).map_err(|err| err.to_string())
}

#[tauri::command]
fn icon_editor_save_png_data_url(output_path: String, png_data_url: String) -> Result<(), String> {
    let encoded = png_data_url
        .split_once(',')
        .map(|(_, data)| data)
        .ok_or_else(|| "invalid png data url".to_string())?;
    let bytes = BASE64_STANDARD
        .decode(encoded)
        .map_err(|err| format!("failed to decode png data: {err}"))?;
    std::fs::write(&output_path, bytes).map_err(|err| format!("failed to write png: {err}"))
}

#[tauri::command]
fn get_game_files_layout(game_files: tauri::State<'_, GameFilesState>) -> GameFilesLayoutDto {
    game_files.0.to_dto()
}

#[tauri::command]
fn geode_buttons_target_index_cmd(
    game_files: tauri::State<'_, GameFilesState>,
    plist_path: String,
) -> Result<Vec<GeodeButtonsTargetGroup>, String> {
    geode_buttons_target_index(std::path::Path::new(&plist_path), game_files.0.as_ref())
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn geode_buttons_autoselect_plist_cmd(input_dir: String) -> Result<Option<String>, String> {
    resolve_geode_buttons_plist(std::path::Path::new(&input_dir)).map_err(|err| err.to_string())
}

#[tauri::command]
fn geode_buttons_default_input_dir_cmd(game_files: tauri::State<'_, GameFilesState>) -> String {
    game_files.0.current.to_string_lossy().to_string()
}

#[tauri::command]
fn geode_buttons_template_preview_data_url_cmd(path: String) -> Result<String, String> {
    geode_buttons_template_preview_data_url(path.as_str()).map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let layout = bootstrap_game_files().map_err(|err| err.to_string())?;
            app.manage(GameFilesState(Arc::new(layout)));
            Ok(())
        })
        .manage(OperationCancel::default())
        .invoke_handler(tauri::generate_handler![
            get_phase_defaults,
            get_game_files_layout,
            validate_operation_request,
            run_operation,
            cancel_operation,
            phase1_primitives_smoke_report,
            geode_buttons_target_index_cmd,
            geode_buttons_autoselect_plist_cmd,
            geode_buttons_default_input_dir_cmd,
            geode_buttons_template_preview_data_url_cmd,
            icon_editor_sheet_info,
            icon_editor_save_plist,
            icon_editor_import_frame,
            icon_editor_rotate_frame,
            icon_editor_add_frame,
            icon_editor_extract_frames,
            icon_editor_rename_sheet,
            icon_editor_swap_rename_sheet,
            icon_editor_copy_sheet,
            icon_editor_png_data_url,
            icon_editor_save_png_data_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
