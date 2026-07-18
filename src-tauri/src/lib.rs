mod core;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};

use crate::core::contracts::{phase_defaults, OperationRequest, PhaseDefaults};
use crate::core::executor::execute_operation_plan;
use crate::core::game_files::{
    bootstrap_game_files, refresh_game_files_layout, GameFilesLayoutDto, GameFilesState,
};
use crate::core::geode_buttons::{
    geode_buttons_target_index, geode_buttons_template_preview_data_url,
    resolve_geode_buttons_default_input_dir, resolve_geode_buttons_default_sheet,
    resolve_geode_buttons_plist, GeodeButtonsTargetGroup,
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
    icon_editor_save_png_data_url as icon_editor_save_png_data_url_core,
    icon_editor_sheet_info as icon_editor_sheet_info_core, IconEditorExtractedFrame,
    IconEditorFrameTextureUpdate, IconEditorFrameUpdate, IconEditorRenameResult, IconEditorSheetInfo,
};
use crate::core::operations::build_operation_plan;
use crate::core::report::OperationReport;
use crate::core::settings::{
    app_background_png_data_url as app_background_png_data_url_core, apply_save_request,
    load_settings, save_settings, settings_view, AppSettings, AppSettingsView,
    SaveAppSettingsRequest,
};

fn phase_defaults_from_settings() -> PhaseDefaults {
    let settings = load_settings();
    let mut defaults = phase_defaults();
    let concurrency = settings.default_sheet_concurrency;
    defaults.splitter.sheet_concurrency = concurrency;
    defaults.porter.sheet_concurrency = concurrency;
    defaults.merger.sheet_concurrency = concurrency;
    defaults.convert_to_new_version.sheet_concurrency = concurrency;
    defaults
}

fn refresh_layout_from_settings(
    game_files: &GameFilesState,
    settings: &AppSettings,
) -> AppSettingsView {
    let layout = refresh_game_files_layout(settings.geometry_dash_dir.as_deref());
    game_files.replace(layout);
    settings_view(settings, &game_files.snapshot())
}

fn save_settings_and_refresh(
    game_files: &GameFilesState,
    request: SaveAppSettingsRequest,
) -> Result<AppSettingsView, String> {
    let current = load_settings();
    let next = apply_save_request(&current, request).map_err(|err| err.to_string())?;
    let saved = save_settings(&next).map_err(|err| err.to_string())?;
    Ok(refresh_layout_from_settings(game_files, &saved))
}

#[tauri::command]
fn get_phase_defaults() -> PhaseDefaults {
    phase_defaults_from_settings()
}

#[tauri::command]
fn get_app_settings(game_files: tauri::State<'_, GameFilesState>) -> AppSettingsView {
    let settings = load_settings();
    settings_view(&settings, &game_files.snapshot())
}

#[tauri::command]
fn app_background_png_data_url(
    game_files: tauri::State<'_, GameFilesState>,
    id: String,
) -> Result<String, String> {
    let layout = game_files.snapshot();
    if !layout.geometry_dash_found() {
        return Err(
            "Geometry Dash is not configured. Open Settings and set or detect the install path."
                .to_string(),
        );
    }
    app_background_png_data_url_core(&layout.resources, &id).map_err(|err| err.to_string())
}

#[tauri::command]
fn save_app_settings(
    game_files: tauri::State<'_, GameFilesState>,
    request: SaveAppSettingsRequest,
) -> Result<AppSettingsView, String> {
    save_settings_and_refresh(&game_files, request)
}

#[tauri::command]
fn set_geometry_dash_dir(
    game_files: tauri::State<'_, GameFilesState>,
    path: String,
) -> Result<AppSettingsView, String> {
    save_settings_and_refresh(
        &game_files,
        SaveAppSettingsRequest {
            geometry_dash_dir: Some(path),
            clear_geometry_dash_dir: false,
            default_sheet_concurrency: None,
            theme: None,
            language: None,
            app_background: None,
            app_background_opacity: None,
        },
    )
}

#[tauri::command]
fn clear_geometry_dash_dir(
    game_files: tauri::State<'_, GameFilesState>,
) -> Result<AppSettingsView, String> {
    save_settings_and_refresh(
        &game_files,
        SaveAppSettingsRequest {
            geometry_dash_dir: None,
            clear_geometry_dash_dir: true,
            default_sheet_concurrency: None,
            theme: None,
            language: None,
            app_background: None,
            app_background_opacity: None,
        },
    )
}

#[tauri::command]
fn redetect_geometry_dash_dir(
    game_files: tauri::State<'_, GameFilesState>,
) -> Result<AppSettingsView, String> {
    save_settings_and_refresh(
        &game_files,
        SaveAppSettingsRequest {
            geometry_dash_dir: None,
            clear_geometry_dash_dir: true,
            default_sheet_concurrency: None,
            theme: None,
            language: None,
            app_background: None,
            app_background_opacity: None,
        },
    )
}

#[tauri::command]
fn open_path_in_os(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let target = crate::core::safe_fs::parse_user_absolute_path(&path).map_err(|err| err.to_string())?;
    if !target.exists() {
        return Err("Path does not exist.".to_string());
    }

    // Prefer plugin APIs over spawning explorer/open/xdg-open (avoids Windows /select,comma bugs).
    let result = if target.is_dir() {
        app.opener().open_path(target.to_string_lossy().as_ref(), None::<&str>)
    } else {
        app.opener().reveal_item_in_dir(&target)
    };
    result.map_err(|err| format!("Failed to open path: {err}"))
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
    let layout = game_files.snapshot();
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        execute_operation_plan(
            &plan,
            &layout,
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
    icon_editor_save_png_data_url_core(std::path::Path::new(&output_path), png_data_url.as_str())
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn get_game_files_layout(game_files: tauri::State<'_, GameFilesState>) -> GameFilesLayoutDto {
    game_files.snapshot().to_dto()
}

#[tauri::command]
fn geode_buttons_target_index_cmd(
    game_files: tauri::State<'_, GameFilesState>,
    plist_path: String,
    use_game_files_cache: bool,
) -> Result<Vec<GeodeButtonsTargetGroup>, String> {
    let layout = game_files.snapshot();
    if use_game_files_cache && !layout.geometry_dash_found() {
        return Err(
            "Geometry Dash is not configured. Open Settings and set or detect the install path."
                .to_string(),
        );
    }
    let plist = crate::core::safe_fs::parse_user_absolute_path(&plist_path)
        .map_err(|err| err.to_string())?;
    geode_buttons_target_index(&plist, &layout, use_game_files_cache).map_err(|err| err.to_string())
}

#[tauri::command]
fn geode_buttons_autoselect_plist_cmd(
    game_files: tauri::State<'_, GameFilesState>,
    input_dir: String,
) -> Result<Option<String>, String> {
    let trimmed = input_dir.trim();
    if !trimmed.is_empty() {
        let dir =
            crate::core::safe_fs::parse_user_absolute_path(trimmed).map_err(|err| err.to_string())?;
        if let Some(path) =
            resolve_geode_buttons_plist(&dir).map_err(|err| err.to_string())?
        {
            return Ok(Some(path));
        }
    }
    let layout = game_files.snapshot();
    if !layout.geometry_dash_found() {
        return Ok(None);
    }
    Ok(resolve_geode_buttons_default_sheet(&layout)
        .map_err(|err| err.to_string())?
        .map(|pair| pair.plist_path.to_string_lossy().to_string()))
}

#[tauri::command]
fn geode_buttons_default_input_dir_cmd(game_files: tauri::State<'_, GameFilesState>) -> String {
    resolve_geode_buttons_default_input_dir(&game_files.snapshot())
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
            app.manage(GameFilesState::new(layout));
            Ok(())
        })
        .manage(OperationCancel::default())
        .invoke_handler(tauri::generate_handler![
            get_phase_defaults,
            get_app_settings,
            app_background_png_data_url,
            save_app_settings,
            set_geometry_dash_dir,
            clear_geometry_dash_dir,
            redetect_geometry_dash_dir,
            open_path_in_os,
            get_game_files_layout,
            validate_operation_request,
            run_operation,
            cancel_operation,
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
