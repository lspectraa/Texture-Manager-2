export type AppTheme = "dark" | "light";

export type AppSettingsView = {
  geometryDashDir: string | null;
  geometryDashResolved: string;
  geometryDashDetected: string;
  geometryDashFound: boolean;
  geometryDashOverrideActive: boolean;
  defaultSheetConcurrency: number;
  theme: AppTheme;
  language: string;
  gameFilesRoot: string;
  splitCacheDir: string;
};

export type SaveAppSettingsRequest = {
  geometryDashDir?: string;
  clearGeometryDashDir?: boolean;
  defaultSheetConcurrency?: number;
  theme?: AppTheme;
  language?: string;
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
  gameFilesRoot: "",
  splitCacheDir: "",
};
