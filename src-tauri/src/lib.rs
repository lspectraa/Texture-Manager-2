mod core;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager};

use crate::core::contracts::{
    phase_defaults, GlowMakerOptions, OperationRequest, PhaseDefaults,
};
use crate::core::executor::execute_operation_plan;
use crate::core::game_files::{
    bootstrap_game_files, invalidate_geometry_dash_detection_cache, refresh_game_files_layout,
    GameFilesLayoutDto, GameFilesState,
};
use crate::core::geode_buttons::{
    geode_buttons_target_index, geode_buttons_template_preview_data_url,
    resolve_geode_buttons_default_input_dir, resolve_geode_buttons_default_sheet,
    resolve_geode_buttons_plist, GeodeButtonsTargetGroup,
};
use crate::core::glow_preview::{glow_maker_preview_data_url, random_uhd_icon_preview_data_url};
use crate::core::particle_editor::{
    particle_editor_load_texture as particle_editor_load_texture_core,
    particle_editor_open as particle_editor_open_core,
    particle_editor_save as particle_editor_save_core,
    ParticleOpenResult, ParticleSaveRequest,
};
use crate::core::particle_sprites::{
    particle_editor_sheet_frame_data_url, ParticlePreviewSprite,
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
use crate::core::pack_installer::{
    cleanup_pack_install_temp as cleanup_pack_install_temp_core,
    create_texture_pack as create_texture_pack_core,
    delete_installed_pack as delete_installed_pack_core,
    discover_pack_install as discover_pack_install_core,
    install_pack_plan as install_pack_plan_core,
    list_installed_packs as list_installed_packs_core,
    read_pack_metadata as read_pack_metadata_core,
    run_pack_operation as run_pack_operation_core,
    update_installed_pack_metadata as update_installed_pack_metadata_core, CreateTexturePackRequest,
    CreateTexturePackResult, InstallPackOptions, InstallPackResult, InstallPlan,
    InstalledPackSummary, PackMetadata, PackOperationKind, ReadPackMetadataResult,
    RunPackOperationOptions, RunPackOperationResult,
};
use crate::core::report::OperationReport;
use crate::core::settings::{
    add_custom_app_background as add_custom_app_background_core,
    app_background_png_data_url as app_background_png_data_url_core, apply_save_request,
    load_settings, remove_custom_app_background as remove_custom_app_background_core,
    save_settings, settings_view, AppSettings, AppSettingsView, SaveAppSettingsRequest,
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

/// Run blocking filesystem / image work off the async runtime so the webview stays responsive.
async fn run_blocking<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| format!("blocking task join: {err}"))?
}

#[tauri::command]
fn get_phase_defaults() -> PhaseDefaults {
    phase_defaults_from_settings()
}

#[tauri::command]
async fn get_app_settings(
    game_files: tauri::State<'_, GameFilesState>,
) -> Result<AppSettingsView, String> {
    let game_files = game_files.inner().clone();
    run_blocking(move || {
        let settings = load_settings();
        Ok(settings_view(&settings, &game_files.snapshot()))
    })
    .await
}

#[tauri::command]
async fn app_background_png_data_url(
    game_files: tauri::State<'_, GameFilesState>,
    id: String,
) -> Result<String, String> {
    let layout = game_files.snapshot();
    run_blocking(move || {
        let is_custom = id.trim().to_ascii_lowercase().starts_with("custom_");
        if !is_custom && !layout.geometry_dash_found() {
            return Err(
                "Geometry Dash is not configured. Open Settings and set or detect the install path."
                    .to_string(),
            );
        }
        app_background_png_data_url_core(&layout.resources, &layout.root, &id)
            .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn add_custom_app_background(
    game_files: tauri::State<'_, GameFilesState>,
    source_path: String,
) -> Result<AppSettingsView, String> {
    let game_files = game_files.inner().clone();
    run_blocking(move || {
        let path = std::path::PathBuf::from(source_path);
        add_custom_app_background_core(&path).map_err(|err| err.to_string())?;
        let settings = load_settings();
        Ok(settings_view(&settings, &game_files.snapshot()))
    })
    .await
}

#[tauri::command]
async fn remove_custom_app_background(
    game_files: tauri::State<'_, GameFilesState>,
    id: String,
) -> Result<AppSettingsView, String> {
    let game_files = game_files.inner().clone();
    run_blocking(move || {
        let settings = remove_custom_app_background_core(&id).map_err(|err| err.to_string())?;
        Ok(settings_view(&settings, &game_files.snapshot()))
    })
    .await
}

#[tauri::command]
async fn save_app_settings(
    game_files: tauri::State<'_, GameFilesState>,
    request: SaveAppSettingsRequest,
) -> Result<AppSettingsView, String> {
    let game_files = game_files.inner().clone();
    run_blocking(move || save_settings_and_refresh(&game_files, request)).await
}

#[tauri::command]
async fn set_geometry_dash_dir(
    game_files: tauri::State<'_, GameFilesState>,
    path: String,
) -> Result<AppSettingsView, String> {
    let game_files = game_files.inner().clone();
    run_blocking(move || {
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
                onboarding_version: None,
            },
        )
    })
    .await
}

#[tauri::command]
async fn clear_geometry_dash_dir(
    game_files: tauri::State<'_, GameFilesState>,
) -> Result<AppSettingsView, String> {
    let game_files = game_files.inner().clone();
    run_blocking(move || {
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
                onboarding_version: None,
            },
        )
    })
    .await
}

#[tauri::command]
async fn redetect_geometry_dash_dir(
    game_files: tauri::State<'_, GameFilesState>,
) -> Result<AppSettingsView, String> {
    let game_files = game_files.inner().clone();
    run_blocking(move || {
        invalidate_geometry_dash_detection_cache();
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
                onboarding_version: None,
            },
        )
    })
    .await
}

#[tauri::command]
fn open_path_in_os(
    app: AppHandle,
    game_files: tauri::State<'_, GameFilesState>,
    path: String,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let target =
        crate::core::safe_fs::parse_user_absolute_path(&path).map_err(|err| err.to_string())?;
    let layout = game_files.snapshot();
    let root = crate::core::game_files::resolve_game_files_root();
    std::fs::create_dir_all(&root).map_err(|err| {
        format!("failed to ensure game-files root exists: {err}")
    })?;

    // Allow game-files root, or Geode config/mods under a resolved GD install
    // (Create Pack "open folder" targets texture-loader packs).
    let allowed_roots: Vec<std::path::PathBuf> = {
        let mut roots = vec![root];
        if layout.geometry_dash_found() {
            let config = layout.geode_config();
            let mods = layout.geode_mods();
            let _ = std::fs::create_dir_all(&config);
            let _ = std::fs::create_dir_all(&mods);
            roots.push(config);
            roots.push(mods);
        }
        roots
    };

    let mut target_canon = None;
    let mut last_err = None;
    for allowed in &allowed_roots {
        match crate::core::safe_fs::ensure_canonical_under_root(&target, allowed) {
            Ok(canon) => {
                target_canon = Some(canon);
                break;
            }
            Err(err) => last_err = Some(err),
        }
    }
    let target_canon = target_canon.ok_or_else(|| {
        last_err
            .map(|err| err.to_string())
            .unwrap_or_else(|| {
                "Only directories under the Texture Manager game-files folder or Geode config/mods can be opened."
                    .to_string()
            })
    })?;
    if !target_canon.is_dir() {
        return Err(
            "Only directories under the Texture Manager game-files folder or Geode config/mods can be opened."
                .to_string(),
        );
    }

    app.opener()
        .open_path(target_canon.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|err| format!("Failed to open path: {err}"))
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
async fn icon_editor_sheet_info(plist_path: String) -> Result<IconEditorSheetInfo, String> {
    run_blocking(move || {
        icon_editor_sheet_info_core(std::path::Path::new(&plist_path)).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn icon_editor_save_plist(
    plist_path: String,
    updates: Vec<IconEditorFrameUpdate>,
    removed_frame_names: Option<Vec<String>>,
    frame_texture_updates: Option<Vec<IconEditorFrameTextureUpdate>>,
) -> Result<(), String> {
    run_blocking(move || {
        let removed = removed_frame_names.unwrap_or_default();
        let texture_updates = frame_texture_updates.unwrap_or_default();
        icon_editor_save_plist_core(
            std::path::Path::new(&plist_path),
            &updates,
            removed.as_slice(),
            texture_updates.as_slice(),
        )
        .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn icon_editor_import_frame(
    plist_path: String,
    frame_name: String,
    texture_path: String,
) -> Result<(), String> {
    run_blocking(move || {
        icon_editor_import_frame_core(
            std::path::Path::new(&plist_path),
            frame_name.as_str(),
            std::path::Path::new(&texture_path),
        )
        .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn icon_editor_rotate_frame(
    plist_path: String,
    frame_name: String,
    direction: String,
) -> Result<(), String> {
    run_blocking(move || {
        icon_editor_rotate_frame_core(
            std::path::Path::new(&plist_path),
            frame_name.as_str(),
            direction.as_str(),
        )
        .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn icon_editor_add_frame(
    plist_path: String,
    frame_name: String,
    texture_path: String,
) -> Result<(), String> {
    run_blocking(move || {
        icon_editor_add_frame_core(
            std::path::Path::new(&plist_path),
            frame_name.as_str(),
            std::path::Path::new(&texture_path),
        )
        .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn icon_editor_extract_frames(
    plist_path: String,
) -> Result<Vec<IconEditorExtractedFrame>, String> {
    run_blocking(move || {
        icon_editor_extract_frames_core(std::path::Path::new(&plist_path))
            .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn icon_editor_rename_sheet(
    plist_path: String,
    new_stem: String,
) -> Result<IconEditorRenameResult, String> {
    run_blocking(move || {
        icon_editor_rename_sheet_core(std::path::Path::new(&plist_path), new_stem.as_str())
            .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn icon_editor_swap_rename_sheet(
    plist_path: String,
    new_stem: String,
) -> Result<IconEditorRenameResult, String> {
    run_blocking(move || {
        icon_editor_swap_rename_sheet_core(std::path::Path::new(&plist_path), new_stem.as_str())
            .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn icon_editor_copy_sheet(
    plist_path: String,
    new_stem: String,
    updates: Vec<IconEditorFrameUpdate>,
    removed_frame_names: Option<Vec<String>>,
    frame_texture_updates: Option<Vec<IconEditorFrameTextureUpdate>>,
) -> Result<IconEditorRenameResult, String> {
    run_blocking(move || {
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
    })
    .await
}

#[tauri::command]
async fn icon_editor_png_data_url(texture_path: String) -> Result<String, String> {
    run_blocking(move || {
        icon_editor_png_data_url_core(std::path::Path::new(&texture_path))
            .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn icon_editor_save_png_data_url(
    output_path: String,
    png_data_url: String,
) -> Result<(), String> {
    run_blocking(move || {
        icon_editor_save_png_data_url_core(
            std::path::Path::new(&output_path),
            png_data_url.as_str(),
        )
        .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn particle_editor_open(path: String) -> Result<ParticleOpenResult, String> {
    run_blocking(move || {
        particle_editor_open_core(&path).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn particle_editor_save(request: ParticleSaveRequest) -> Result<(), String> {
    run_blocking(move || {
        particle_editor_save_core(request).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn particle_editor_load_texture(path: String) -> Result<String, String> {
    run_blocking(move || {
        particle_editor_load_texture_core(&path).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
fn get_game_files_layout(game_files: tauri::State<'_, GameFilesState>) -> GameFilesLayoutDto {
    game_files.snapshot().to_dto()
}

#[tauri::command]
async fn discover_pack_install(
    game_files: tauri::State<'_, GameFilesState>,
    path: String,
) -> Result<InstallPlan, String> {
    let layout = game_files.snapshot();
    run_blocking(move || {
        discover_pack_install_core(&path, &layout).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn install_pack_plan(
    app: AppHandle,
    game_files: tauri::State<'_, GameFilesState>,
    plan: InstallPlan,
    unit_ids: Vec<String>,
    options: Option<InstallPackOptions>,
) -> Result<InstallPackResult, String> {
    let layout = game_files.snapshot();
    let app_handle = app.clone();
    let options = options.unwrap_or_default();
    run_blocking(move || {
        install_pack_plan_core(&plan, &unit_ids, &layout, &options, move |progress| {
            let _ = app_handle.emit("pack-install-progress", &progress);
        })
        .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn create_texture_pack(
    game_files: tauri::State<'_, GameFilesState>,
    folder_name: String,
    metadata: PackMetadata,
    pack_png_path: Option<String>,
) -> Result<CreateTexturePackResult, String> {
    let layout = game_files.snapshot();
    let request = CreateTexturePackRequest {
        folder_name,
        metadata,
        pack_png_path,
    };
    run_blocking(move || {
        create_texture_pack_core(&request, &layout).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn read_pack_metadata(pack_dir: String) -> Result<ReadPackMetadataResult, String> {
    run_blocking(move || {
        read_pack_metadata_core(&pack_dir).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn cleanup_pack_install_temp(
    game_files: tauri::State<'_, GameFilesState>,
    temp_dir: String,
) -> Result<(), String> {
    let layout = game_files.snapshot();
    run_blocking(move || {
        cleanup_pack_install_temp_core(&temp_dir, &layout).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn list_installed_packs(
    game_files: tauri::State<'_, GameFilesState>,
) -> Result<Vec<InstalledPackSummary>, String> {
    let layout = game_files.snapshot();
    run_blocking(move || {
        list_installed_packs_core(&layout).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn update_installed_pack_metadata(
    game_files: tauri::State<'_, GameFilesState>,
    pack_dir: String,
    metadata: PackMetadata,
    update_pack_png: bool,
    pack_png_path: Option<String>,
) -> Result<ReadPackMetadataResult, String> {
    let layout = game_files.snapshot();
    run_blocking(move || {
        update_installed_pack_metadata_core(
            &pack_dir,
            &metadata,
            update_pack_png,
            pack_png_path.as_deref(),
            &layout,
        )
        .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn delete_installed_pack(
    game_files: tauri::State<'_, GameFilesState>,
    pack_dir: String,
) -> Result<(), String> {
    let layout = game_files.snapshot();
    run_blocking(move || {
        delete_installed_pack_core(&pack_dir, &layout).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn run_pack_operation(
    app: AppHandle,
    game_files: tauri::State<'_, GameFilesState>,
    pack_dir: String,
    kind: PackOperationKind,
    options: Option<RunPackOperationOptions>,
) -> Result<RunPackOperationResult, String> {
    let layout = game_files.snapshot();
    let app_handle = app.clone();
    let options = options.unwrap_or_default();
    run_blocking(move || {
        run_pack_operation_core(&pack_dir, kind, &options, &layout, move |progress| {
            let _ = app_handle.emit("pack-install-progress", &progress);
        })
        .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn geode_buttons_target_index_cmd(
    game_files: tauri::State<'_, GameFilesState>,
    plist_path: String,
    use_game_files_cache: bool,
) -> Result<Vec<GeodeButtonsTargetGroup>, String> {
    let layout = game_files.snapshot();
    run_blocking(move || {
        if use_game_files_cache && !layout.geometry_dash_found() {
            return Err(
                "Geometry Dash is not configured. Open Settings and set or detect the install path."
                    .to_string(),
            );
        }
        let plist = crate::core::safe_fs::parse_user_absolute_path(&plist_path)
            .map_err(|err| err.to_string())?;
        geode_buttons_target_index(&plist, &layout, use_game_files_cache).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn geode_buttons_autoselect_plist_cmd(
    game_files: tauri::State<'_, GameFilesState>,
    input_dir: String,
) -> Result<Option<String>, String> {
    let layout = game_files.snapshot();
    run_blocking(move || {
        let trimmed = input_dir.trim();
        if !trimmed.is_empty() {
            let dir = crate::core::safe_fs::parse_user_absolute_path(trimmed)
                .map_err(|err| err.to_string())?;
            if let Some(path) =
                resolve_geode_buttons_plist(&dir).map_err(|err| err.to_string())?
            {
                return Ok(Some(path));
            }
        }
        if !layout.geometry_dash_found() {
            return Ok(None);
        }
        Ok(resolve_geode_buttons_default_sheet(&layout)
            .map_err(|err| err.to_string())?
            .map(|pair| pair.plist_path.to_string_lossy().to_string()))
    })
    .await
}

#[tauri::command]
fn geode_buttons_default_input_dir_cmd(game_files: tauri::State<'_, GameFilesState>) -> String {
    resolve_geode_buttons_default_input_dir(&game_files.snapshot())
}

#[tauri::command]
async fn geode_buttons_template_preview_data_url_cmd(path: String) -> Result<String, String> {
    run_blocking(move || {
        geode_buttons_template_preview_data_url(path.as_str()).map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn glow_maker_preview_cmd(
    options: GlowMakerOptions,
    refresh: Option<bool>,
    icon_plist_path: Option<String>,
    game_files: tauri::State<'_, GameFilesState>,
) -> Result<String, String> {
    let layout = game_files.snapshot();
    let refresh = refresh.unwrap_or(false);
    run_blocking(move || {
        glow_maker_preview_data_url(
            &layout,
            &options,
            refresh,
            icon_plist_path.as_deref(),
        )
        .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn particle_editor_preview_icon_cmd(
    refresh: Option<bool>,
    kind: Option<String>,
    icon_plist_path: Option<String>,
    game_files: tauri::State<'_, GameFilesState>,
) -> Result<ParticlePreviewSprite, String> {
    let layout = game_files.snapshot();
    let refresh = refresh.unwrap_or(false);
    run_blocking(move || {
        random_uhd_icon_preview_data_url(
            &layout,
            refresh,
            kind.as_deref(),
            icon_plist_path.as_deref(),
        )
        .map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn particle_editor_sheet_frame_cmd(
    sheet_stem: String,
    frame_name: String,
    game_files: tauri::State<'_, GameFilesState>,
) -> Result<ParticlePreviewSprite, String> {
    let layout = game_files.snapshot();
    run_blocking(move || {
        particle_editor_sheet_frame_data_url(&layout, &sheet_stem, &frame_name)
            .map_err(|err| err.to_string())
    })
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            let layout = bootstrap_game_files().map_err(|err| err.to_string())?;
            app.manage(GameFilesState::new(layout));
            // Window starts hidden so bootstrap / Steam detection never flash a blank frame.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .manage(OperationCancel::default())
        .invoke_handler(tauri::generate_handler![
            get_phase_defaults,
            get_app_settings,
            app_background_png_data_url,
            add_custom_app_background,
            remove_custom_app_background,
            save_app_settings,
            set_geometry_dash_dir,
            clear_geometry_dash_dir,
            redetect_geometry_dash_dir,
            open_path_in_os,
            get_game_files_layout,
            discover_pack_install,
            install_pack_plan,
            create_texture_pack,
            read_pack_metadata,
            cleanup_pack_install_temp,
            list_installed_packs,
            update_installed_pack_metadata,
            delete_installed_pack,
            run_pack_operation,
            validate_operation_request,
            run_operation,
            cancel_operation,
            geode_buttons_target_index_cmd,
            geode_buttons_autoselect_plist_cmd,
            geode_buttons_default_input_dir_cmd,
            geode_buttons_template_preview_data_url_cmd,
            glow_maker_preview_cmd,
            particle_editor_preview_icon_cmd,
            particle_editor_sheet_frame_cmd,
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
            icon_editor_save_png_data_url,
            particle_editor_open,
            particle_editor_save,
            particle_editor_load_texture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
