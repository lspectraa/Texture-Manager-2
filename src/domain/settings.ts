import type { AppBackgroundOption } from "../config/appBackground";
import {
  APP_BACKGROUND_RANDOM,
  DEFAULT_APP_BACKGROUND_OPACITY,
} from "../config/appBackground";

export type AppTheme = "dark" | "light";

/** `"random"` (default) or a discovered `game_bg_*_001-uhd.png` filename. */
export type AppBackgroundSetting = typeof APP_BACKGROUND_RANDOM | string;

export type AppSettingsView = {
  geometryDashDir: string | null;
  geometryDashResolved: string;
  geometryDashDetected: string;
  geometryDashFound: boolean;
  geometryDashOverrideActive: boolean;
  defaultSheetConcurrency: number;
  theme: AppTheme;
  language: string;
  /** `"random"` or a `game_bg_*_001-uhd.png` id from `availableAppBackgrounds`. */
  appBackground: AppBackgroundSetting;
  /** Opacity applied only to the game background image layer, from 0.1 to 1. */
  appBackgroundOpacity: number;
  availableAppBackgrounds: AppBackgroundOption[];
  gameFilesRoot: string;
  splitCacheDir: string;
};

export type SaveAppSettingsRequest = {
  geometryDashDir?: string;
  clearGeometryDashDir?: boolean;
  defaultSheetConcurrency?: number;
  theme?: AppTheme;
  language?: string;
  appBackground?: AppBackgroundSetting;
  appBackgroundOpacity?: number;
};

export const DEFAULT_APP_SETTINGS_VIEW: AppSettingsView = {
  geometryDashDir: null,
  geometryDashResolved: "",
  geometryDashDetected: "",
  geometryDashFound: false,
  geometryDashOverrideActive: false,
  defaultSheetConcurrency: 5,
  theme: "dark",
  language: "en",
  appBackground: APP_BACKGROUND_RANDOM,
  appBackgroundOpacity: DEFAULT_APP_BACKGROUND_OPACITY,
  availableAppBackgrounds: [],
  gameFilesRoot: "",
  splitCacheDir: "",
};
