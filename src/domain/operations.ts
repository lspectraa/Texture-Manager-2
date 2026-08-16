export type OperationKind =
  | "splitter"
  | "porterSplitter"
  | "merger"
  | "convertToNewVersion"
  | "randomizer"
  | "glowMaker"
  | "geodeButtons"
  | "upscaler";

export type UpscalerModel = "realesrganAnime" | "waifu2x";

/** Bundled with this build. The model picker is shown only when this has more than one entry. */
export const SHIPPED_UPSCALER_MODELS: readonly UpscalerModel[] = ["waifu2x"];

export const DEFAULT_UPSCALER_MODEL: UpscalerModel = "waifu2x";

export function isShippedUpscalerModel(value: UpscalerModel): boolean {
  return (SHIPPED_UPSCALER_MODELS as readonly string[]).includes(value);
}

export function normalizeUpscalerModel(value: unknown): UpscalerModel {
  const candidate: UpscalerModel | null =
    value === "waifu2x" || value === "realcugan"
      ? "waifu2x"
      : value === "realesrganAnime"
        ? "realesrganAnime"
        : null;
  if (candidate && isShippedUpscalerModel(candidate)) {
    return candidate;
  }
  return DEFAULT_UPSCALER_MODEL;
}

export function upscalerModelLabelKey(
  model: UpscalerModel,
): "upscaler.modelRealesrgan" | "upscaler.modelWaifu2x" {
  switch (model) {
    case "realesrganAnime":
      return "upscaler.modelRealesrgan";
    case "waifu2x":
      return "upscaler.modelWaifu2x";
    default: {
      const _exhaustive: never = model;
      return _exhaustive;
    }
  }
}

export type UpscalerTargetGraphics = "hd" | "uhd";

export interface UpscalerOptions {
  model: UpscalerModel;
  targetGraphics: UpscalerTargetGraphics;
  convertToLatest: boolean;
  gameVersion: string;
  /** Max concurrent gamesheets (1–4). */
  sheetConcurrency: number;
}

export type GeodeButtonsVariant =
  | "primary"
  | "secondary"
  | "darkAqua"
  | "darkPurple"
  | "gray"
  | "error"
  | "info"
  | "pink";

export interface HsvDelta {
  /** Hue delta in degrees (wraps 0..360). */
  hueDeg: number;
  /** Saturation delta, additive (-1..1 clamped after apply). */
  satDelta: number;
  /** Value delta, additive (-1..1 clamped after apply). */
  valDelta: number;
}

export interface GeodeButtonsVariantRule {
  variant: GeodeButtonsVariant;
  hsv: HsvDelta;
}

export interface GeodeButtonsTemplates {
  /** One template image per family id (e.g. `circleBig`, `editorBase`), except `tabs`. */
  familyTemplates: Record<string, string>;
  tabSelected: string | null;
  tabUnselected: string | null;
  tabUnselectedDark: string | null;
}

export interface GeodeButtonsOptions {
  /** If non-empty, only sheets whose stem matches (case-insensitive) are processed. */
  sheetStem: string;
  templates: GeodeButtonsTemplates;
  variantRules: GeodeButtonsVariantRule[];
  familyVariantRules: Record<string, Record<GeodeButtonsVariant, HsvDelta>> | null;
  sheetConcurrency: number;
}

export interface DimensionOverride {
  width: number;
  height: number;
}

export interface SplitterOptions {
  /** Max concurrent plist/png gamesheets (1–64). */
  sheetConcurrency: number;
  /** Skip discovering and splitting sheets under an `icons` folder. */
  skipIcons: boolean;
}

export interface PorterOptions {
  lowPort: boolean;
  dimensions: DimensionOverride | null;
  /** Max concurrent plist/png gamesheets and standalone png jobs (1–64). */
  sheetConcurrency: number;
}

export interface MergerOptions {
  includeOutsidePlistFiles: boolean;
  dimensions: DimensionOverride | null;
  /** Max concurrent merge source folders (1–64). */
  sheetConcurrency: number;
}

export interface ConvertToNewVersionOptions {
  gameVersion: string;
  /** Max concurrent plist/png gamesheets (1–64). */
  sheetConcurrency: number;
}

export interface PhaseDefaults {
  splitter: SplitterOptions;
  porter: PorterOptions;
  merger: MergerOptions;
  convertToNewVersion: ConvertToNewVersionOptions;
  upscaler: UpscalerOptions;
}

export type OperationOptions =
  | { type: "splitter"; sheetConcurrency: number; skipIcons: boolean }
  | ({ type: "porterSplitter" } & PorterOptions)
  | ({ type: "merger" } & MergerOptions)
  | ({ type: "convertToNewVersion" } & ConvertToNewVersionOptions)
  | { type: "randomizer"; seed: string | null }
  | {
      type: "glowMaker";
      thickness: number;
      tolerance: number;
      dimensions: DimensionOverride | null;
      rainbowGlow: boolean;
      compositeLayers: boolean;
    }
  | ({ type: "geodeButtons" } & GeodeButtonsOptions)
  | ({ type: "upscaler" } & UpscalerOptions);

export interface OperationRequest {
  kind: OperationKind;
  inputDir: string;
  outputDir: string;
  options: OperationOptions | null;
}

export type ReportLevel = "info" | "warning" | "error";

export interface ReportIssue {
  level: ReportLevel;
  message: string;
  file: string | null;
}

export interface OperationReport {
  operation: string;
  filesSeen: number;
  filesProcessed: number;
  outputDir: string;
  elapsedMs: number;
  issues: ReportIssue[];
  /** Upscaler: sprites sent through the AI sidecar. */
  spritesAiUpscaled?: number;
  /** Upscaler: sprites taken from the sprite hash / game-files cache. */
  spritesFromCache?: number;
}

/** Emitted from the backend while a long-running operation is in progress. */
export interface OperationProgress {
  gamesheetName: string;
  spritesCompleted: number;
  spritesTotal: number;
  /** Porter splitter: plist pairs completed / total. */
  plistsCompleted?: number;
  plistsTotal?: number;
}
