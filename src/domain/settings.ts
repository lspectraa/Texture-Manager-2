import type { AppBackgroundOption } from "../config/appBackground";
import {
  APP_BACKGROUND_RANDOM,
  DEFAULT_APP_BACKGROUND_OPACITY,
} from "../config/appBackground";
import {
  DEFAULT_APP_LANGUAGE,
  type AppLanguage,
} from "../i18n/languages";

export type AppTheme = "dark" | "light";

export type { AppLanguage };

/** `"random"` (default) or a discovered `game_bg_*_001-uhd.png` filename. */
export type AppBackgroundSetting = typeof APP_BACKGROUND_RANDOM | string;

/** Current first-run onboarding revision. Values below this show onboarding. */
export const CURRENT_ONBOARDING_VERSION = 1;

export type AppSettingsView = {
  geometryDashDir: string | null;
  geometryDashResolved: string;
  geometryDashDetected: string;
  geometryDashFound: boolean;
  geometryDashOverrideActive: boolean;
  defaultSheetConcurrency: number;
  theme: AppTheme;
  language: AppLanguage;
  /** `"random"` or a `game_bg_*_001-uhd.png` id from `availableAppBackgrounds`. */
  appBackground: AppBackgroundSetting;
  /** Opacity applied only to the game background image layer, from 0.1 to 1. */
  appBackgroundOpacity: number;
  /** Completed first-run onboarding revision. `0` means incomplete. */
  onboardingVersion: number;
  availableAppBackgrounds: AppBackgroundOption[];
  gameFilesRoot: string;
  splitCacheDir: string;
};

export type SaveAppSettingsRequest = {
  geometryDashDir?: string;
  clearGeometryDashDir?: boolean;
  defaultSheetConcurrency?: number;
  theme?: AppTheme;
  language?: AppLanguage;
  appBackground?: AppBackgroundSetting;
  appBackgroundOpacity?: number;
  onboardingVersion?: number;
};

export const DEFAULT_APP_SETTINGS_VIEW: AppSettingsView = {
  geometryDashDir: null,
  geometryDashResolved: "",
  geometryDashDetected: "",
  geometryDashFound: false,
  geometryDashOverrideActive: false,
  defaultSheetConcurrency: 5,
  theme: "dark",
  language: DEFAULT_APP_LANGUAGE,
  appBackground: APP_BACKGROUND_RANDOM,
  appBackgroundOpacity: DEFAULT_APP_BACKGROUND_OPACITY,
  onboardingVersion: 0,
  availableAppBackgrounds: [],
  gameFilesRoot: "",
  splitCacheDir: "",
};
