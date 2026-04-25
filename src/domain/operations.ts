export type OperationKind =
  | "splitter"
  | "porterSplitter"
  | "merger"
  | "convertToNewVersion"
  | "randomizer"
  | "glowMaker";

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
    };

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
