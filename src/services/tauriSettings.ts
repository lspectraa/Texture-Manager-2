import { invoke } from "@tauri-apps/api/core";
import {
  APP_BACKGROUND_RANDOM,
  DEFAULT_APP_BACKGROUND_OPACITY,
  MAX_APP_BACKGROUND_OPACITY,
  MIN_APP_BACKGROUND_OPACITY,
} from "../config/appBackground";
import {
  AppSettingsView,
  DEFAULT_APP_SETTINGS_VIEW,
  SaveAppSettingsRequest,
} from "../domain/settings";
import { normalizeAppLanguage } from "../i18n/languages";
import { isAppTheme } from "../utils/theme";
import { isTauriRuntime } from "./tauriOperations";

function normalizeSettingsView(raw: AppSettingsView): AppSettingsView {
  const available = Array.isArray(raw.availableAppBackgrounds)
    ? raw.availableAppBackgrounds.filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.path === "string" &&
          typeof item.label === "string",
      )
    : [];
  const appBackgroundRaw =
    typeof raw.appBackground === "string" ? raw.appBackground.trim() : "";
  const appBackground =
    !appBackgroundRaw || appBackgroundRaw.toLowerCase() === APP_BACKGROUND_RANDOM
      ? APP_BACKGROUND_RANDOM
      : appBackgroundRaw;

  const onboardingVersionRaw = Number(raw.onboardingVersion);
  const onboardingVersion =
    Number.isFinite(onboardingVersionRaw) && onboardingVersionRaw >= 0
      ? Math.floor(onboardingVersionRaw)
      : 0;

  return {
    ...DEFAULT_APP_SETTINGS_VIEW,
    ...raw,
    theme: isAppTheme(raw.theme) ? raw.theme : "dark",
    language: normalizeAppLanguage(raw.language),
    appBackground,
    appBackgroundOpacity: Math.min(
      MAX_APP_BACKGROUND_OPACITY,
      Math.max(
        MIN_APP_BACKGROUND_OPACITY,
        Number(raw.appBackgroundOpacity) || DEFAULT_APP_BACKGROUND_OPACITY,
      ),
    ),
    onboardingVersion,
    availableAppBackgrounds: available,
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
    const nextBackground = request.appBackground ?? DEFAULT_APP_SETTINGS_VIEW.appBackground;
    return {
      ...DEFAULT_APP_SETTINGS_VIEW,
      theme: request.theme ?? DEFAULT_APP_SETTINGS_VIEW.theme,
      language: normalizeAppLanguage(
        request.language ?? DEFAULT_APP_SETTINGS_VIEW.language,
      ),
      defaultSheetConcurrency:
        request.defaultSheetConcurrency ??
        DEFAULT_APP_SETTINGS_VIEW.defaultSheetConcurrency,
      appBackground: nextBackground,
      appBackgroundOpacity:
        request.appBackgroundOpacity ??
        DEFAULT_APP_SETTINGS_VIEW.appBackgroundOpacity,
      onboardingVersion:
        request.onboardingVersion ?? DEFAULT_APP_SETTINGS_VIEW.onboardingVersion,
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
