export type OperationKind =
  | "splitter"
  | "porterSplitter"
  | "merger"
  | "convertToNewVersion"
  | "randomizer"
  | "glowMaker"
  | "geodeButtons";

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
}

export type OperationOptions =
  | { type: "splitter"; sheetConcurrency: number }
  | ({ type: "porterSplitter" } & PorterOptions)
  | ({ type: "merger" } & MergerOptions)
  | ({ type: "convertToNewVersion" } & ConvertToNewVersionOptions)
  | { type: "randomizer"; seed: string | null }
  | {
      type: "glowMaker";
      thickness: number;
      tolerance: number;
      dimensions: DimensionOverride | null;
    }
  | ({ type: "geodeButtons" } & GeodeButtonsOptions);

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
