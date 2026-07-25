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

/** In-memory settings for browser / non-Tauri (Playwright, Vite). */
let browserSettings: AppSettingsView = { ...DEFAULT_APP_SETTINGS_VIEW };

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

function applyBrowserSave(request: SaveAppSettingsRequest): AppSettingsView {
  const next: AppSettingsView = {
    ...browserSettings,
    theme: request.theme ?? browserSettings.theme,
    language: normalizeAppLanguage(
      request.language ?? browserSettings.language,
    ),
    defaultSheetConcurrency:
      request.defaultSheetConcurrency ?? browserSettings.defaultSheetConcurrency,
    appBackground: request.appBackground ?? browserSettings.appBackground,
    appBackgroundOpacity:
      request.appBackgroundOpacity ?? browserSettings.appBackgroundOpacity,
    onboardingVersion:
      request.onboardingVersion ?? browserSettings.onboardingVersion,
  };

  if (request.clearGeometryDashDir) {
    next.geometryDashDir = null;
    next.geometryDashOverrideActive = false;
    next.geometryDashResolved = next.geometryDashDetected;
    next.geometryDashFound = Boolean(next.geometryDashDetected);
  } else if (request.geometryDashDir !== undefined) {
    next.geometryDashDir = request.geometryDashDir;
    next.geometryDashOverrideActive = Boolean(request.geometryDashDir);
    next.geometryDashResolved =
      request.geometryDashDir || next.geometryDashDetected;
    next.geometryDashFound = Boolean(next.geometryDashResolved);
  }

  browserSettings = normalizeSettingsView(next);
  return { ...browserSettings };
}

export const getAppSettings = async (): Promise<AppSettingsView> => {
  if (!isTauriRuntime()) {
    return { ...browserSettings };
  }
  const view = await invoke<AppSettingsView>("get_app_settings");
  return normalizeSettingsView(view);
};

export const saveAppSettings = async (
  request: SaveAppSettingsRequest,
): Promise<AppSettingsView> => {
  if (!isTauriRuntime()) {
    return applyBrowserSave(request);
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
