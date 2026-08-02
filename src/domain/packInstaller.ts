import type { ReportLevel } from "./operations";

export type PackMetadata = {
  textureldr: string;
  name: string;
  id: string;
  version: string;
  author: string;
};

export type InstallUnitKind = "pack" | "configTree" | "mod";

export type InstallTreeNode = {
  name: string;
  isDir: boolean;
  children?: InstallTreeNode[];
};

export type InstallUnit = {
  id: string;
  kind: InstallUnitKind;
  label: string;
  sourcePath: string;
  destinationPath: string;
  enabled: boolean;
  tree?: InstallTreeNode;
  metadata?: PackMetadata;
  packPngPath?: string;
  fileCount?: number;
};

export type InstallPlan = {
  sourcePath: string;
  workRoot: string;
  isZip: boolean;
  units: InstallUnit[];
  tempDir?: string;
};

export type CreateTexturePackRequest = {
  folderName: string;
  metadata: PackMetadata;
  packPngPath?: string;
};

export type CreateTexturePackResult = {
  packDir: string;
  packJsonPath: string;
  packPngPath?: string;
};

export type ReadPackMetadataResult = {
  metadata: PackMetadata | null;
  packPngPath: string | null;
};

export type PackInstallIssue = {
  level: ReportLevel;
  message: string;
};

export type InstallPackResult = {
  installed: number;
  skipped: number;
  issues: PackInstallIssue[];
};

export type InstallPackOptions = {
  convertToLatestVersion: boolean;
  gameVersion: string;
  /** Run Porter on each pack and overlay outputs into the installed pack folder. */
  portPacks: boolean;
  /** Porter "Port to Low Graphics". */
  lowPort: boolean;
  sheetConcurrency?: number;
};

export const DEFAULT_INSTALL_PACK_OPTIONS: InstallPackOptions = {
  convertToLatestVersion: false,
  gameVersion: "",
  portPacks: false,
  lowPort: false,
  sheetConcurrency: 5,
};

export type PackInstallProgress = {
  unitId: string;
  label: string;
  completed: number;
  total: number;
};

export type InstalledPack = {
  id: string;
  folderName: string;
  path: string;
  metadata?: PackMetadata;
  packPngPath?: string;
  fileCount?: number;
};

export type PackOperationKind =
  | "convertToNewVersion"
  | "porterSplitter"
  | "splitter";

export type RunPackOperationOptions = {
  gameVersion?: string;
  lowPort?: boolean;
  /** Splitter output folder (`Split/` is written underneath). */
  outputDir?: string;
  sheetConcurrency?: number;
};

export type RunPackOperationResult = {
  message: string;
  issues: PackInstallIssue[];
};

export type UpdateInstalledPackMetadataRequest = {
  packDir: string;
  metadata: PackMetadata;
  /** When true, apply `packPngPath` (string = copy, null/undefined = clear). */
  updatePackPng: boolean;
  packPngPath?: string | null;
};

export type PackInstallerMode = "install" | "create" | "library";

/** Shared UI bridge between the tool panel and the metadata rail. */
export type PackInstallerBridge = {
  mode: PackInstallerMode;
  selectedUnit: InstallUnit | null;
  /** Library-mode selection (kept separate from install plan units). */
  libraryPack: InstalledPack | null;
  packPngDataUrl: string | null;
  createMetadata: PackMetadata;
  createPackPngPath: string | null;
  /** Pending library PNG path override before Save (null = clear, undefined = unchanged). */
  libraryPackPngPath: string | null | undefined;
  libraryPackPngDirty: boolean;
  librarySaving: boolean;
};

export const DEFAULT_PACK_METADATA: PackMetadata = {
  textureldr: "1.5.0",
  name: "",
  id: "",
  version: "1.0.0",
  author: "",
};

export const DEFAULT_PACK_INSTALLER_BRIDGE: PackInstallerBridge = {
  mode: "install",
  selectedUnit: null,
  libraryPack: null,
  packPngDataUrl: null,
  createMetadata: DEFAULT_PACK_METADATA,
  createPackPngPath: null,
  libraryPackPngPath: undefined,
  libraryPackPngDirty: false,
  librarySaving: false,
};

export function slugifyPackIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function folderNameFromPackName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/[<>:"/\\|?*]+/g, "").trim();
}
