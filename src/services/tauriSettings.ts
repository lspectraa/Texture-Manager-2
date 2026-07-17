import { invoke } from "@tauri-apps/api/core";
import {
  AppSettingsView,
  DEFAULT_APP_SETTINGS_VIEW,
  SaveAppSettingsRequest,
} from "../domain/settings";
import { isAppTheme } from "../utils/theme";
import { isTauriRuntime } from "./tauriOperations";

function normalizeSettingsView(raw: AppSettingsView): AppSettingsView {
  return {
    ...DEFAULT_APP_SETTINGS_VIEW,
    ...raw,
    theme: isAppTheme(raw.theme) ? raw.theme : "dark",
    language: raw.language?.trim() || "en",
    defaultSheetConcurrency: Math.min(
      64,
      Math.max(1, Number(raw.defaultSheetConcurrency) || 5),
    ),
  };
}

export const getAppSettings = async (): Promise<AppSettingsView> => {
  if (!isTauriRuntime()) {
    return { ...DEFAULT_APP_SETTINGS_VIEW };
  }
  const view = await invoke<AppSettingsView>("get_app_settings");
  return normalizeSettingsView(view);
};

export const saveAppSettings = async (
  request: SaveAppSettingsRequest,
): Promise<AppSettingsView> => {
  if (!isTauriRuntime()) {
    return {
      ...DEFAULT_APP_SETTINGS_VIEW,
      theme: request.theme ?? DEFAULT_APP_SETTINGS_VIEW.theme,
      language: request.language ?? DEFAULT_APP_SETTINGS_VIEW.language,
      defaultSheetConcurrency:
        request.defaultSheetConcurrency ??
        DEFAULT_APP_SETTINGS_VIEW.defaultSheetConcurrency,
      geometryDashDir: request.clearGeometryDashDir
        ? null
        : (request.geometryDashDir ?? DEFAULT_APP_SETTINGS_VIEW.geometryDashDir),
    };
  }
  const view = await invoke<AppSettingsView>("save_app_settings", { request });
  return normalizeSettingsView(view);
};

export const setGeometryDashDir = async (path: string): Promise<AppSettingsView> => {
  if (!isTauriRuntime()) {
    return saveAppSettings({ geometryDashDir: path });
  }
  const view = await invoke<AppSettingsView>("set_geometry_dash_dir", { path });
  return normalizeSettingsView(view);
};

export const clearGeometryDashDir = async (): Promise<AppSettingsView> => {
  if (!isTauriRuntime()) {
    return saveAppSettings({ clearGeometryDashDir: true });
  }
  const view = await invoke<AppSettingsView>("clear_geometry_dash_dir");
  return normalizeSettingsView(view);
};

export const redetectGeometryDashDir = async (): Promise<AppSettingsView> => {
  if (!isTauriRuntime()) {
    return clearGeometryDashDir();
  }
  const view = await invoke<AppSettingsView>("redetect_geometry_dash_dir");
  return normalizeSettingsView(view);
};

export const openPathInOs = async (path: string): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke<void>("open_path_in_os", { path });
};
