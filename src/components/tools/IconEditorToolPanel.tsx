import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import html2canvas from "html2canvas";
import { useTranslation } from "react-i18next";
import { AppTooltip } from "../AppTooltip";
import {
  FolderOpen,
  Save,
  Download,
  Search,
  PencilLine,
  Copy,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  RefreshCw,
  Palette,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  FileCode2,
  Layers3,
  Undo2,
  Redo2,
} from "lucide-react";
import iconEditorBackgroundManifest from "../../config/iconEditorBackgroundManifest.json";
import { getAppI18n } from "../../i18n";
import { isTauriRuntime } from "../../services/tauriOperations";
import { AppSelect, type AppSelectOption } from "../AppSelect";
import {
  extractIconEditorFrames,
  getIconEditorPngDataUrl,
  getIconEditorSheetInfo,
  type IconEditorRotateDirection,
  IconEditorExtractedFrame,
  IconEditorFrameInfo,
  IconEditorFrameTextureUpdate,
  IconEditorPoint,
  IconEditorSheetInfo,
  IconEditorSize,
  copyIconEditorSheet,
  isIconEditorRenameTargetConflict,
  renameIconEditorSheet,
  saveIconEditorPlist,
  swapRenameIconEditorSheet,
} from "../../services/tauriIconEditor";
import {
  clearIconEditorHistory,
  cloneIconEditorEditSnapshot,
  commitIconEditorHistory,
  emptyIconEditorEditSnapshot,
  iconEditorEditSnapshotsEqual,
  loadIconEditorHistory,
  redoIconEditorHistory,
  saveIconEditorHistory,
  undoIconEditorHistory,
  type IconEditorEditSnapshot,
  type IconEditorHistoryState,
  type IconEditorSerializedTextureEdit,
} from "../../services/iconEditorHistory";

type IconLayerRole = "primary" | "secondary" | "extra" | "glow" | "capsule";
type TintTarget = "primary" | "secondary" | "glow";
type RobotPartId = "01" | "02" | "03" | "04";

type BackgroundLayer = {
  id: string;
  src: string;
  zIndex: number;
  opacity?: number;
  mode?: "cover" | "tile";
  /** Used when mode is cover (CSS object-position). */
  objectPosition?: string;
  tileWidth?: number;
  tileHeight?: number;
  repeatX?: number;
  repeatY?: number;
  anchorBottom?: boolean;
};

type DragState = {
  role: IconLayerRole;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffset: IconEditorPoint;
  historyStartSnapshot: IconEditorEditSnapshot;
};

const BASE_ROLES: IconLayerRole[] = ["glow", "secondary", "primary", "extra"];
const BIRD_CAPSULE_ROLES: IconLayerRole[] = ["capsule"];
const BASE_LAYER_ROLES: IconLayerRole[] = ["glow", "secondary", "primary", "extra"];
const BIRD_LAYER_ROLES: IconLayerRole[] = ["glow", "capsule", "secondary", "primary", "extra"];
const TINT_TARGETS: TintTarget[] = ["primary", "secondary", "glow"];

const ROBOT_PART_DRAW_ORDER: RobotPartId[] = ["02", "03", "04", "01"];
const ROBOT_PART_KEYS: Record<RobotPartId, string> = {
  "01": "robotParts.head",
  "02": "robotParts.body",
  "03": "robotParts.leg",
  "04": "robotParts.foot",
};
/** Stacking between robot parts (each part’s layers live in a wrapper with this z-index). */
const ROBOT_PART_Z_BASE: Record<RobotPartId, number> = {
  "02": 300,
  "01": 200,
  "04": 150,
  /** Above echo back-foot (140); tweak with `ROBOT_ECHO_Z`. */
  "03": 145,
};
/** Robot glow wrappers sit below all part shells (min `ROBOT_PART_Z_BASE` is 100). */
const ROBOT_GLOW_BACK_Z_BASE = 5;
/** Echo (back) limb glows: above main glow, below echo solids (`ROBOT_ECHO_Z` min 125). */
const ROBOT_ECHO_GLOW_Z_BASE = 108;
/** Game duplicate of body/leg/foot: draw after glow, below head (200), same frames, view-only. */
const ROBOT_ECHO_PART_STACK: RobotPartId[] = ["03", "04", "02"];
const ROBOT_ECHO_SHIFT_X = -20;
const ROBOT_ECHO_Z: Partial<Record<RobotPartId, number>> = {
  "03": 125,
  "04": 140,
  "02": 155,
};
/**
 * View-only nudge for the echo (back) body only, in stage px (+X right, +Y down).
 * Applied after `ROBOT_ECHO_SHIFT_X` / main `ROBOT_PART_VIEW_OFFSET` for part 02.
 */
const ROBOT_ECHO_BODY_VIEW_NUDGE: { x: number; y: number } = { x: 15, y: -4 };
/**
 * View-only nudge for the echo (back) leg only, in stage px (+X right, +Y down).
 * Applied after `ROBOT_ECHO_SHIFT_X` / main `ROBOT_PART_VIEW_OFFSET` for part 03.
 */
const ROBOT_ECHO_LEG_VIEW_NUDGE: { x: number; y: number } = { x: 9, y: 0 };
/** View-only pixel nudge per part (applied at primary anchor before plist offsets). */
const ROBOT_PART_VIEW_OFFSET: Record<RobotPartId, { x: number; y: number }> = {
  "01": { x: -9, y: -64 },
  "02": { x: -31, y: -34 },
  "03": { x: -25, y: -15 },
  "04": { x: 0, y: 0 },
};

/** Draw order: back (04) under body (01); legs (03, 02) above. */
const SPIDER_PART_DRAW_ORDER: RobotPartId[] = ["04", "01", "03", "02"];
const SPIDER_PART_KEYS: Record<RobotPartId, string> = {
  "01": "spiderParts.body",
  "02": "spiderParts.frontLegs",
  "03": "spiderParts.backLegs",
  "04": "spiderParts.back",
};
const SPIDER_PART_Z_BASE: Record<RobotPartId, number> = {
  "04": 100,
  "01": 200,
  "03": 280,
  "02": 300,
};
const SPIDER_GLOW_BACK_Z_BASE = 5;
/** Editor-only nudges per part (stage px); tune to match in-game layout. */
const SPIDER_PART_VIEW_OFFSET: Record<RobotPartId, { x: number; y: number }> = {
  "01": { x: 0, y: -18 },
  "02": { x: -12, y: 21 },
  "03": { x: -53, y: 23 },
  "04": { x: -18, y: 0 },
};

/** View-only duplicate front legs (part 02): behind body; same frames as main 02, dimmed like robot echo. */
const SPIDER_FRONT_LEG_ECHO_SHIFT_X = 0;
const SPIDER_FRONT_LEG_ECHO_NUDGE_FLIP: { x: number; y: number } = { x: 65, y: 0 };
const SPIDER_FRONT_LEG_ECHO_NUDGE_COPY: { x: number; y: number } = { x: 31, y: 0 };
const SPIDER_FRONT_LEG_ECHO_GLOW_Z_BASE = 108;
const SPIDER_FRONT_LEG_ECHO_SOLID_Z_FLIPPED = 118;
const SPIDER_FRONT_LEG_ECHO_SOLID_Z_COPY = 122;

type SpiderFrontLegEchoVariant = "flipH" | "copy";

function computeSpiderFrontLegEchoWrapAnchor(
  variant: SpiderFrontLegEchoVariant,
  primaryOffset: IconEditorPoint,
  stageOriginY: number,
): { baseX: number; baseY: number } {
  const viewNudge = SPIDER_PART_VIEW_OFFSET["02"];
  const extra = variant === "flipH" ? SPIDER_FRONT_LEG_ECHO_NUDGE_FLIP : SPIDER_FRONT_LEG_ECHO_NUDGE_COPY;
  return {
    baseX:
      STAGE_ORIGIN_X +
      primaryOffset.x * OFFSET_SCALE +
      viewNudge.x +
      SPIDER_FRONT_LEG_ECHO_SHIFT_X +
      extra.x,
    baseY: stageOriginY - primaryOffset.y * OFFSET_SCALE + viewNudge.y + extra.y,
  };
}

function computeRobotEchoWrapAnchor(
  partId: RobotPartId,
  primaryOffset: IconEditorPoint,
  stageOriginY: number,
): { baseX: number; baseY: number } {
  const viewNudge = ROBOT_PART_VIEW_OFFSET[partId];
  const extra =
    partId === "02"
      ? ROBOT_ECHO_BODY_VIEW_NUDGE
      : partId === "03"
        ? ROBOT_ECHO_LEG_VIEW_NUDGE
        : { x: 0, y: 0 };
  return {
    baseX:
      STAGE_ORIGIN_X +
      primaryOffset.x * OFFSET_SCALE +
      viewNudge.x +
      ROBOT_ECHO_SHIFT_X +
      extra.x,
    baseY: stageOriginY - primaryOffset.y * OFFSET_SCALE + viewNudge.y + extra.y,
  };
}
const STAGE_BASE_WIDTH = 980;
const STAGE_BASE_HEIGHT = 620;
/** Anchor center shared by all layers (CSS positions this point; layer uses translate(-50%,-50%)). */
const STAGE_ORIGIN_X = STAGE_BASE_WIDTH / 2;
/** When no sheet is loaded yet, approximate vertical anchor. */
const FALLBACK_STAGE_ORIGIN_Y = STAGE_BASE_HEIGHT / 2 + 120;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const OFFSET_STEP = 0.5;
const OFFSET_BUMP_COARSE = 1;
/** Plist `spriteOffset` units map 1:1 to stage pixels (do not double-apply). */
const OFFSET_SCALE = 1;
/** Nearest-neighbor display scale for stage (icons + backdrop); multiplied by zoom on the stage transform. */
const VIEW_PIXEL_SCALE = 2;
const ICON_VISUAL_SCALE = 1;
/** Only this fraction of the floor strip is visible (anchored to bottom). */
const FLOOR_VISIBLE_FRACTION = 0.25;

/** Deduped (first occurrence) from design reference; default tints are white via state, not index 0. */
const ICON_EDITOR_PALETTE = [
  "#7DFF00",
  "#00FF00",
  "#00FF7D",
  "#00FFFF",
  "#00C8FF",
  "#007DFF",
  "#0000FF",
  "#7D00FF",
  "#B900FF",
  "#FF00FF",
  "#FF007D",
  "#FF0000",
  "#FF4B00",
  "#FF7D00",
  "#FFB900",
  "#FFFF00",
  "#FFFFFF",
  "#AFAFAF",
  "#5A5A5A",
  "#000000",
  "#7D7D00",
  "#649600",
  "#4BAF00",
  "#009600",
  "#00AF4B",
  "#009664",
  "#007D7D",
  "#006496",
  "#004BAF",
  "#000096",
  "#640096",
  "#7D007D",
  "#960064",
  "#AF004B",
  "#960000",
  "#963200",
  "#AF4B00",
  "#966400",
  "#FF7D7D",
  "#7DFFAF",
  "#7D7DFF",
];

const manifestLayers = iconEditorBackgroundManifest as BackgroundLayer[];

function getGameFloorTileSpec(): { tileHeight: number; repeatY: number } | null {
  const floor = manifestLayers.find((layer) => layer.id === "gameFloor" && layer.mode === "tile");
  if (!floor) {
    return null;
  }
  return {
    tileHeight: Math.max(1, floor.tileHeight ?? 256),
    repeatY: Math.max(1, floor.repeatY ?? 1),
  };
}

/** Top edge of the visible floor row (must match `baseY` for `gameFloor` in render). */
function computeFloorTopY(): number {
  const spec = getGameFloorTileSpec();
  if (!spec) {
    return STAGE_BASE_HEIGHT * 0.72;
  }
  return STAGE_BASE_HEIGHT - spec.repeatY * spec.tileHeight * FLOOR_VISIBLE_FRACTION;
}

const quantizeOffset = (value: number): number => Math.round(value / OFFSET_STEP) * OFFSET_STEP;

/** Manual zoom controls snap to 10% steps (0.1). */
const snapZoomToTenth = (value: number): number => Math.round(value * 10) / 10;
const clampZoom = (value: number): number =>
  snapZoomToTenth(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)));

/** Scrollport height mapped to 100% auto zoom (typical 1080p-class layout). */
const ZOOM_AUTO_VIEWPORT_HEIGHT_BASE = 1000;
/** Scrollport height mapped to 200% auto zoom — lower values ramp zoom sooner on large windows. */
const ZOOM_AUTO_VIEWPORT_HEIGHT_FULL = 1600;
const ZOOM_AUTO_ZOOM_MIN = 1;
const ZOOM_AUTO_ZOOM_MAX = 2;

/** Linear auto zoom from scrollport height; continuous (not snapped to 10% steps). */
function computeAutoResolutionZoom(cssViewportHeight: number): number {
  const height = Math.max(1, cssViewportHeight);
  const span = Math.max(1, ZOOM_AUTO_VIEWPORT_HEIGHT_FULL - ZOOM_AUTO_VIEWPORT_HEIGHT_BASE);
  const linear = ZOOM_AUTO_ZOOM_MIN + (height - ZOOM_AUTO_VIEWPORT_HEIGHT_BASE) / span;
  return Math.min(ZOOM_AUTO_ZOOM_MAX, Math.max(ZOOM_AUTO_ZOOM_MIN, linear));
}

/** Alpha trim insets from full image edges (matches `merger::trim_transparent_edges` semantics). */
type TrimInsets = { left: number; top: number; right: number; bottom: number };

type IconEditorErrorInfo = { message: string; detail: string };

function toIconEditorErrorInfo(error: unknown, fallback: string): IconEditorErrorInfo {
  if (error instanceof Error) {
    const detailParts = [error.message];
    if (error.stack && error.stack.trim() !== "") {
      detailParts.push(error.stack);
    }
    const errorWithCause = error as Error & { cause?: unknown };
    const causeText =
      typeof errorWithCause.cause === "string"
        ? errorWithCause.cause
        : errorWithCause.cause !== undefined
          ? JSON.stringify(errorWithCause.cause, null, 2)
          : "";
    if (causeText) {
      detailParts.push(`Cause: ${causeText}`);
    }
    return {
      message: error.message || fallback,
      detail: detailParts.join("\n\n"),
    };
  }
  if (typeof error === "string" && error.trim() !== "") {
    return { message: error, detail: error };
  }
  if (error && typeof error === "object") {
    try {
      const serialized = JSON.stringify(error, null, 2);
      if (serialized && serialized !== "{}") {
        return { message: fallback, detail: serialized };
      }
    } catch {
      // Keep fallback detail when serialization fails.
    }
  }
  return { message: fallback, detail: fallback };
}

function trimTransparentEdgesFromCanvas(canvas: HTMLCanvasElement): TrimInsets {
  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha === 0) {
        continue;
      }
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!found) {
    return {
      left: 0,
      top: 0,
      right: Math.max(0, width - 1),
      bottom: Math.max(0, height - 1),
    };
  }
  return {
    left: minX,
    top: minY,
    right: width - (maxX + 1),
    bottom: height - (maxY + 1),
  };
}

/** Crop to alpha bounds using insets from `trimTransparentEdgesFromCanvas` (matches merger trim). */
function cropCanvasByTrimInsets(source: HTMLCanvasElement, trim: TrimInsets): HTMLCanvasElement {
  const w = source.width - trim.left - trim.right;
  const h = source.height - trim.top - trim.bottom;
  if (w < 1 || h < 1) {
    return source;
  }
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const context = out.getContext("2d");
  if (!context) {
    return source;
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(source, trim.left, trim.top, w, h, 0, 0, w, h);
  return out;
}

function cropCanvasByRect(
  source: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
): HTMLCanvasElement {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const maxWidth = Math.max(1, source.width - x);
  const maxHeight = Math.max(1, source.height - y);
  const w = Math.max(1, Math.min(maxWidth, Math.ceil(rect.width)));
  const h = Math.max(1, Math.min(maxHeight, Math.ceil(rect.height)));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const context = out.getContext("2d");
  if (!context) {
    return source;
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(source, x, y, w, h, 0, 0, w, h);
  return out;
}

/** Same merge-time adjustment as `merger::merge_plist_from_memory` / `merge_single_plist`. */
function mergeAdjustedSpriteOffset(original: IconEditorPoint, trim: TrimInsets): IconEditorPoint {
  return {
    x: original.x + trim.left / 2 - trim.right / 2,
    y: original.y - trim.top / 2 + trim.bottom / 2,
  };
}

function formatPairF32(point: IconEditorPoint): string {
  return `{${point.x.toFixed(3)},${point.y.toFixed(3)}}`;
}

function formatIntPair(width: number, height: number): string {
  return `{${Math.round(width)},${Math.round(height)}}`;
}

function formatTextureRect(rect: { x: number; y: number; width: number; height: number }): string {
  return `{{${Math.round(rect.x)},${Math.round(rect.y)}},{${Math.round(rect.width)},${Math.round(rect.height)}}}`;
}

const makeDefaultRoleMap = (): Record<IconLayerRole, string> => ({
  primary: "",
  secondary: "",
  extra: "",
  glow: "",
  capsule: "",
});

const stripPngExtension = (name: string): string => name.replace(/\.png$/i, "").trim();

const ensurePngExtension = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) {
    return trimmed;
  }
  return /\.png$/i.test(trimmed) ? trimmed : `${trimmed}.png`;
};

/**
 * Plist frame naming: `{type}_{number}_001`, `{type}_{number}_2_001`, `{type}_{number}_glow_001`,
 * `{type}_{number}_extra_001` (optional `.png`). Returns `{type}_{number}` stem or null if unknown.
 * Secondary uses `_<digits>_2_001` so `icon_2_001` stays primary (number 2), not secondary.
 */
function parseIconFrameStem(name: string): string | null {
  const base = stripPngExtension(name);
  const capsule = base.match(/^(.+)_(\d+)_3_001$/i);
  if (capsule) {
    return `${capsule[1]}_${capsule[2]}`;
  }
  const secondary = base.match(/^(.+)_(\d+)_2_001$/i);
  if (secondary) {
    return `${secondary[1]}_${secondary[2]}`;
  }
  const lower = base.toLowerCase();
  /** `_extra_001` before `_glow_001` so names are classified by their true suffix only. */
  if (lower.endsWith("_extra_001")) {
    return base.slice(0, -"_extra_001".length);
  }
  if (lower.endsWith("_glow_001")) {
    return base.slice(0, -"_glow_001".length);
  }
  const primary = base.match(/^(.+)_(\d+)_001$/i);
  if (primary) {
    return `${primary[1]}_${primary[2]}`;
  }
  return null;
}

function buildIconFrameNameForRole(stem: string, role: IconLayerRole): string {
  switch (role) {
    case "primary":
      return ensurePngExtension(`${stem}_001`);
    case "secondary":
      return ensurePngExtension(`${stem}_2_001`);
    case "glow":
      return ensurePngExtension(`${stem}_glow_001`);
    case "extra":
      return ensurePngExtension(`${stem}_extra_001`);
    case "capsule":
      return ensurePngExtension(`${stem}_3_001`);
  }
}

function inferStemFromFrames(frames: IconEditorFrameInfo[]): string | null {
  const primaryLike = frames.find((frame) => {
    const base = stripPngExtension(frame.name);
    return (
      /^.+_\d+_001$/i.test(base) &&
      !/^.+_\d+_2_001$/i.test(base) &&
      !/_glow_001$/i.test(base) &&
      !/_extra_001$/i.test(base)
    );
  });
  if (primaryLike) {
    const stem = parseIconFrameStem(primaryLike.name);
    if (stem) {
      return stem;
    }
  }
  for (const frame of frames) {
    const stem = parseIconFrameStem(frame.name);
    if (stem) {
      return stem;
    }
  }
  return null;
}

function resolveFrameNameFromPlist(frames: IconEditorFrameInfo[], canonical: string): string | null {
  const lower = stripPngExtension(canonical).toLowerCase();
  const found = frames.find(
    (frame) => stripPngExtension(frame.name).toLowerCase() === lower,
  );
  return found?.name ?? null;
}

const resolveImageUrl = (path: string, version: number): string => {
  if (!path.trim()) {
    return "";
  }
  if (!isTauriRuntime() || path.startsWith("/")) {
    return path;
  }
  return `${convertFileSrc(path)}?v=${version}`;
};

const parseRoleFromFrameName = (name: string): IconLayerRole => {
  const base = stripPngExtension(name);
  /** Bird / UFO capsule slot: `{type}_{n}_3_001` (distinct from secondary `_2_001`). */
  if (/^.+_\d+_3_001$/i.test(base)) {
    return "capsule";
  }
  if (/^.+_\d+_2_001$/i.test(base)) {
    return "secondary";
  }
  const lower = base.toLowerCase();
  if (lower.endsWith("_extra_001")) {
    return "extra";
  }
  if (lower.endsWith("_glow_001")) {
    return "glow";
  }
  return "primary";
};

function parseRobotPartFrame(name: string): { robotStem: string; partId: RobotPartId; role: IconLayerRole } | null {
  const base = stripPngExtension(name).toLowerCase();
  const match = base.match(/^(robot_\d+)_(0[1-4])(?:_(2|glow|extra))?_001$/i);
  if (!match) {
    return null;
  }
  const roleSuffix = match[3]?.toLowerCase();
  const role: IconLayerRole =
    roleSuffix === "2"
      ? "secondary"
      : roleSuffix === "glow"
        ? "glow"
        : roleSuffix === "extra"
          ? "extra"
          : "primary";
  return {
    robotStem: match[1],
    partId: match[2] as RobotPartId,
    role,
  };
}

function parseSpiderPartFrame(name: string): { spiderStem: string; partId: RobotPartId; role: IconLayerRole } | null {
  const base = stripPngExtension(name).toLowerCase();
  const match = base.match(/^(spider_\d+)_(0[1-4])(?:_(2|glow|extra))?_001$/i);
  if (!match) {
    return null;
  }
  const roleSuffix = match[3]?.toLowerCase();
  const role: IconLayerRole =
    roleSuffix === "2"
      ? "secondary"
      : roleSuffix === "glow"
        ? "glow"
        : roleSuffix === "extra"
          ? "extra"
          : "primary";
  return {
    spiderStem: match[1],
    partId: match[2] as RobotPartId,
    role,
  };
}

const buildCanvasFromDataUrl = async (pngDataUrl: string): Promise<HTMLCanvasElement> => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () =>
      reject(
        new Error(
          getAppI18n().t("errors:iconEditor.decodeFrameFailed"),
        ),
      );
    next.src = pngDataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.width);
  canvas.height = Math.max(1, image.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(getAppI18n().t("errors:iconEditor.allocateCanvasFailed"));
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  return canvas;
};

const buildCanvasFromImagePath = async (imagePath: string): Promise<HTMLCanvasElement> => {
  const pngDataUrl = isTauriRuntime()
    ? await getIconEditorPngDataUrl(imagePath)
    : imagePath;
  return buildCanvasFromDataUrl(pngDataUrl);
};

const canvasToPngDataUrl = (canvas: HTMLCanvasElement): string => canvas.toDataURL("image/png");

const swapIconEditorSize = (size: IconEditorSize): IconEditorSize => ({
  width: size.height,
  height: size.width,
});

const rotateSpriteOffset = (
  offset: IconEditorPoint,
  direction: IconEditorRotateDirection,
): IconEditorPoint => {
  if (direction === "clockwise") {
    return { x: offset.y, y: -offset.x };
  }
  return { x: -offset.y, y: offset.x };
};

const rotateCanvas90 = (
  canvas: HTMLCanvasElement,
  direction: IconEditorRotateDirection,
): HTMLCanvasElement => {
  const out = document.createElement("canvas");
  out.width = canvas.height;
  out.height = canvas.width;
  const context = out.getContext("2d");
  if (!context) {
    return canvas;
  }
  context.imageSmoothingEnabled = false;
  if (direction === "clockwise") {
    context.translate(out.width, 0);
    context.rotate(Math.PI / 2);
  } else {
    context.translate(0, out.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(canvas, 0, 0);
  return out;
};

type PendingFrameTextureEdit = {
  sourceCanvas: HTMLCanvasElement;
  spriteSize: IconEditorSize;
  spriteSourceSize: IconEditorSize;
  spriteOffset: IconEditorPoint;
  textureRotated: boolean;
  isNewFrame: boolean;
};

const serializeTextureEdits = (
  edits: Record<string, PendingFrameTextureEdit>,
): Record<string, IconEditorSerializedTextureEdit> =>
  Object.fromEntries(
    Object.entries(edits).map(([name, edit]) => [
      name,
      {
        pngDataUrl: canvasToPngDataUrl(edit.sourceCanvas),
        spriteSize: { ...edit.spriteSize },
        spriteSourceSize: { ...edit.spriteSourceSize },
        spriteOffset: { ...edit.spriteOffset },
        textureRotated: edit.textureRotated,
        isNewFrame: edit.isNewFrame,
      },
    ]),
  );

const deserializeTextureEdits = async (
  edits: Record<string, IconEditorSerializedTextureEdit>,
): Promise<Record<string, PendingFrameTextureEdit>> => {
  const entries = await Promise.all(
    Object.entries(edits).map(async ([name, edit]) => {
      const sourceCanvas = await buildCanvasFromDataUrl(edit.pngDataUrl);
      return [
        name,
        {
          sourceCanvas,
          spriteSize: { ...edit.spriteSize },
          spriteSourceSize: { ...edit.spriteSourceSize },
          spriteOffset: { ...edit.spriteOffset },
          textureRotated: edit.textureRotated,
          isNewFrame: edit.isNewFrame,
        },
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
};

const buildFrameTextureUpdates = (
  pendingTextureEdits: Record<string, PendingFrameTextureEdit>,
): IconEditorFrameTextureUpdate[] =>
  Object.entries(pendingTextureEdits).map(([name, edit]) => ({
    name,
    pngDataUrl: canvasToPngDataUrl(edit.sourceCanvas),
    spriteSize: edit.spriteSize,
    spriteSourceSize: edit.spriteSourceSize,
    spriteOffset: edit.spriteOffset,
    textureRotated: edit.textureRotated,
    isNewFrame: edit.isNewFrame,
  }));

type SplitCanvasBuildResult = {
  canvases: Record<string, HTMLCanvasElement>;
  fullCanvases: Record<string, HTMLCanvasElement>;
  /** Alpha trim on the raw extracted image (before crop); used for merge-style offset math. */
  trimByFrameName: Record<string, TrimInsets>;
};

const buildSplitCanvasMap = async (frames: IconEditorExtractedFrame[]): Promise<SplitCanvasBuildResult> => {
  const canvases: Record<string, HTMLCanvasElement> = {};
  const fullCanvases: Record<string, HTMLCanvasElement> = {};
  const trimByFrameName: Record<string, TrimInsets> = {};
  for (const frame of frames) {
    const full = await buildCanvasFromDataUrl(frame.pngDataUrl);
    fullCanvases[frame.name] = full;
    const trim = trimTransparentEdgesFromCanvas(full);
    trimByFrameName[frame.name] = trim;
    canvases[frame.name] = cropCanvasByTrimInsets(full, trim);
  }
  return { canvases, fullCanvases, trimByFrameName };
};

const suggestRoleMap = (frames: IconEditorFrameInfo[]): Record<IconLayerRole, string> => {
  const suggested = makeDefaultRoleMap();
  const stem = inferStemFromFrames(frames);
  if (stem) {
    for (const role of [...BASE_ROLES, ...BIRD_CAPSULE_ROLES]) {
      const canonical = buildIconFrameNameForRole(stem, role);
      const actual = resolveFrameNameFromPlist(frames, canonical);
      if (actual) {
        suggested[role] = actual;
      }
    }
  }
  for (const frame of frames) {
    const role = parseRoleFromFrameName(frame.name);
    if (!suggested[role]) {
      suggested[role] = frame.name;
    }
  }
  if (!suggested.primary && frames.length > 0) {
    suggested.primary = frames[0].name;
  }
  if (!suggested.secondary && frames.length > 0) {
    const skip = new Set(
      [suggested.primary, suggested.glow, suggested.extra].filter((name): name is string => Boolean(name)),
    );
    const next = frames.find((frame) => !skip.has(frame.name));
    if (next) {
      suggested.secondary = next.name;
    }
  }

  const suffixGlowFrame = frames.find((frame) =>
    stripPngExtension(frame.name).toLowerCase().endsWith("_glow_001"),
  );
  const suffixExtraFrame = frames.find((frame) =>
    stripPngExtension(frame.name).toLowerCase().endsWith("_extra_001"),
  );
  const suffixCapsuleFrame = frames.find((frame) => /^.+_\d+_3_001$/i.test(stripPngExtension(frame.name)));
  if (suffixGlowFrame) {
    suggested.glow = suffixGlowFrame.name;
  }
  if (suffixExtraFrame) {
    suggested.extra = suffixExtraFrame.name;
  } else if (suggested.extra && suggested.glow && suggested.extra === suggested.glow) {
    suggested.extra = "";
  }
  if (suffixCapsuleFrame) {
    suggested.capsule = suffixCapsuleFrame.name;
  }
  return suggested;
};

type Rgb = { r: number; g: number; b: number };

function parseTintCssToRgb(tint: string): Rgb | null {
  const trimmed = tint.trim();
  const hex6 = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (hex6) {
    const v = hex6[1];
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16),
    };
  }
  const hex3 = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (hex3) {
    const [a, b, c] = hex3[1].split("").map((ch) => parseInt(ch + ch, 16));
    return { r: a, g: b, b: c };
  }
  const scratch = document.createElement("canvas");
  scratch.width = 1;
  scratch.height = 1;
  const sctx = scratch.getContext("2d");
  if (!sctx) {
    return null;
  }
  sctx.fillStyle = "#000000";
  sctx.fillStyle = trimmed;
  const resolved = sctx.fillStyle;
  if (typeof resolved !== "string") {
    return null;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(resolved);
  if (!rgb) {
    return null;
  }
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
}

/** Per-pixel multiply; skips rgb (0,0,0) so transparent / opaque black edges are not tinted. */
function multiplyTintSkipPureBlack(imageData: ImageData, tintRgb: Rgb): void {
  const { data } = imageData;
  const { r: tr, g: tg, b: tb } = tintRgb;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r === 0 && g === 0 && b === 0) {
      continue;
    }
    data[i] = Math.round((r * tr) / 255);
    data[i + 1] = Math.round((g * tg) / 255);
    data[i + 2] = Math.round((b * tb) / 255);
  }
}

type LayerCanvasProps = {
  sourceCanvas: HTMLCanvasElement | null;
  tint: string | null;
};

function LayerCanvas({ sourceCanvas, tint }: LayerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!sourceCanvas) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const width = Math.max(1, sourceCanvas.width);
    const height = Math.max(1, sourceCanvas.height);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;

    context.drawImage(sourceCanvas, 0, 0, width, height);

    if (tint) {
      const tintRgb = parseTintCssToRgb(tint);
      if (tintRgb) {
        const imageData = context.getImageData(0, 0, width, height);
        multiplyTintSkipPureBlack(imageData, tintRgb);
        context.putImageData(imageData, 0, 0);
      } else {
        context.save();
        context.globalCompositeOperation = "multiply";
        context.fillStyle = tint;
        context.fillRect(0, 0, width, height);
        context.globalCompositeOperation = "destination-in";
        context.drawImage(sourceCanvas, 0, 0, width, height);
        context.restore();
      }
    }
  }, [sourceCanvas, tint]);

  return <canvas ref={canvasRef} className="tm-icon-editor-layer-canvas" />;
}

type IconEditorToolbarTipProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

function IconEditorToolbarTip({ label, children, className }: IconEditorToolbarTipProps) {
  return (
    <AppTooltip
      label={label}
      className={`tm-icon-editor-toolbar-tip${className ? ` ${className}` : ""}`}
      placement="bottom"
    >
      {children}
    </AppTooltip>
  );
}

type SpriteOffsetAxisControlsProps = {
  axis: "x" | "y";
  value: number;
  frameName: string;
  onBump: (frameName: string, axis: "x" | "y", sign: number, step?: number) => void;
  onSetAxis: (frameName: string, axis: "x" | "y", value: number) => void;
};

function SpriteOffsetAxisControls({
  axis,
  value,
  frameName,
  onBump,
  onSetAxis,
}: SpriteOffsetAxisControlsProps) {
  const { t } = useTranslation("iconEditor");
  const isX = axis === "x";
  const DecreaseIcon = isX ? ChevronLeft : ChevronDown;
  const IncreaseIcon = isX ? ChevronRight : ChevronUp;
  const axisLabel = axis.toUpperCase();
  const [draft, setDraft] = useState(() => value.toFixed(1));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value.toFixed(1));
    }
  }, [isEditing, value]);

  useEffect(() => {
    setIsEditing(false);
    setDraft(value.toFixed(1));
  }, [frameName, value]);

  const commitDraft = () => {
    setIsEditing(false);
    const parsed = Number.parseFloat(draft.trim());
    if (!Number.isFinite(parsed)) {
      setDraft(value.toFixed(1));
      return;
    }
    const quantized = quantizeOffset(parsed);
    setDraft(quantized.toFixed(1));
    if (quantized !== value) {
      onSetAxis(frameName, axis, quantized);
    }
  };

  return (
    <div className={`tm-icon-editor-plist-offset-card tm-icon-editor-plist-offset-card-${axis}`}>
      <span className={`tm-icon-editor-plist-offset-axis tm-icon-editor-plist-offset-axis-${axis}`}>
        {axisLabel}
      </span>
      <div className={`tm-icon-editor-plist-offset-controls tm-icon-editor-plist-offset-controls-${axis}`}>
        <div className="tm-icon-editor-plist-offset-step-group">
          <button
            type="button"
            className="tm-icon-editor-plist-offset-btn tm-icon-editor-plist-offset-btn-coarse"
            aria-label={t("plist.decreaseOffsetByOne", { axis: axisLabel })}
            title="−1"
            onClick={() => onBump(frameName, axis, -1, OFFSET_BUMP_COARSE)}
          >
            <DecreaseIcon size={15} strokeWidth={2.25} aria-hidden />
            <span className="tm-icon-editor-plist-offset-btn-step">1</span>
          </button>
          <button
            type="button"
            className="tm-icon-editor-plist-offset-btn tm-icon-editor-plist-offset-btn-fine"
            aria-label={t("plist.decreaseOffsetByHalf", { axis: axisLabel })}
            title="−0.5"
            onClick={() => onBump(frameName, axis, -1)}
          >
            <DecreaseIcon size={12} strokeWidth={2} aria-hidden />
            <span className="tm-icon-editor-plist-offset-btn-step">½</span>
          </button>
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="tm-icon-editor-plist-offset-value"
          aria-label={t("plist.offsetAxis", { axis: axisLabel })}
          value={draft}
          onFocus={() => setIsEditing(true)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
              return;
            }
            if (event.key === "Escape") {
              setDraft(value.toFixed(1));
              setIsEditing(false);
              event.currentTarget.blur();
            }
          }}
        />
        <div className="tm-icon-editor-plist-offset-step-group">
          <button
            type="button"
            className="tm-icon-editor-plist-offset-btn tm-icon-editor-plist-offset-btn-fine"
            aria-label={t("plist.increaseOffsetByHalf", { axis: axisLabel })}
            title="+0.5"
            onClick={() => onBump(frameName, axis, 1)}
          >
            <IncreaseIcon size={12} strokeWidth={2} aria-hidden />
            <span className="tm-icon-editor-plist-offset-btn-step">½</span>
          </button>
          <button
            type="button"
            className="tm-icon-editor-plist-offset-btn tm-icon-editor-plist-offset-btn-coarse"
            aria-label={t("plist.increaseOffsetByOne", { axis: axisLabel })}
            title="+1"
            onClick={() => onBump(frameName, axis, 1, OFFSET_BUMP_COARSE)}
          >
            <IncreaseIcon size={15} strokeWidth={2.25} aria-hidden />
            <span className="tm-icon-editor-plist-offset-btn-step">1</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function IconEditorToolPanel() {
  const { t } = useTranslation("iconEditor");
  const [sheetInfo, setSheetInfo] = useState<IconEditorSheetInfo | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [atlasVersion, setAtlasVersion] = useState(0);
  const [splitFrameCanvases, setSplitFrameCanvases] = useState<
    Record<string, HTMLCanvasElement>
  >({});
  const [fullFrameCanvases, setFullFrameCanvases] = useState<Record<string, HTMLCanvasElement>>({});
  const [pendingTextureEdits, setPendingTextureEdits] = useState<
    Record<string, PendingFrameTextureEdit>
  >({});
  const pendingTextureEditsRef = useRef(pendingTextureEdits);
  pendingTextureEditsRef.current = pendingTextureEdits;
  const [trimByFrameName, setTrimByFrameName] = useState<Record<string, TrimInsets>>({});
  const [viewportCssHeight, setViewportCssHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : ZOOM_AUTO_VIEWPORT_HEIGHT_BASE,
  );
  const autoResolutionZoom = useMemo(
    () => computeAutoResolutionZoom(viewportCssHeight),
    [viewportCssHeight],
  );
  const [zoom, setZoom] = useState(() =>
    typeof window !== "undefined"
      ? computeAutoResolutionZoom(window.innerHeight)
      : snapZoomToTenth(1),
  );
  const [renameValue, setRenameValue] = useState("");
  const [roleMap, setRoleMap] = useState<Record<IconLayerRole, string>>(() => makeDefaultRoleMap());
  /** `roleMap.extra` after last successful load/save; used for Save / Unsaved when extra mapping changes only. */
  const [extraMappingBaseline, setExtraMappingBaseline] = useState("");
  const [offsetEdits, setOffsetEdits] = useState<Record<string, IconEditorPoint>>({});
  const [editHistory, setEditHistory] = useState<IconEditorHistoryState>(() => ({
    past: [],
    present: emptyIconEditorEditSnapshot(),
    future: [],
  }));
  const offsetEditsRef = useRef(offsetEdits);
  offsetEditsRef.current = offsetEdits;
  const roleMapExtraRef = useRef(roleMap.extra);
  roleMapExtraRef.current = roleMap.extra;
  const editHistoryRef = useRef(editHistory);
  editHistoryRef.current = editHistory;
  const activePlistPathRef = useRef<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [activeTintTarget, setActiveTintTarget] = useState<TintTarget>("primary");
  const [tintByTarget, setTintByTarget] = useState<Record<TintTarget, string>>(() => ({
    primary: "#FFFFFF",
    secondary: "#FFFFFF",
    glow: "#FFFFFF",
  }));
  const [hideGlow, setHideGlow] = useState(false);
  const [hideLayerBorders, setHideLayerBorders] = useState(false);
  const [inspectorRole, setInspectorRole] = useState<IconLayerRole>("primary");
  const [inspectorFrameOverride, setInspectorFrameOverride] = useState<string | null>(null);
  const [selectedRobotPartId, setSelectedRobotPartId] = useState<RobotPartId>("01");
  const [selectedSpiderPartId, setSelectedSpiderPartId] = useState<RobotPartId>("01");
  const [toolbarError, setToolbarError] = useState<string | null>(null);
  const [toolbarErrorDetail, setToolbarErrorDetail] = useState<string | null>(null);
  const [isErrorDetailOpen, setIsErrorDetailOpen] = useState(false);
  const [renameConflict, setRenameConflict] = useState<{ targetStem: string } | null>(null);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);
  const [framesPanelCollapsed, setFramesPanelCollapsed] = useState(false);
  const [plistPanelCollapsed, setPlistPanelCollapsed] = useState(false);
  const [scrollportSize, setScrollportSize] = useState({ w: STAGE_BASE_WIDTH, h: 660 });
  /** Bumped after each successful sheet load so the scrollport can re-center on the icon anchor. */
  const [viewportFocusGeneration, setViewportFocusGeneration] = useState(0);
  const lastObservedScrollportHeightRef = useRef(0);
  const stageScrollPortRef = useRef<HTMLDivElement | null>(null);
  const focusStageAnchorRafRef = useRef<number | null>(null);
  const stageElementRef = useRef<HTMLDivElement | null>(null);
  const scrollPanRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);

  const frameMap = useMemo(() => {
    const map = new Map<string, IconEditorFrameInfo>();
    for (const frame of sheetInfo?.frames ?? []) {
      map.set(frame.name, frame);
    }
    for (const [name, edit] of Object.entries(pendingTextureEdits)) {
      const existing = map.get(name);
      map.set(name, {
        name,
        textureRect: existing?.textureRect ?? {
          x: 0,
          y: 0,
          width: edit.spriteSize.width,
          height: edit.spriteSize.height,
        },
        spriteSize: edit.spriteSize,
        spriteSourceSize: edit.spriteSourceSize,
        spriteOffset: edit.spriteOffset,
        textureRotated: edit.textureRotated,
      });
    }
    return map;
  }, [pendingTextureEdits, sheetInfo]);

  const effectiveTrimByFrameName = useMemo(() => {
    const out = { ...trimByFrameName };
    for (const [name, edit] of Object.entries(pendingTextureEdits)) {
      out[name] = trimTransparentEdgesFromCanvas(edit.sourceCanvas);
    }
    return out;
  }, [pendingTextureEdits, trimByFrameName]);

  const displayFrameCanvases = useMemo(() => {
    const out = { ...splitFrameCanvases };
    for (const [name, edit] of Object.entries(pendingTextureEdits)) {
      const trim = trimTransparentEdgesFromCanvas(edit.sourceCanvas);
      out[name] = cropCanvasByTrimInsets(edit.sourceCanvas, trim);
    }
    return out;
  }, [pendingTextureEdits, splitFrameCanvases]);

  /** Vertical anchor from floor + primary plist geometry (base offset only; ignores unsaved drag edits). */
  const stageOriginY = useMemo(() => {
    const floorTop = computeFloorTopY();
    if (!sheetInfo) {
      return FALLBACK_STAGE_ORIGIN_Y;
    }
    const isRobotSheet = sheetInfo.frames.some((entry) => Boolean(parseRobotPartFrame(entry.name)));
    const isSpiderSheet = sheetInfo.frames.some((entry) => Boolean(parseSpiderPartFrame(entry.name)));
    if (!isRobotSheet && !isSpiderSheet) {
      const snapCandidates = [roleMap.primary, roleMap.secondary, roleMap.extra]
        .map((frameName) => frameName.trim())
        .filter((frameName) => frameName.length > 0)
        .map((frameName) => {
          const frame = frameMap.get(frameName);
          if (!frame) {
            return null;
          }
          const trim = effectiveTrimByFrameName[frameName] ?? { left: 0, top: 0, right: 0, bottom: 0 };
          const effectiveOffset = mergeAdjustedSpriteOffset(frame.spriteOffset, trim);
          const displayCanvas = displayFrameCanvases[frameName];
          const displayHeight = displayCanvas
            ? Math.max(1, displayCanvas.height)
            : Math.max(1, frame.spriteSize.height) * ICON_VISUAL_SCALE;
          // Origin needed for this layer's visual bottom to sit on the floor line.
          return floorTop + effectiveOffset.y * OFFSET_SCALE - displayHeight / 2;
        })
        .filter((value): value is number => value !== null);
      if (snapCandidates.length === 0) {
        return FALLBACK_STAGE_ORIGIN_Y;
      }
      // Use the lowest visual layer (secondary/extra can extend below primary) for floor snapping.
      return Math.min(...snapCandidates);
    }
    const robotPrimaryFootName = (() => {
      const robotFrames = sheetInfo.frames
        .map((frame) => ({ frame, parsed: parseRobotPartFrame(frame.name) }))
        .filter((entry): entry is { frame: IconEditorFrameInfo; parsed: NonNullable<ReturnType<typeof parseRobotPartFrame>> } =>
          Boolean(entry.parsed),
        );
      if (robotFrames.length === 0) {
        return "";
      }
      const stemFromPrimary = parseRobotPartFrame(roleMap.primary)?.robotStem ?? robotFrames[0].parsed.robotStem;
      const match = robotFrames.find(
        (entry) =>
          entry.parsed.robotStem === stemFromPrimary &&
          entry.parsed.partId === "04" &&
          entry.parsed.role === "primary",
      );
      return match?.frame.name ?? "";
    })();
    const anchorFrameName = robotPrimaryFootName || roleMap.primary;
    if (!anchorFrameName) {
      return FALLBACK_STAGE_ORIGIN_Y;
    }
    const frame = frameMap.get(anchorFrameName);
    if (!frame) {
      return FALLBACK_STAGE_ORIGIN_Y;
    }
    const footCanvas = displayFrameCanvases[anchorFrameName];
    const trimBottom = footCanvas ? 0 : (effectiveTrimByFrameName[anchorFrameName]?.bottom ?? 0);
    const h = footCanvas
      ? Math.max(1, footCanvas.height)
      : Math.max(1, frame.spriteSize.height) * ICON_VISUAL_SCALE;
    const oy = frame.spriteOffset.y;
    return floorTop + oy * OFFSET_SCALE - h / 2 + trimBottom;
  }, [sheetInfo, roleMap.primary, frameMap, effectiveTrimByFrameName, displayFrameCanvases]);

  const buildEditSnapshot = useCallback(
    (
      offsetEditsValue: Record<string, IconEditorPoint>,
      roleMapExtraValue: string,
      textureEditsValue: Record<string, PendingFrameTextureEdit>,
    ): IconEditorEditSnapshot =>
      cloneIconEditorEditSnapshot({
        offsetEdits: offsetEditsValue,
        roleMapExtra: roleMapExtraValue,
        textureEdits: serializeTextureEdits(textureEditsValue),
      }),
    [],
  );

  const resolveDefaultOffset = useCallback(
    (frameName: string): IconEditorPoint => {
      const frame = frameMap.get(frameName);
      if (!frame) {
        return { x: 0, y: 0 };
      }
      const trim = effectiveTrimByFrameName[frameName] ?? { left: 0, top: 0, right: 0, bottom: 0 };
      return mergeAdjustedSpriteOffset(frame.spriteOffset, trim);
    },
    [effectiveTrimByFrameName, frameMap],
  );

  const applyEditSnapshot = useCallback((snapshot: IconEditorEditSnapshot) => {
    const next = cloneIconEditorEditSnapshot(snapshot);
    setOffsetEdits(next.offsetEdits);
    setRoleMap((previous) => ({ ...previous, extra: next.roleMapExtra }));
    void deserializeTextureEdits(next.textureEdits).then(setPendingTextureEdits);
  }, []);

  const commitEditSnapshot = useCallback(
    (nextPresent: IconEditorEditSnapshot) => {
      const plistPath = activePlistPathRef.current;
      if (!plistPath) {
        applyEditSnapshot(nextPresent);
        return;
      }
      const present = cloneIconEditorEditSnapshot(nextPresent);
      setEditHistory((previous) => {
        const nextHistory = commitIconEditorHistory(previous, present);
        if (nextHistory === previous) {
          return previous;
        }
        saveIconEditorHistory(plistPath, nextHistory);
        return nextHistory;
      });
      applyEditSnapshot(present);
    },
    [applyEditSnapshot],
  );

  const canUndoEdits = editHistory.past.length > 0;
  const canRedoEdits = editHistory.future.length > 0;

  const undoEdits = useCallback(() => {
    const plistPath = activePlistPathRef.current;
    if (!plistPath) {
      return;
    }
    setEditHistory((previous) => {
      const nextHistory = undoIconEditorHistory(previous);
      if (!nextHistory) {
        return previous;
      }
      saveIconEditorHistory(plistPath, nextHistory);
      applyEditSnapshot(nextHistory.present);
      return nextHistory;
    });
  }, [applyEditSnapshot]);

  const redoEdits = useCallback(() => {
    const plistPath = activePlistPathRef.current;
    if (!plistPath) {
      return;
    }
    setEditHistory((previous) => {
      const nextHistory = redoIconEditorHistory(previous);
      if (!nextHistory) {
        return previous;
      }
      saveIconEditorHistory(plistPath, nextHistory);
      applyEditSnapshot(nextHistory.present);
      return nextHistory;
    });
  }, [applyEditSnapshot]);

  const bumpSpriteOffset = useCallback(
    (frameName: string, axis: "x" | "y", sign: number, step: number = OFFSET_STEP) => {
      const previous = offsetEditsRef.current;
      const current = previous[frameName] ?? resolveDefaultOffset(frameName);
      const delta = sign * step;
      const nextPoint =
        axis === "x"
          ? { ...current, x: quantizeOffset(current.x + delta) }
          : { ...current, y: quantizeOffset(current.y + delta) };
      commitEditSnapshot(
        buildEditSnapshot(
          { ...previous, [frameName]: nextPoint },
          roleMapExtraRef.current,
          pendingTextureEditsRef.current,
        ),
      );
    },
    [buildEditSnapshot, commitEditSnapshot, resolveDefaultOffset],
  );

  const setSpriteOffsetAxis = useCallback(
    (frameName: string, axis: "x" | "y", nextValue: number) => {
      const previous = offsetEditsRef.current;
      const current = previous[frameName] ?? resolveDefaultOffset(frameName);
      const nextPoint =
        axis === "x" ? { ...current, x: nextValue } : { ...current, y: nextValue };
      commitEditSnapshot(
        buildEditSnapshot(
          { ...previous, [frameName]: nextPoint },
          roleMapExtraRef.current,
          pendingTextureEditsRef.current,
        ),
      );
    },
    [buildEditSnapshot, commitEditSnapshot, resolveDefaultOffset],
  );

  const backgroundLayerEntries = useMemo(
    () =>
      manifestLayers
        .slice()
        .sort((left, right) => left.zIndex - right.zIndex)
        .map((layer) => ({
          ...layer,
          resolvedSrc: resolveImageUrl(layer.src, atlasVersion),
        })),
    [atlasVersion],
  );

  const clampScrollPortScroll = useCallback(() => {
    const element = stageScrollPortRef.current;
    if (!element) {
      return;
    }
    const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
    if (element.scrollLeft > maxLeft) {
      element.scrollLeft = maxLeft;
    }
    if (element.scrollTop > maxTop) {
      element.scrollTop = maxTop;
    }
    if (element.scrollLeft < 0) {
      element.scrollLeft = 0;
    }
    if (element.scrollTop < 0) {
      element.scrollTop = 0;
    }
  }, []);

  const stageRenderWidth = useMemo(
    () =>
      Math.max(
        STAGE_BASE_WIDTH,
        scrollportSize.w / Math.max(0.001, VIEW_PIXEL_SCALE * zoom),
      ),
    [scrollportSize.w, zoom],
  );

  const combinedViewScale = VIEW_PIXEL_SCALE * zoom;
  /** Painted bounds of a uniform scale about `(STAGE_ORIGIN_X, stageOriginY)` (layout box stays `stageRenderWidth` × `STAGE_BASE_HEIGHT`). */
  const stageSlotWidth = stageRenderWidth * combinedViewScale;
  const stageSlotHeight = STAGE_BASE_HEIGHT * combinedViewScale;
  /** Align scaled paint so its axis-aligned bbox starts at (0,0) inside the slot (removes flex “dead zone” to the right). */
  const stagePaintOffsetX = STAGE_ORIGIN_X * (combinedViewScale - 1);
  const stagePaintOffsetY = stageOriginY * (combinedViewScale - 1);
  const zoomTrackLayoutWidth = Math.max(scrollportSize.w, stageSlotWidth);
  const zoomTrackLayoutHeight = Math.max(scrollportSize.h, stageSlotHeight);

  const focusStageAnchorInScrollPort = useCallback(() => {
    const element = stageScrollPortRef.current;
    if (!element || isMiddlePanning) {
      return;
    }
    const anchorX = stagePaintOffsetX + STAGE_ORIGIN_X;
    const anchorY = stagePaintOffsetY + stageOriginY;
    const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollLeft = Math.max(0, Math.min(maxLeft, anchorX - element.clientWidth / 2));
    element.scrollTop = Math.max(0, Math.min(maxTop, anchorY - element.clientHeight / 2));
    clampScrollPortScroll();
  }, [
    clampScrollPortScroll,
    isMiddlePanning,
    stageOriginY,
    stagePaintOffsetX,
    stagePaintOffsetY,
  ]);

  const scheduleFocusStageAnchor = useCallback(() => {
    if (focusStageAnchorRafRef.current !== null) {
      return;
    }
    focusStageAnchorRafRef.current = window.requestAnimationFrame(() => {
      focusStageAnchorRafRef.current = null;
      focusStageAnchorInScrollPort();
    });
  }, [focusStageAnchorInScrollPort]);

  const focusStageAnchorInScrollPortRef = useRef(focusStageAnchorInScrollPort);
  focusStageAnchorInScrollPortRef.current = focusStageAnchorInScrollPort;

  const scheduleFocusStageAnchorRef = useRef(scheduleFocusStageAnchor);
  scheduleFocusStageAnchorRef.current = scheduleFocusStageAnchor;

  useLayoutEffect(() => {
    const element = stageScrollPortRef.current;
    if (!element) {
      return;
    }
    const update = (): void => {
      const w = Math.max(1, element.clientWidth);
      const h = Math.max(1, element.clientHeight);

      setScrollportSize((previous) =>
        previous.w === w && previous.h === h ? previous : { w, h },
      );
      setViewportCssHeight((previous) => (previous === h ? previous : h));

      if (Math.abs(h - lastObservedScrollportHeightRef.current) > 0.5) {
        lastObservedScrollportHeightRef.current = h;
        const nextZoom = computeAutoResolutionZoom(h);
        setZoom((current) =>
          Math.abs(current - nextZoom) < 0.0001 ? current : nextZoom,
        );
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (focusStageAnchorRafRef.current !== null) {
        window.cancelAnimationFrame(focusStageAnchorRafRef.current);
        focusStageAnchorRafRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    scheduleFocusStageAnchorRef.current();
  }, [zoom]);

  useLayoutEffect(() => {
    if (viewportFocusGeneration === 0) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusStageAnchorInScrollPortRef.current();
      });
    });
  }, [viewportFocusGeneration]);

  const getEffectiveOffset = useCallback(
    (frameName: string): IconEditorPoint => {
      const edited = offsetEdits[frameName];
      if (edited) {
        return edited;
      }
      const frame = frameMap.get(frameName);
      if (!frame) {
        return { x: 0, y: 0 };
      }
      const trim = effectiveTrimByFrameName[frameName] ?? { left: 0, top: 0, right: 0, bottom: 0 };
      // Match merge behavior: start from plist spriteOffset and add trim-derived reduction adjustment.
      return mergeAdjustedSpriteOffset(frame.spriteOffset, trim);
    },
    [effectiveTrimByFrameName, frameMap, offsetEdits],
  );

  const offsetDirty = Object.keys(offsetEdits).length > 0;
  const textureDirty = Object.keys(pendingTextureEdits).length > 0;
  const extraMappingDirty =
    sheetInfo !== null && roleMap.extra.trim() !== extraMappingBaseline.trim();
  const dirty = offsetDirty || extraMappingDirty || textureDirty;
  const saveStatusLabel = !sheetInfo
    ? t("saveStatus.save")
    : dirty
      ? t("saveStatus.unsaved")
      : t("saveStatus.saved");
  const saveTooltip = useMemo(() => {
    if (!sheetInfo) {
      return t("saveStatus.saveOffsets");
    }
    if (isBusy) {
      return t("saveStatus.savingChanges");
    }
    if (dirty) {
      return t("saveStatus.saveUnsaved");
    }
    return t("saveStatus.allSaved");
  }, [dirty, isBusy, sheetInfo]);
  const saveStatusClass = !sheetInfo
    ? "tm-icon-editor-viewport-hud-save--idle"
    : dirty
      ? "tm-icon-editor-viewport-hud-save--unsaved"
      : "tm-icon-editor-viewport-hud-save--saved";

  const loadSheet = useCallback(
    async (plistPath: string, options?: { omitBusy?: boolean; resetHistory?: boolean }) => {
      if (!plistPath.trim()) {
        return;
      }
      const omitBusy = options?.omitBusy === true;
      const resetHistory = options?.resetHistory === true;
      if (!omitBusy) {
        setIsBusy(true);
      }
      setToolbarError(null);
      setToolbarErrorDetail(null);
      setIsErrorDetailOpen(false);
      try {
        if (resetHistory) {
          clearIconEditorHistory(plistPath);
        }
        const info = await getIconEditorSheetInfo(plistPath);
        const extracted = await extractIconEditorFrames(plistPath);
        const { canvases, fullCanvases, trimByFrameName: trims } = await buildSplitCanvasMap(extracted);
        const nextRoleMap = suggestRoleMap(info.frames);
        const persistedHistory = resetHistory ? null : loadIconEditorHistory(plistPath);
        const restoredSnapshot = persistedHistory?.present ?? emptyIconEditorEditSnapshot();
        const nextHistory: IconEditorHistoryState = resetHistory
          ? {
              past: [],
              present: emptyIconEditorEditSnapshot(),
              future: [],
            }
          : persistedHistory ?? {
              past: [],
              present: cloneIconEditorEditSnapshot(restoredSnapshot),
              future: [],
            };

        if (persistedHistory) {
          nextRoleMap.extra = restoredSnapshot.roleMapExtra;
        }

        activePlistPathRef.current = plistPath;
        setSheetInfo(info);
        setRenameValue(
          info.plistPath.split(/[/\\]/).pop()?.replace(/\.plist$/i, "") ?? "",
        );
        setRoleMap(nextRoleMap);
        setExtraMappingBaseline(nextRoleMap.extra.trim());
        const restoredClone = cloneIconEditorEditSnapshot(restoredSnapshot);
        setOffsetEdits(restoredClone.offsetEdits);
        setEditHistory(nextHistory);
        setInspectorRole("primary");
        setTrimByFrameName(trims);
        setSplitFrameCanvases(canvases);
        setFullFrameCanvases(fullCanvases);
        if (resetHistory) {
          setPendingTextureEdits({});
        } else {
          void deserializeTextureEdits(restoredClone.textureEdits).then(setPendingTextureEdits);
        }
        setAtlasVersion((value) => value + 1);
        setViewportFocusGeneration((generation) => generation + 1);
      } catch (error) {
        const parsed = toIconEditorErrorInfo(
          error,
          t("errors:iconEditor.loadSheetFailed"),
        );
        setToolbarError(parsed.message);
        setToolbarErrorDetail(parsed.detail);
      } finally {
        if (!omitBusy) {
          setIsBusy(false);
        }
      }
    },
    [setSplitFrameCanvases],
  );

  const openSheet = useCallback(async () => {
    if (!isTauriRuntime()) {
      setToolbarError(t("errors:iconEditor.runtimeUnavailable"));
      setToolbarErrorDetail(t("errors:iconEditor.runtimeUnavailable"));
      return;
    }
    const selected = await open({
      directory: false,
      multiple: false,
      title: t("dialogs.selectPlistSheet"),
      filters: [{ name: "Plist", extensions: ["plist"] }],
    });
    if (typeof selected !== "string" || !selected.trim()) {
      return;
    }
    await loadSheet(selected);
  }, [loadSheet]);

  const reloadSheet = useCallback(async () => {
    if (!sheetInfo?.plistPath?.trim()) {
      return;
    }
    await loadSheet(sheetInfo.plistPath, { omitBusy: true, resetHistory: true });
  }, [loadSheet, sheetInfo?.plistPath]);

  const saveOffsets = useCallback(async () => {
    if (!sheetInfo || !dirty) {
      return;
    }
    setIsBusy(true);
    setToolbarError(null);
    setToolbarErrorDetail(null);
    setIsErrorDetailOpen(false);
    try {
      const updates = Object.entries(offsetEdits).map(([name, spriteOffset]) => ({
        name,
        spriteOffset,
      }));
      const removedFrameNames: string[] = [];
      if (roleMap.extra.trim() === "" && extraMappingBaseline.trim() !== "") {
        removedFrameNames.push(extraMappingBaseline.trim());
      }
      const frameTextureUpdates = buildFrameTextureUpdates(pendingTextureEdits);
      await saveIconEditorPlist(
        sheetInfo.plistPath,
        updates,
        removedFrameNames,
        frameTextureUpdates,
      );
      clearIconEditorHistory(sheetInfo.plistPath);
      await loadSheet(sheetInfo.plistPath, { omitBusy: true, resetHistory: true });
    } catch (error) {
      const parsed = toIconEditorErrorInfo(
        error,
        t("errors:iconEditor.savePlistFailed"),
      );
      setToolbarError(parsed.message);
      setToolbarErrorDetail(parsed.detail);
    } finally {
      setIsBusy(false);
    }
  }, [dirty, extraMappingBaseline, loadSheet, offsetEdits, pendingTextureEdits, roleMap.extra, sheetInfo]);

  const renameSheet = useCallback(async () => {
    if (!sheetInfo || !renameValue.trim()) {
      return;
    }
    setIsBusy(true);
    setToolbarError(null);
    setToolbarErrorDetail(null);
    setIsErrorDetailOpen(false);
    setRenameConflict(null);
    try {
      const renamed = await renameIconEditorSheet(sheetInfo.plistPath, renameValue.trim());
      await loadSheet(renamed.plistPath, { omitBusy: true });
    } catch (error) {
      if (isIconEditorRenameTargetConflict(error)) {
        setRenameConflict({ targetStem: renameValue.trim() });
        return;
      }
      const parsed = toIconEditorErrorInfo(
        error,
        t("errors:iconEditor.renameSheetFailed"),
      );
      setToolbarError(parsed.message);
      setToolbarErrorDetail(parsed.detail);
    } finally {
      setIsBusy(false);
    }
  }, [loadSheet, renameValue, sheetInfo]);

  const swapRenameSheet = useCallback(async () => {
    if (!sheetInfo || !renameConflict) {
      return;
    }
    setIsBusy(true);
    setToolbarError(null);
    setToolbarErrorDetail(null);
    setIsErrorDetailOpen(false);
    try {
      const renamed = await swapRenameIconEditorSheet(
        sheetInfo.plistPath,
        renameConflict.targetStem,
      );
      setRenameConflict(null);
      await loadSheet(renamed.plistPath, { omitBusy: true });
    } catch (error) {
      const parsed = toIconEditorErrorInfo(
        error,
        t("errors:iconEditor.swapNamesFailed"),
      );
      setToolbarError(parsed.message);
      setToolbarErrorDetail(parsed.detail);
    } finally {
      setIsBusy(false);
    }
  }, [loadSheet, renameConflict, sheetInfo]);

  const currentSheetStem = useMemo(
    () => sheetInfo?.plistPath.split(/[/\\]/).pop()?.replace(/\.plist$/i, "") ?? "",
    [sheetInfo?.plistPath],
  );
  const canSaveCopy =
    Boolean(sheetInfo) && renameValue.trim() !== "" && renameValue.trim() !== currentSheetStem;

  const saveCopy = useCallback(async () => {
    if (!sheetInfo || !canSaveCopy) {
      return;
    }
    setIsBusy(true);
    setToolbarError(null);
    setToolbarErrorDetail(null);
    setIsErrorDetailOpen(false);
    try {
      const updates = Object.entries(offsetEdits).map(([name, spriteOffset]) => ({
        name,
        spriteOffset,
      }));
      const removedFrameNames: string[] = [];
      if (roleMap.extra.trim() === "" && extraMappingBaseline.trim() !== "") {
        removedFrameNames.push(extraMappingBaseline.trim());
      }
      const frameTextureUpdates = buildFrameTextureUpdates(pendingTextureEdits);
      const copied = await copyIconEditorSheet(
        sheetInfo.plistPath,
        renameValue.trim(),
        updates,
        removedFrameNames,
        frameTextureUpdates,
      );
      await loadSheet(copied.plistPath, { omitBusy: true });
    } catch (error) {
      const parsed = toIconEditorErrorInfo(
        error,
        t("errors:iconEditor.saveCopyFailed"),
      );
      setToolbarError(parsed.message);
      setToolbarErrorDetail(parsed.detail);
    } finally {
      setIsBusy(false);
    }
  }, [
    canSaveCopy,
    extraMappingBaseline,
    loadSheet,
    offsetEdits,
    renameValue,
    pendingTextureEdits,
    roleMap.extra,
    sheetInfo,
  ]);

  const importFrame = useCallback(
    async (role: IconLayerRole) => {
      if (!sheetInfo) {
        return;
      }
      if (!isTauriRuntime()) {
        setToolbarError(t("errors:iconEditor.textureImportUnavailable"));
        setToolbarErrorDetail(t("errors:iconEditor.textureImportUnavailable"));
        return;
      }
      const selected = await open({
        directory: false,
        multiple: false,
        title: `Select replacement texture for ${role}`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (typeof selected !== "string" || !selected.trim()) {
        return;
      }
      const selectedTexturePath = selected.trim();
      const stemFromPrimary = roleMap.primary.trim()
        ? parseIconFrameStem(roleMap.primary.trim())
        : null;
      const stem = stemFromPrimary ?? inferStemFromFrames(sheetInfo.frames);
      if (!stem) {
        const message =
          t("errors:iconEditor.inferStemFailed");
        setToolbarError(message);
        setToolbarErrorDetail(message);
        return;
      }
      const isRobotSheet = /^robot_\d+_0[1-4]$/i.test(stem) || sheetInfo.frames.some((frame) => Boolean(parseRobotPartFrame(frame.name)));
      const isSpiderSheet =
        /^spider_\d+_0[1-4]$/i.test(stem) || sheetInfo.frames.some((frame) => Boolean(parseSpiderPartFrame(frame.name)));
      const targetFrameName = isRobotSheet
        ? (() => {
            const robotStemMatch = stem.match(/^(robot_\d+)_0[1-4]$/i);
            const robotStem = robotStemMatch ? robotStemMatch[1] : stem;
            if (role === "extra" && selectedRobotPartId !== "01") {
              throw new Error(t("errors:iconEditor.robotExtraUnsupported"));
            }
            const suffix =
              role === "primary"
                ? "_001"
                : role === "secondary"
                  ? "_2_001"
                  : role === "glow"
                    ? "_glow_001"
                    : role === "extra"
                      ? "_extra_001"
                      : "_3_001";
            return ensurePngExtension(`${robotStem}_${selectedRobotPartId}${suffix}`);
          })()
        : isSpiderSheet
          ? (() => {
              const spiderStemMatch = stem.match(/^(spider_\d+)_0[1-4]$/i);
              const spiderStem = spiderStemMatch ? spiderStemMatch[1] : stem;
              if (role === "extra" && selectedSpiderPartId !== "01") {
                throw new Error(t("errors:iconEditor.spiderExtraUnsupported"));
              }
              const suffix =
                role === "primary"
                  ? "_001"
                  : role === "secondary"
                    ? "_2_001"
                    : role === "glow"
                      ? "_glow_001"
                      : role === "extra"
                        ? "_extra_001"
                        : "_3_001";
              return ensurePngExtension(`${spiderStem}_${selectedSpiderPartId}${suffix}`);
            })()
          : buildIconFrameNameForRole(stem, role);
      const existingPlistName = resolveFrameNameFromPlist(sheetInfo.frames, targetFrameName);
      const frameExists = existingPlistName !== null;
      setToolbarError(null);
      setToolbarErrorDetail(null);
      setIsErrorDetailOpen(false);
      try {
        const plistFrameKey = existingPlistName ?? targetFrameName;
        const sourceCanvas = await buildCanvasFromImagePath(selectedTexturePath);
        const spriteWidth = Math.max(1, sourceCanvas.width);
        const spriteHeight = Math.max(1, sourceCanvas.height);
        const existingFrame = existingPlistName ? frameMap.get(existingPlistName) : undefined;
        const previousPending = pendingTextureEditsRef.current;
        const pendingExisting = previousPending[plistFrameKey];
        const nextPending: Record<string, PendingFrameTextureEdit> = {
          ...previousPending,
          [plistFrameKey]: {
            sourceCanvas,
            spriteSize: { width: spriteWidth, height: spriteHeight },
            spriteSourceSize: { width: spriteWidth, height: spriteHeight },
            spriteOffset:
              pendingExisting?.spriteOffset ?? existingFrame?.spriteOffset ?? { x: 0, y: 0 },
            textureRotated:
              pendingExisting?.textureRotated ?? existingFrame?.textureRotated ?? false,
            isNewFrame: !frameExists,
          },
        };
        const nextOffsets = { ...offsetEditsRef.current };
        delete nextOffsets[plistFrameKey];
        commitEditSnapshot(
          buildEditSnapshot(nextOffsets, roleMapExtraRef.current, nextPending),
        );
        setRoleMap((previous) => ({ ...previous, [role]: plistFrameKey }));
      } catch (error) {
        const parsed = toIconEditorErrorInfo(
          error,
          t("errors:iconEditor.importTextureFailed"),
        );
        setToolbarError(parsed.message);
        setToolbarErrorDetail(parsed.detail);
      }
    },
    [buildEditSnapshot, commitEditSnapshot, frameMap, roleMap.primary, selectedRobotPartId, selectedSpiderPartId, sheetInfo],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        saveOffsets().catch(() => {
          // Save handler already updates toolbar error state.
        });
        return;
      }
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoEdits();
        return;
      }
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redoEdits();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redoEdits, saveOffsets, undoEdits]);

  const inspectorFrameName = roleMap[inspectorRole];

  const robotPartRoleMap = useMemo(() => {
    const byPart: Record<RobotPartId, Partial<Record<IconLayerRole, string>>> = {
      "01": {},
      "02": {},
      "03": {},
      "04": {},
    };
    for (const frame of sheetInfo?.frames ?? []) {
      const parsed = parseRobotPartFrame(frame.name);
      if (!parsed) {
        continue;
      }
      if (parsed.role === "extra" && parsed.partId !== "01") {
        continue;
      }
      byPart[parsed.partId][parsed.role] = frame.name;
    }
    return byPart;
  }, [sheetInfo?.frames]);

  const spiderPartRoleMap = useMemo(() => {
    const byPart: Record<RobotPartId, Partial<Record<IconLayerRole, string>>> = {
      "01": {},
      "02": {},
      "03": {},
      "04": {},
    };
    for (const frame of sheetInfo?.frames ?? []) {
      const parsed = parseSpiderPartFrame(frame.name);
      if (!parsed) {
        continue;
      }
      if (parsed.role === "extra" && parsed.partId !== "01") {
        continue;
      }
      byPart[parsed.partId][parsed.role] = frame.name;
    }
    return byPart;
  }, [sheetInfo?.frames]);

  const iconStem = useMemo(() => {
    const fromPrimary = roleMap.primary ? parseIconFrameStem(roleMap.primary) : null;
    return fromPrimary ?? inferStemFromFrames(sheetInfo?.frames ?? []) ?? "";
  }, [roleMap.primary, sheetInfo?.frames]);
  /** Bird/UFO capsule art sits ~30 game px higher; UHD sheets use 2× nudge. Applied as screen Y (smaller = up). */
  const isBirdOrUfoIcon = /^(bird|ufo)_\d+$/i.test(iconStem);
  const capsuleStageVerticalNudge = useMemo(() => {
    if (!isBirdOrUfoIcon) {
      return 0;
    }
    const plistName = sheetInfo?.plistPath.split(/[/\\]/).pop()?.toLowerCase() ?? "";
    if (plistName.includes("-uhd")) {
      return 0;
    }
    return -30;
  }, [sheetInfo?.plistPath, isBirdOrUfoIcon]);
  const isRobotIcon =
    /^robot_\d+_0[1-4]$/i.test(iconStem) || (sheetInfo?.frames ?? []).some((frame) => Boolean(parseRobotPartFrame(frame.name)));
  const isSpiderIcon =
    /^spider_\d+_\d+$/i.test(iconStem) || (sheetInfo?.frames ?? []).some((frame) => Boolean(parseSpiderPartFrame(frame.name)));
  const robotInspectorFrameName =
    isRobotIcon && selectedRobotPartId === "01" && inspectorRole === "extra"
      ? roleMap.extra
      : robotPartRoleMap[selectedRobotPartId][inspectorRole] ?? "";
  const spiderInspectorFrameName =
    isSpiderIcon && selectedSpiderPartId === "01" && inspectorRole === "extra"
      ? roleMap.extra
      : spiderPartRoleMap[selectedSpiderPartId][inspectorRole] ?? "";
  const roleOrder = isRobotIcon
    ? selectedRobotPartId === "01"
      ? BASE_ROLES
      : (["glow", "secondary", "primary"] as IconLayerRole[])
    : isSpiderIcon
      ? selectedSpiderPartId === "01"
        ? BASE_ROLES
        : (["glow", "secondary", "primary"] as IconLayerRole[])
      : isBirdOrUfoIcon
        ? [...BASE_ROLES, ...BIRD_CAPSULE_ROLES]
        : BASE_ROLES;
  const layerRoles = isBirdOrUfoIcon ? BIRD_LAYER_ROLES : BASE_LAYER_ROLES;
  const effectiveInspectorFrameName =
    inspectorFrameOverride ??
    (isRobotIcon ? robotInspectorFrameName : isSpiderIcon ? spiderInspectorFrameName : inspectorFrameName);
  const inspectorFrame = effectiveInspectorFrameName ? frameMap.get(effectiveInspectorFrameName) ?? null : null;
  const inspectorTrim: TrimInsets | null = effectiveInspectorFrameName
    ? effectiveTrimByFrameName[effectiveInspectorFrameName] ?? { left: 0, top: 0, right: 0, bottom: 0 }
    : null;
  const mergeOffsetFromNullifiedInput =
    inspectorTrim !== null ? mergeAdjustedSpriteOffset({ x: 0, y: 0 }, inspectorTrim) : null;
  const inspectorEffectiveOffset = effectiveInspectorFrameName
    ? getEffectiveOffset(effectiveInspectorFrameName)
    : null;

  const rotateFrame = useCallback(
    (direction: IconEditorRotateDirection) => {
      if (!effectiveInspectorFrameName) {
        return;
      }
      const frameName = effectiveInspectorFrameName;
      const frame = frameMap.get(frameName);
      if (!frame) {
        return;
      }
      setToolbarError(null);
      setToolbarErrorDetail(null);
      setIsErrorDetailOpen(false);
      const pending = pendingTextureEditsRef.current[frameName];
      const sourceCanvas = pending?.sourceCanvas ?? fullFrameCanvases[frameName];
      if (!sourceCanvas) {
        return;
      }
      const baseMeta = pending ?? {
        spriteSize: frame.spriteSize,
        spriteSourceSize: frame.spriteSourceSize,
        spriteOffset: frame.spriteOffset,
        textureRotated: frame.textureRotated,
        isNewFrame: false,
      };
      const nextPending: Record<string, PendingFrameTextureEdit> = {
        ...pendingTextureEditsRef.current,
        [frameName]: {
          ...baseMeta,
          sourceCanvas: rotateCanvas90(sourceCanvas, direction),
          spriteSize: swapIconEditorSize(baseMeta.spriteSize),
          spriteSourceSize: swapIconEditorSize(baseMeta.spriteSourceSize),
          spriteOffset: rotateSpriteOffset(baseMeta.spriteOffset, direction),
          textureRotated: baseMeta.textureRotated,
        },
      };
      const nextOffsets = { ...offsetEditsRef.current };
      delete nextOffsets[frameName];
      commitEditSnapshot(
        buildEditSnapshot(nextOffsets, roleMapExtraRef.current, nextPending),
      );
    },
    [buildEditSnapshot, commitEditSnapshot, effectiveInspectorFrameName, frameMap, fullFrameCanvases],
  );

  useEffect(() => {
    if (!isBirdOrUfoIcon && inspectorRole === "capsule") {
      setInspectorRole("primary");
    }
  }, [inspectorRole, isBirdOrUfoIcon]);

  useEffect(() => {
    setInspectorFrameOverride(null);
  }, [sheetInfo?.plistPath]);

  useEffect(() => {
    if (!isRobotIcon) {
      setSelectedRobotPartId("01");
    }
  }, [isRobotIcon]);

  useEffect(() => {
    if (!isSpiderIcon) {
      setSelectedSpiderPartId("01");
    }
  }, [isSpiderIcon]);

  useEffect(() => {
    if (inspectorRole === "primary" || inspectorRole === "secondary" || inspectorRole === "glow") {
      setActiveTintTarget(inspectorRole);
    }
  }, [inspectorRole]);

  const layers = useMemo(() => {
    if (isRobotIcon) {
      const roleOrderPerPart: TintTarget[] = ["glow", "secondary", "primary"];
      const robotLayers: Array<{
        role: IconLayerRole;
        frameName: string;
        frame: IconEditorFrameInfo;
        offset: IconEditorPoint;
        tint: string | null;
        robotPartId: RobotPartId;
      }> = [];
      for (const partId of ROBOT_PART_DRAW_ORDER) {
        const partRoles = robotPartRoleMap[partId];
        for (const role of roleOrderPerPart) {
          const frameName = partRoles[role];
          if (!frameName) {
            continue;
          }
          if (role === "glow" && hideGlow) {
            continue;
          }
          const frame = frameMap.get(frameName);
          if (!frame) {
            continue;
          }
          robotLayers.push({
            role,
            frameName,
            frame,
            offset: getEffectiveOffset(frameName),
            tint: tintByTarget[role],
            robotPartId: partId,
          });
        }
        if (partId === "01") {
          const extraFrameName = roleMap.extra.trim();
          if (extraFrameName) {
            const frame = frameMap.get(extraFrameName);
            if (frame) {
              robotLayers.push({
                role: "extra",
                frameName: extraFrameName,
                frame,
                offset: getEffectiveOffset(extraFrameName),
                tint: null,
                robotPartId: partId,
              });
            }
          }
        }
      }
      return robotLayers;
    }
    if (isSpiderIcon) {
      const roleOrderPerPart: TintTarget[] = ["glow", "secondary", "primary"];
      const spiderLayers: Array<{
        role: IconLayerRole;
        frameName: string;
        frame: IconEditorFrameInfo;
        offset: IconEditorPoint;
        tint: string | null;
        robotPartId: RobotPartId;
      }> = [];
      for (const partId of SPIDER_PART_DRAW_ORDER) {
        const partRoles = spiderPartRoleMap[partId];
        for (const role of roleOrderPerPart) {
          const frameName = partRoles[role];
          if (!frameName) {
            continue;
          }
          if (role === "glow" && hideGlow) {
            continue;
          }
          const frame = frameMap.get(frameName);
          if (!frame) {
            continue;
          }
          spiderLayers.push({
            role,
            frameName,
            frame,
            offset: getEffectiveOffset(frameName),
            tint: tintByTarget[role],
            robotPartId: partId,
          });
        }
        if (partId === "01") {
          const extraFrameName = roleMap.extra.trim();
          if (extraFrameName) {
            const frame = frameMap.get(extraFrameName);
            if (frame) {
              spiderLayers.push({
                role: "extra",
                frameName: extraFrameName,
                frame,
                offset: getEffectiveOffset(extraFrameName),
                tint: null,
                robotPartId: partId,
              });
            }
          }
        }
      }
      return spiderLayers;
    }
    return layerRoles
      .map((role) => {
        const frameName = roleMap[role];
        if (!frameName) {
          return null;
        }
        if (role === "glow" && hideGlow) {
          return null;
        }
        const frame = frameMap.get(frameName);
        if (!frame) {
          return null;
        }
        const offset = getEffectiveOffset(frameName);
        const tint = role === "primary" || role === "secondary" || role === "glow" ? tintByTarget[role] : null;
        return {
          role,
          frameName,
          frame,
          offset,
          tint,
          robotPartId: null,
        };
      })
      .filter((layer): layer is NonNullable<typeof layer> => Boolean(layer));
  }, [
    frameMap,
    getEffectiveOffset,
    hideGlow,
    isRobotIcon,
    isSpiderIcon,
    layerRoles,
    offsetEdits,
    robotPartRoleMap,
    roleMap,
    spiderPartRoleMap,
    tintByTarget,
  ]);

  const downloadCurrentIconPng = useCallback(async () => {
    if (!sheetInfo) {
      return;
    }
    if (layers.length === 0) {
      setToolbarError(t("errors:iconEditor.noVisibleLayers"));
      setToolbarErrorDetail(t("errors:iconEditor.noVisibleLayersDetail"));
      return;
    }
    const stageElement = stageElementRef.current;
    if (!stageElement) {
      setToolbarError(t("errors:iconEditor.stageUnavailable"));
      setToolbarErrorDetail(t("errors:iconEditor.stageUnavailableDetail"));
      return;
    }
    const stageRect = stageElement.getBoundingClientRect();
    const layerElements = Array.from(stageElement.querySelectorAll(".tm-icon-editor-layer")) as HTMLElement[];
    const visibleLayerRects = layerElements
      .filter((element) => element.offsetParent !== null)
      .map((element) => element.getBoundingClientRect());
    if (visibleLayerRects.length === 0) {
      setToolbarError(t("errors:iconEditor.noRenderedLayers"));
      setToolbarErrorDetail(t("errors:iconEditor.noRenderedLayersDetail"));
      return;
    }
    let minLeft = Number.POSITIVE_INFINITY;
    let minTop = Number.POSITIVE_INFINITY;
    let maxRight = Number.NEGATIVE_INFINITY;
    let maxBottom = Number.NEGATIVE_INFINITY;
    for (const rect of visibleLayerRects) {
      minLeft = Math.min(minLeft, rect.left);
      minTop = Math.min(minTop, rect.top);
      maxRight = Math.max(maxRight, rect.right);
      maxBottom = Math.max(maxBottom, rect.bottom);
    }
    const layerBoundsInStage = {
      x: minLeft - stageRect.left,
      y: minTop - stageRect.top,
      width: maxRight - minLeft,
      height: maxBottom - minTop,
    };

    try {
      const stageCanvas = await html2canvas(stageElement, {
        backgroundColor: null,
        scale: 1,
        logging: false,
        useCORS: true,
        onclone: (clonedDocument) => {
          const darkenCanvasPixels = (canvas: HTMLCanvasElement, factor: number): void => {
            const context = canvas.getContext("2d");
            if (!context) {
              return;
            }
            const width = Math.max(1, canvas.width);
            const height = Math.max(1, canvas.height);
            const imageData = context.getImageData(0, 0, width, height);
            const { data } = imageData;
            for (let i = 0; i < data.length; i += 4) {
              data[i] = Math.round(data[i] * factor);
              data[i + 1] = Math.round(data[i + 1] * factor);
              data[i + 2] = Math.round(data[i + 2] * factor);
            }
            context.putImageData(imageData, 0, 0);
          };

          const clonedStage = clonedDocument.querySelector(
            ".tm-icon-editor-stage.tm-icon-editor-stage--in-scrollport",
          ) as HTMLElement | null;
          if (clonedStage) {
            // Export should never include edit borders/selection outlines.
            clonedStage.classList.add("tm-icon-editor-stage--hide-layer-borders");
            // Allow capture of parts/glow that can extend past stage edges.
            clonedStage.style.overflow = "visible";
            clonedStage.style.border = "none";
            clonedStage.style.background = "transparent";
            const selectedLayers = clonedStage.querySelectorAll(".tm-icon-editor-layer-selected");
            selectedLayers.forEach((layer) => layer.classList.remove("tm-icon-editor-layer-selected"));

            // html2canvas can miss CSS filter brightness on these echo wrappers.
            // Bake dimming into opacity in the cloned export tree.
            const robotEchoWraps = clonedStage.querySelectorAll(
              ".tm-icon-editor-robot-part-wrap.tm-icon-editor-robot-part-wrap-echo:not(.tm-icon-editor-robot-part-wrap-echo--glow)",
            );
            robotEchoWraps.forEach((element) => {
              if (element instanceof HTMLElement) {
                // Keep back-copy visuals opaque; dim by mutating canvas pixels.
                element.style.opacity = "1";
                element.querySelectorAll("canvas").forEach((node) => {
                  if (node instanceof HTMLCanvasElement) {
                    darkenCanvasPixels(node, 0.67);
                  }
                });
                const className = element.className;
                if (className.includes("tm-icon-editor-robot-part-echo--04")) {
                  element.style.zIndex = "120";
                } else if (className.includes("tm-icon-editor-robot-part-echo--02")) {
                  element.style.zIndex = "110";
                } else if (className.includes("tm-icon-editor-robot-part-echo--03")) {
                  // Leg duplicate should always render beneath duplicate body + foot.
                  element.style.zIndex = "100";
                }
              }
            });
            const spiderEchoWraps = clonedStage.querySelectorAll(
              ".tm-icon-editor-spider-part-wrap.tm-icon-editor-spider-part-wrap-echo:not(.tm-icon-editor-spider-part-wrap-echo--glow)",
            );
            spiderEchoWraps.forEach((element) => {
              if (element instanceof HTMLElement) {
                // Spider duplicate/back legs should be dimmed, not translucent.
                element.style.opacity = "1";
                element.querySelectorAll("canvas").forEach((node) => {
                  if (node instanceof HTMLCanvasElement) {
                    darkenCanvasPixels(node, 0.5);
                  }
                });
              }
            });
          }
        },
        ignoreElements: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          return (
            element.classList.contains("tm-icon-editor-background-stack") ||
            element.classList.contains("tm-icon-editor-floor-divider") ||
            element.classList.contains("tm-icon-editor-bg-layer-wrap") ||
            element.classList.contains("tm-icon-editor-bg-image") ||
            element.classList.contains("tm-icon-editor-bg-tile-layer")
          );
        },
      });
      const layerCropped = cropCanvasByRect(stageCanvas, layerBoundsInStage);
      const trim = trimTransparentEdgesFromCanvas(layerCropped);
      const tightlyCropped = cropCanvasByTrimInsets(layerCropped, trim);
      const pngDataUrl = tightlyCropped.toDataURL("image/png");

      const stem = renameValue.trim() || sheetInfo.plistPath.split(/[/\\]/).pop()?.replace(/\.plist$/i, "") || "icon";
      const defaultFileName = `${stem}-icon.png`;
      if (isTauriRuntime()) {
        const savePath = await save({
          title: t("dialogs.saveIconPng"),
          defaultPath: defaultFileName,
          filters: [{ name: "PNG", extensions: ["png"] }],
        });
        if (typeof savePath === "string" && savePath.trim()) {
          await invoke("icon_editor_save_png_data_url", {
            outputPath: savePath,
            pngDataUrl,
          });
        }
      } else {
        const link = document.createElement("a");
        link.href = pngDataUrl;
        link.download = defaultFileName;
        link.click();
      }
    } catch (error) {
      const parsed = toIconEditorErrorInfo(
        error,
        t("errors:iconEditor.exportPngFailed"),
      );
      setToolbarError(parsed.message);
      setToolbarErrorDetail(parsed.detail);
    }
  }, [
    layers,
    renameValue,
    sheetInfo,
  ]);

  const onLayerPointerDown = (role: IconLayerRole, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    setInspectorRole(role);
    if (role === "glow" && hideGlow) {
      return;
    }
    const layerFrameName = event.currentTarget.dataset.frameName ?? "";
    const layerPartId = event.currentTarget.dataset.partId as RobotPartId | undefined;
    if (layerFrameName) {
      setInspectorFrameOverride(layerFrameName);
    }
    if (layerPartId) {
      if (isRobotIcon) {
        setSelectedRobotPartId(layerPartId);
      }
      if (isSpiderIcon) {
        setSelectedSpiderPartId(layerPartId);
      }
    }
    const frameName = roleMap[role];
    const dragFrameName = layerFrameName || frameName;
    if (!dragFrameName) {
      return;
    }
    const startOffset = getEffectiveOffset(dragFrameName);
    const historyStartSnapshot = buildEditSnapshot(
      offsetEditsRef.current,
      roleMapExtraRef.current,
      pendingTextureEditsRef.current,
    );
    setDragState({
      role,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset,
      historyStartSnapshot,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onLayerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    const frameName = (event.currentTarget.dataset.frameName ?? "") || roleMap[dragState.role];
    if (!frameName) {
      return;
    }
    const viewScale = VIEW_PIXEL_SCALE * zoom;
    const dx = (event.clientX - dragState.startClientX) / viewScale;
    const dy = (event.clientY - dragState.startClientY) / viewScale;
    const offsetX = quantizeOffset(dragState.startOffset.x + dx / OFFSET_SCALE);
    const offsetY = quantizeOffset(dragState.startOffset.y - dy / OFFSET_SCALE);
    setOffsetEdits((previous) => ({
      ...previous,
      [frameName]: { x: offsetX, y: offsetY },
    }));
  };

  const onLayerPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState && event.pointerId === dragState.pointerId) {
      const frameName =
        (event.currentTarget.dataset.frameName ?? "") || roleMap[dragState.role];
      if (frameName) {
        const nextSnapshot = buildEditSnapshot(
          offsetEditsRef.current,
          roleMapExtraRef.current,
          pendingTextureEditsRef.current,
        );
        if (!iconEditorEditSnapshotsEqual(nextSnapshot, dragState.historyStartSnapshot)) {
          commitEditSnapshot(nextSnapshot);
        }
      }
      setDragState(null);
    }
  };

  const onZoomWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    setZoom((value) => clampZoom(value + delta));
  };

  const onScrollPortPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) {
      return;
    }
    const element = stageScrollPortRef.current;
    if (!element) {
      return;
    }
    event.preventDefault();
    setIsMiddlePanning(true);
    scrollPanRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: element.scrollLeft,
      startScrollTop: element.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onScrollPortPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = scrollPanRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const element = stageScrollPortRef.current;
    if (!element) {
      return;
    }
    element.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startClientX);
    element.scrollTop = drag.startScrollTop - (event.clientY - drag.startClientY);
    clampScrollPortScroll();
  };

  const endScrollPortPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = scrollPanRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    scrollPanRef.current = null;
    setIsMiddlePanning(false);
    clampScrollPortScroll();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore if capture already released
    }
  };

  const commitRoleMapExtra = useCallback(
    (nextExtra: string) => {
      commitEditSnapshot(
        buildEditSnapshot(offsetEditsRef.current, nextExtra, pendingTextureEditsRef.current),
      );
    },
    [buildEditSnapshot, commitEditSnapshot],
  );

  const roleControls = roleOrder.map((role) => {
    const roleValue = isRobotIcon
      ? role === "extra" && selectedRobotPartId === "01"
        ? roleMap.extra
        : robotPartRoleMap[selectedRobotPartId][role] ?? ""
      : isSpiderIcon
        ? role === "extra" && selectedSpiderPartId === "01"
          ? roleMap.extra
          : spiderPartRoleMap[selectedSpiderPartId][role] ?? ""
        : roleMap[role];

    const frameOptions: AppSelectOption[] = [
      { value: "", label: t("frames.none") },
      ...(sheetInfo?.frames ?? [])
        .filter((frame) => {
          if (isRobotIcon) {
            const parsed = parseRobotPartFrame(frame.name);
            if (!parsed) {
              return false;
            }
            return parsed.partId === selectedRobotPartId && parsed.role === role;
          }
          if (isSpiderIcon) {
            const parsed = parseSpiderPartFrame(frame.name);
            if (!parsed) {
              return false;
            }
            return parsed.partId === selectedSpiderPartId && parsed.role === role;
          }
          return true;
        })
        .map((frame) => ({
          value: frame.name,
          label: frame.name,
        })),
    ];

    const handleRoleFrameChange = (nextFrame: string) => {
      if (isRobotIcon) {
        if (role === "extra" && selectedRobotPartId === "01") {
          commitRoleMapExtra(nextFrame);
          setInspectorFrameOverride(nextFrame || null);
          setInspectorRole(role);
          return;
        }
        setInspectorFrameOverride(nextFrame || null);
        setInspectorRole(role);
        return;
      }
      if (isSpiderIcon) {
        if (role === "extra" && selectedSpiderPartId === "01") {
          commitRoleMapExtra(nextFrame);
          setInspectorFrameOverride(nextFrame || null);
          setInspectorRole(role);
          return;
        }
        setInspectorFrameOverride(nextFrame || null);
        setInspectorRole(role);
        return;
      }
      if (role === "extra") {
        commitRoleMapExtra(nextFrame);
        return;
      }
      setRoleMap((previous) => ({ ...previous, [role]: nextFrame }));
    };

    return (
      <div
        className={`tm-icon-editor-role-card tm-icon-editor-role-card-${role}${
          inspectorRole === role ? " tm-icon-editor-role-card-active" : ""
        }`}
        key={role}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest("select") ||
            target.closest("button") ||
            target.closest(".tm-app-select")
          ) {
            return;
          }
          setInspectorRole(role);
          setInspectorFrameOverride(null);
        }}
      >
        <div className="tm-icon-editor-role-card-head">
          <span className="tm-icon-editor-role-chip">{t(`roles.${role}`)}</span>
          <span className="tm-icon-editor-role-card-hint">
            {t("frames.layerFrame")}
          </span>
        </div>
        <div className="tm-icon-editor-role-actions">
          <AppSelect
            className="tm-icon-editor-role-select"
            value={roleValue}
            options={frameOptions}
            onChange={handleRoleFrameChange}
            disabled={!sheetInfo || isBusy}
            aria-label={`${t(`roles.${role}`)}: ${t("frames.layerFrame")}`}
            portal
          />
          <button
            type="button"
            className="tm-icon-editor-import-icon-btn"
            aria-label={t("frames.importAria", { role: t(`roles.${role}`) })}
            title={t("frames.importAria", { role: t(`roles.${role}`) })}
            onClick={() => importFrame(role)}
            disabled={!sheetInfo || isBusy}
          >
            <Upload size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {role === "extra" &&
        (!(isRobotIcon || isSpiderIcon) ||
          (isRobotIcon && selectedRobotPartId === "01") ||
          (isSpiderIcon && selectedSpiderPartId === "01")) ? (
          <div className="tm-icon-editor-role-extra-actions">
            <button
              type="button"
              className="tm-primary-btn tm-icon-editor-remove-extra-btn"
              title={t("frames.clearExtraTooltip")}
              disabled={!roleMap.extra.trim() || isBusy}
              onClick={() => {
                commitRoleMapExtra("");
                setInspectorFrameOverride(null);
                setInspectorRole((current) => (current === "extra" ? "primary" : current));
              }}
            >
              <Trash2 size={14} />
              {t("common:remove")}
            </button>
          </div>
        ) : null}
      </div>
    );
  });

  return (
    <div className="tm-icon-editor">
      <header className="tm-icon-editor-top-bar">
        <div className="tm-icon-editor-top-bar-track">
        <div className="tm-icon-editor-top-bar-brand">
          <Palette size={18} strokeWidth={1.75} />
          <span>{t("navigation:tools.iconEditor.label")}</span>
        </div>
        <div className="tm-icon-editor-toolbar-divider" aria-hidden />
        <div className="tm-icon-editor-toolbar-group tm-icon-editor-toolbar-group--file">
          <IconEditorToolbarTip label={t("toolbar.reloadTooltip")}>
            <button
              className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
              type="button"
              aria-label={t("toolbar.reloadAria")}
              onClick={() => reloadSheet().catch(() => {})}
              disabled={!sheetInfo || isBusy}
            >
              <RefreshCw size={15} aria-hidden />
            </button>
          </IconEditorToolbarTip>
          <IconEditorToolbarTip label={t("toolbar.openTooltip")}>
            <button
              className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
              type="button"
              aria-label={t("toolbar.openAria")}
              onClick={() => openSheet().catch(() => {})}
              disabled={isBusy}
            >
              <FolderOpen size={15} aria-hidden />
            </button>
          </IconEditorToolbarTip>
          <div className="tm-icon-editor-rename">
            <label>
              <div className="tm-folder-input">
                <input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  placeholder="icons-hd"
                />
                <IconEditorToolbarTip label={t("toolbar.renameTooltip")}>
                  <button
                    type="button"
                    className="tm-icon-editor-toolbar-btn"
                    aria-label={t("toolbar.renameAria")}
                    onClick={() => renameSheet().catch(() => {})}
                    disabled={!sheetInfo || isBusy}
                  >
                    <PencilLine size={14} aria-hidden />
                    {t("common:rename")}
                  </button>
                </IconEditorToolbarTip>
                <IconEditorToolbarTip label={t("toolbar.saveCopyTooltip")}>
                  <button
                    type="button"
                    className="tm-icon-editor-toolbar-btn"
                    aria-label={t("toolbar.saveCopyAria")}
                    onClick={() => saveCopy().catch(() => {})}
                    disabled={!canSaveCopy || isBusy}
                  >
                    <Copy size={14} aria-hidden />
                    {t("common:saveCopy")}
                  </button>
                </IconEditorToolbarTip>
              </div>
            </label>
          </div>
          <IconEditorToolbarTip label={t("toolbar.downloadTooltip")}>
            <button
              className="tm-icon-editor-toolbar-btn"
              type="button"
              aria-label={t("toolbar.downloadAria")}
              onClick={() => downloadCurrentIconPng().catch(() => {})}
              disabled={!sheetInfo || isBusy}
            >
              <Download size={15} aria-hidden />
              {t("toolbar.download")}
            </button>
          </IconEditorToolbarTip>
        </div>
        <div className="tm-icon-editor-toolbar-divider" aria-hidden />
        <div className="tm-icon-editor-toolbar-group">
          <IconEditorToolbarTip label={t("toolbar.undoTooltip")}>
            <button
              type="button"
              className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
              aria-label={t("toolbar.undo")}
              onClick={undoEdits}
              disabled={!sheetInfo || isBusy || !canUndoEdits}
            >
              <Undo2 size={15} aria-hidden />
            </button>
          </IconEditorToolbarTip>
          <IconEditorToolbarTip label={t("toolbar.redoTooltip")}>
            <button
              type="button"
              className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
              aria-label={t("toolbar.redo")}
              onClick={redoEdits}
              disabled={!sheetInfo || isBusy || !canRedoEdits}
            >
              <Redo2 size={15} aria-hidden />
            </button>
          </IconEditorToolbarTip>
        </div>
        <div className="tm-icon-editor-toolbar-divider" aria-hidden />
        <div className="tm-icon-editor-toolbar-group">
          <IconEditorToolbarTip label={saveTooltip}>
            <button
              type="button"
              className={`tm-primary-btn tm-icon-editor-viewport-hud-save ${saveStatusClass}`}
              aria-label={saveTooltip}
              onClick={() => saveOffsets().catch(() => {})}
              disabled={!sheetInfo || isBusy}
            >
              <Save size={15} aria-hidden />
              {isBusy ? t("saveStatus.saving") : saveStatusLabel}
            </button>
          </IconEditorToolbarTip>
        </div>
        <div className="tm-icon-editor-toolbar-divider" aria-hidden />
        <div className="tm-icon-editor-toolbar-group">
          <div className="tm-icon-editor-zoom-row">
            <IconEditorToolbarTip label={t("toolbar.zoomOut")}>
              <button
                type="button"
                className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
                aria-label={t("toolbar.zoomOut")}
                onClick={() => setZoom((value) => clampZoom(value - 0.1))}
              >
                <ZoomOut size={15} aria-hidden />
              </button>
            </IconEditorToolbarTip>
            <span className="chip">{Math.round(zoom * 100)}%</span>
            <IconEditorToolbarTip label={t("toolbar.zoomIn")}>
              <button
                type="button"
                className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
                aria-label={t("toolbar.zoomIn")}
                onClick={() => setZoom((value) => clampZoom(value + 0.1))}
              >
                <ZoomIn size={15} aria-hidden />
              </button>
            </IconEditorToolbarTip>
            <IconEditorToolbarTip
              label={t("toolbar.resetZoomTooltip", {
                percent: Math.round(autoResolutionZoom * 100),
              })}
            >
              <button
                type="button"
                className="tm-icon-editor-toolbar-btn tm-icon-editor-toolbar-btn--icon-only"
                aria-label={t("toolbar.resetZoom")}
                onClick={() => setZoom(autoResolutionZoom)}
              >
                <RotateCcw size={15} aria-hidden />
              </button>
            </IconEditorToolbarTip>
          </div>
        </div>
        <div className="tm-icon-editor-toolbar-divider" aria-hidden />
        <div className="tm-icon-editor-toolbar-group">
          <IconEditorToolbarTip label={t("toolbar.hideGlowTooltip")}>
            <label className="checkbox tm-icon-editor-hide-glow tm-icon-editor-viewport-hud-hide-glow">
              <input
                type="checkbox"
                checked={hideGlow}
                onChange={(event) => setHideGlow(event.target.checked)}
              />
              {t("toolbar.hideGlow")}
            </label>
          </IconEditorToolbarTip>
          <IconEditorToolbarTip label={t("toolbar.hideBorderTooltip")}>
            <label className="checkbox tm-icon-editor-hide-border tm-icon-editor-viewport-hud-hide-border">
              <input
                type="checkbox"
                checked={hideLayerBorders}
                onChange={(event) => setHideLayerBorders(event.target.checked)}
              />
              {t("toolbar.hideBorder")}
            </label>
          </IconEditorToolbarTip>
        </div>
        </div>
      </header>
      {toolbarError ? (
        <p className="error">
          <Search size={14} />
          <button
            type="button"
            className="tm-icon-editor-error-link"
            onClick={() => setIsErrorDetailOpen(true)}
            title={t("dialogs.openErrorDetails")}
          >
            {toolbarError}
          </button>
        </p>
      ) : null}
      {renameConflict ? (
        <div
          className="tm-icon-editor-confirm-dialog-backdrop"
          onClick={() => setRenameConflict(null)}
          role="presentation"
        >
          <div
            className="tm-icon-editor-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("dialogs.renameConflictAria")}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{t("dialogs.nameAlreadyInUse")}</h3>
            <p>
              {t("dialogs.renameConflictDescription", {
                targetName: renameConflict.targetStem,
                currentName: currentSheetStem,
              })}
            </p>
            <div className="tm-icon-editor-confirm-dialog-actions">
              <button type="button" onClick={() => setRenameConflict(null)} disabled={isBusy}>
                {t("common:cancel")}
              </button>
              <button
                type="button"
                className="tm-icon-editor-confirm-dialog-primary"
                onClick={() => swapRenameSheet().catch(() => {})}
                disabled={isBusy}
              >
                {t("dialogs.swapNames")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isErrorDetailOpen && toolbarErrorDetail ? (
        <div
          className="tm-icon-editor-error-dialog-backdrop"
          onClick={() => setIsErrorDetailOpen(false)}
          role="presentation"
        >
          <div
            className="tm-icon-editor-error-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("dialogs.errorDetailsAria")}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{t("dialogs.errorDetailsTitle")}</h3>
            <pre>{toolbarErrorDetail}</pre>
            <div className="tm-icon-editor-error-dialog-actions">
              <button type="button" onClick={() => setIsErrorDetailOpen(false)}>
                {t("common:close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="tm-icon-editor-body">
        <div className="tm-icon-editor-viewport">
          <div className="tm-icon-editor-viewport-main">
            <div className="tm-icon-editor-stage-shell">
              <div
                ref={stageScrollPortRef}
                className={`tm-icon-editor-stage-scrollport${isMiddlePanning ? " tm-icon-editor-stage-scrollport--panning" : ""}`}
                onWheel={onZoomWheel}
                onScroll={clampScrollPortScroll}
                onPointerDown={onScrollPortPointerDown}
                onPointerMove={onScrollPortPointerMove}
                onPointerUp={endScrollPortPan}
                onPointerCancel={endScrollPortPan}
                title={t("viewport.panAndZoomHelp")}
              >
                <div
                  className="tm-icon-editor-stage-zoom-track"
                  style={{
                    width: `${zoomTrackLayoutWidth}px`,
                    minHeight: `${zoomTrackLayoutHeight}px`,
                  }}
                >
                  <div
                    className="tm-icon-editor-stage-scale-slot"
                    style={{
                      width: `${zoomTrackLayoutWidth}px`,
                      height: `${zoomTrackLayoutHeight}px`,
                    }}
                  >
                    <div
                      ref={stageElementRef}
                      className={`tm-icon-editor-stage tm-icon-editor-stage--in-scrollport${
                        hideLayerBorders ? " tm-icon-editor-stage--hide-layer-borders" : ""
                      }`}
                      style={{
                        position: "absolute",
                        left: `${stagePaintOffsetX}px`,
                        top: `${stagePaintOffsetY}px`,
                        width: `${stageRenderWidth}px`,
                        height: `${STAGE_BASE_HEIGHT}px`,
                        transform: `scale(${combinedViewScale})`,
                        transformOrigin: `${STAGE_ORIGIN_X}px ${stageOriginY}px`,
                      }}
                    >
                <div className="tm-icon-editor-background-stack">
                  {backgroundLayerEntries.map((layer) => {
                    const tintColor = layer.id === "gameFloor" ? "#0066ff" : "#287dff";
                    if (layer.mode !== "tile") {
                      const sliceCount = Math.max(1, Math.ceil(stageRenderWidth / STAGE_BASE_WIDTH));
                      return (
                        <div
                          key={layer.id}
                          className="tm-icon-editor-bg-layer-wrap tm-icon-editor-bg-layer-wrap--cover"
                          style={{ zIndex: layer.zIndex, opacity: layer.opacity ?? 1 }}
                        >
                          {Array.from({ length: sliceCount }).map((_, sliceIndex) => (
                            <div
                              key={`${layer.id}-${sliceIndex}`}
                              className="tm-icon-editor-bg-image tm-icon-editor-bg-slice-cover tm-icon-editor-bg-tinted"
                              style={{
                                left: `${sliceIndex * STAGE_BASE_WIDTH - (sliceIndex > 0 ? 1 : 0)}px`,
                                width: `${STAGE_BASE_WIDTH + (sliceIndex > 0 ? 1 : 0)}px`,
                                height: `${STAGE_BASE_HEIGHT}px`,
                                backgroundImage: `linear-gradient(${tintColor}, ${tintColor}), url("${layer.resolvedSrc}")`,
                                backgroundPosition: layer.objectPosition ?? "center center",
                              }}
                            />
                          ))}
                        </div>
                      );
                    }

                    const tileWidth = Math.max(1, layer.tileWidth ?? 256);
                    const tileHeight = Math.max(1, layer.tileHeight ?? 256);
                    const repeatX = Math.max(1, layer.repeatX ?? Math.ceil(stageRenderWidth / tileWidth));
                    const repeatY = Math.max(1, layer.repeatY ?? Math.ceil(STAGE_BASE_HEIGHT / tileHeight));
                    const baseY = (() => {
                      if (!layer.anchorBottom) {
                        return 0;
                      }
                      if (layer.id === "gameFloor") {
                        return STAGE_BASE_HEIGHT - repeatY * tileHeight * FLOOR_VISIBLE_FRACTION;
                      }
                      return STAGE_BASE_HEIGHT - repeatY * tileHeight;
                    })();

                    return (
                      <div
                        key={layer.id}
                        className="tm-icon-editor-bg-layer-wrap tm-icon-editor-bg-layer-wrap--tile"
                        style={{ zIndex: layer.zIndex, opacity: layer.opacity ?? 1 }}
                      >
                        {layer.id === "gameFloor" ? (
                          <div
                            className="tm-icon-editor-floor-divider"
                            style={{
                              top: `${baseY}px`,
                              width: `${stageRenderWidth}px`,
                            }}
                            aria-hidden
                          />
                        ) : null}
                        <div className="tm-icon-editor-bg-tile-layer">
                          {Array.from({ length: repeatY }).map((_, row) =>
                            Array.from({ length: repeatX }).map((__, col) => (
                              <div
                                key={`${layer.id}-${row}-${col}`}
                                className="tm-icon-editor-bg-image tm-icon-editor-bg-image-tile tm-icon-editor-bg-tinted"
                                style={{
                                  width: `${tileWidth}px`,
                                  height: `${tileHeight}px`,
                                  left: `${col * tileWidth}px`,
                                  top: `${baseY + row * tileHeight}px`,
                                  backgroundImage: `linear-gradient(${tintColor}, ${tintColor}), url("${layer.resolvedSrc}")`,
                                  backgroundPosition: "center center",
                                }}
                              />
                            )),
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {isRobotIcon ? (
                  <>
                    {!hideGlow ? (
                      <>
                        {ROBOT_PART_DRAW_ORDER.map((partId, glowStackIndex) => {
                          const glowLayer = layers.find(
                            (l) => l.robotPartId === partId && l.role === "glow",
                          );
                          if (!glowLayer) {
                            return null;
                          }
                          const primaryLayer = layers.find(
                            (l) => l.robotPartId === partId && l.role === "primary",
                          );
                          if (!primaryLayer) {
                            return null;
                          }
                          const primaryOffset = primaryLayer.offset;
                          const viewNudge = ROBOT_PART_VIEW_OFFSET[partId];
                          const baseX = STAGE_ORIGIN_X + primaryOffset.x * OFFSET_SCALE + viewNudge.x;
                          const baseY = stageOriginY - primaryOffset.y * OFFSET_SCALE + viewNudge.y;
                          const localDeltaX = (glowLayer.offset.x - primaryOffset.x) * OFFSET_SCALE;
                          const localDeltaY = -(glowLayer.offset.y - primaryOffset.y) * OFFSET_SCALE;
                          const displayCanvas = displayFrameCanvases[glowLayer.frameName];
                          const displayW = displayCanvas
                            ? Math.max(1, displayCanvas.width)
                            : Math.max(1, glowLayer.frame.spriteSize.width) * ICON_VISUAL_SCALE;
                          const displayH = displayCanvas
                            ? Math.max(1, displayCanvas.height)
                            : Math.max(1, glowLayer.frame.spriteSize.height) * ICON_VISUAL_SCALE;
                          return (
                            <div
                              key={`robot-part-${partId}-glow-back`}
                              className={`tm-icon-editor-robot-part-wrap tm-icon-editor-robot-part-wrap--${partId}`}
                              style={{
                                left: `${baseX}px`,
                                top: `${baseY}px`,
                                zIndex: ROBOT_GLOW_BACK_Z_BASE + glowStackIndex,
                              }}
                            >
                              <div
                                className={`tm-icon-editor-layer tm-icon-editor-layer-glow ${
                                  inspectorRole === "glow" ? "tm-icon-editor-layer-selected" : ""
                                }`}
                                data-frame-name={glowLayer.frameName}
                                data-part-id={partId}
                                style={{
                                  left: `${localDeltaX}px`,
                                  top: `${localDeltaY}px`,
                                  width: `${displayW}px`,
                                  height: `${displayH}px`,
                                  zIndex: 0,
                                }}
                                onPointerDown={(event) => onLayerPointerDown("glow", event)}
                                onPointerMove={onLayerPointerMove}
                                onPointerUp={onLayerPointerUp}
                                onPointerCancel={onLayerPointerUp}
                              >
                                <LayerCanvas
                                  sourceCanvas={displayFrameCanvases[glowLayer.frameName] ?? null}
                                  tint={glowLayer.tint}
                                />
                              </div>
                            </div>
                          );
                        })}
                        {ROBOT_ECHO_PART_STACK.map((partId, echoGlowStackIndex) => {
                          const glowLayer = layers.find(
                            (l) => l.robotPartId === partId && l.role === "glow",
                          );
                          if (!glowLayer) {
                            return null;
                          }
                          const primaryLayer = layers.find(
                            (l) => l.robotPartId === partId && l.role === "primary",
                          );
                          if (!primaryLayer) {
                            return null;
                          }
                          const primaryOffset = primaryLayer.offset;
                          const { baseX, baseY } = computeRobotEchoWrapAnchor(
                            partId,
                            primaryOffset,
                            stageOriginY,
                          );
                          const localDeltaX = (glowLayer.offset.x - primaryOffset.x) * OFFSET_SCALE;
                          const localDeltaY = -(glowLayer.offset.y - primaryOffset.y) * OFFSET_SCALE;
                          const displayCanvas = displayFrameCanvases[glowLayer.frameName];
                          const displayW = displayCanvas
                            ? Math.max(1, displayCanvas.width)
                            : Math.max(1, glowLayer.frame.spriteSize.width) * ICON_VISUAL_SCALE;
                          const displayH = displayCanvas
                            ? Math.max(1, displayCanvas.height)
                            : Math.max(1, glowLayer.frame.spriteSize.height) * ICON_VISUAL_SCALE;
                          return (
                            <div
                              key={`robot-part-${partId}-echo-glow`}
                              className={`tm-icon-editor-robot-part-wrap tm-icon-editor-robot-part-wrap-echo tm-icon-editor-robot-part-wrap-echo--glow tm-icon-editor-robot-part-echo--${partId}`}
                              style={{
                                left: `${baseX}px`,
                                top: `${baseY}px`,
                                zIndex: ROBOT_ECHO_GLOW_Z_BASE + echoGlowStackIndex,
                              }}
                              aria-hidden
                            >
                              <div
                                className="tm-icon-editor-layer tm-icon-editor-layer-glow"
                                data-frame-name=""
                                data-part-id=""
                                style={{
                                  left: `${localDeltaX}px`,
                                  top: `${localDeltaY}px`,
                                  width: `${displayW}px`,
                                  height: `${displayH}px`,
                                  zIndex: 0,
                                }}
                                aria-hidden
                              >
                                <LayerCanvas
                                  sourceCanvas={displayFrameCanvases[glowLayer.frameName] ?? null}
                                  tint={glowLayer.tint}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : null}
                    {ROBOT_ECHO_PART_STACK.map((partId) => {
                      const partLayers = layers.filter(
                        (l) => l.robotPartId === partId && l.role !== "glow",
                      );
                      if (partLayers.length === 0) {
                        return null;
                      }
                      const primaryLayer = partLayers.find((l) => l.role === "primary");
                      if (!primaryLayer) {
                        return null;
                      }
                      const primaryOffset = primaryLayer.offset;
                      const { baseX, baseY } = computeRobotEchoWrapAnchor(
                        partId,
                        primaryOffset,
                        stageOriginY,
                      );
                      const echoZ = ROBOT_ECHO_Z[partId] ?? 120;
                      return (
                        <div
                          key={`robot-part-${partId}-echo`}
                          className={`tm-icon-editor-robot-part-wrap tm-icon-editor-robot-part-wrap-echo tm-icon-editor-robot-part-echo--${partId}`}
                          style={{
                            left: `${baseX}px`,
                            top: `${baseY}px`,
                            zIndex: echoZ,
                          }}
                          aria-hidden
                        >
                          {partLayers.map((layer) => {
                            const roleZOffset =
                              layer.role === "extra"
                                ? 3
                                : layer.role === "primary"
                                  ? 2
                                  : layer.role === "secondary"
                                    ? 1
                                    : 0;
                            const localDeltaX = (layer.offset.x - primaryOffset.x) * OFFSET_SCALE;
                            const localDeltaY = -(layer.offset.y - primaryOffset.y) * OFFSET_SCALE;
                            const displayCanvas = displayFrameCanvases[layer.frameName];
                            const displayW = displayCanvas
                              ? Math.max(1, displayCanvas.width)
                              : Math.max(1, layer.frame.spriteSize.width) * ICON_VISUAL_SCALE;
                            const displayH = displayCanvas
                              ? Math.max(1, displayCanvas.height)
                              : Math.max(1, layer.frame.spriteSize.height) * ICON_VISUAL_SCALE;
                            return (
                              <div
                                key={`echo-${layer.role}-${layer.frameName}`}
                                className={`tm-icon-editor-layer tm-icon-editor-layer-${layer.role}`}
                                data-frame-name=""
                                data-part-id=""
                                style={{
                                  left: `${localDeltaX}px`,
                                  top: `${localDeltaY}px`,
                                  width: `${displayW}px`,
                                  height: `${displayH}px`,
                                  zIndex: roleZOffset,
                                }}
                                aria-hidden
                              >
                                <LayerCanvas
                                  sourceCanvas={displayFrameCanvases[layer.frameName] ?? null}
                                  tint={layer.tint}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {ROBOT_PART_DRAW_ORDER.map((partId) => {
                      const partLayers = layers.filter(
                        (l) => l.robotPartId === partId && l.role !== "glow",
                      );
                      if (partLayers.length === 0) {
                        return null;
                      }
                      const primaryLayer = partLayers.find((l) => l.role === "primary");
                      if (!primaryLayer) {
                        return null;
                      }
                      const primaryOffset = primaryLayer.offset;
                      const viewNudge = ROBOT_PART_VIEW_OFFSET[partId];
                      const baseX = STAGE_ORIGIN_X + primaryOffset.x * OFFSET_SCALE + viewNudge.x;
                      const baseY = stageOriginY - primaryOffset.y * OFFSET_SCALE + viewNudge.y;
                      const robotPartZBase = ROBOT_PART_Z_BASE[partId];
                      return (
                        <div
                          key={`robot-part-${partId}`}
                          className={`tm-icon-editor-robot-part-wrap tm-icon-editor-robot-part-wrap--${partId}`}
                          style={{
                            left: `${baseX}px`,
                            top: `${baseY}px`,
                            zIndex: robotPartZBase,
                          }}
                        >
                          {partLayers.map((layer) => {
                            const roleZOffset =
                              layer.role === "extra"
                                ? 3
                                : layer.role === "primary"
                                  ? 2
                                  : layer.role === "secondary"
                                    ? 1
                                    : 0;
                            const localDeltaX = (layer.offset.x - primaryOffset.x) * OFFSET_SCALE;
                            const localDeltaY = -(layer.offset.y - primaryOffset.y) * OFFSET_SCALE;
                            const displayCanvas = displayFrameCanvases[layer.frameName];
                            const displayW = displayCanvas
                              ? Math.max(1, displayCanvas.width)
                              : Math.max(1, layer.frame.spriteSize.width) * ICON_VISUAL_SCALE;
                            const displayH = displayCanvas
                              ? Math.max(1, displayCanvas.height)
                              : Math.max(1, layer.frame.spriteSize.height) * ICON_VISUAL_SCALE;
                            return (
                              <div
                                key={`${layer.role}-${layer.frameName}`}
                                className={`tm-icon-editor-layer tm-icon-editor-layer-${layer.role} ${
                                  inspectorRole === layer.role ? "tm-icon-editor-layer-selected" : ""
                                }`}
                                data-frame-name={layer.frameName}
                                data-part-id={partId}
                                style={{
                                  left: `${localDeltaX}px`,
                                  top: `${localDeltaY}px`,
                                  width: `${displayW}px`,
                                  height: `${displayH}px`,
                                  zIndex: roleZOffset,
                                }}
                                onPointerDown={(event) => onLayerPointerDown(layer.role, event)}
                                onPointerMove={onLayerPointerMove}
                                onPointerUp={onLayerPointerUp}
                                onPointerCancel={onLayerPointerUp}
                              >
                                <LayerCanvas
                                  sourceCanvas={displayFrameCanvases[layer.frameName] ?? null}
                                  tint={layer.tint}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </>
                ) : isSpiderIcon ? (
                  <>
                    {!hideGlow ? (
                      <>
                        {SPIDER_PART_DRAW_ORDER.map((partId, glowStackIndex) => {
                          const glowLayer = layers.find(
                            (l) => l.robotPartId === partId && l.role === "glow",
                          );
                          if (!glowLayer) {
                            return null;
                          }
                          const primaryLayer = layers.find(
                            (l) => l.robotPartId === partId && l.role === "primary",
                          );
                          if (!primaryLayer) {
                            return null;
                          }
                          const primaryOffset = primaryLayer.offset;
                          const viewNudge = SPIDER_PART_VIEW_OFFSET[partId];
                          const baseX = STAGE_ORIGIN_X + primaryOffset.x * OFFSET_SCALE + viewNudge.x;
                          const baseY = stageOriginY - primaryOffset.y * OFFSET_SCALE + viewNudge.y;
                          const localDeltaX = (glowLayer.offset.x - primaryOffset.x) * OFFSET_SCALE;
                          const localDeltaY = -(glowLayer.offset.y - primaryOffset.y) * OFFSET_SCALE;
                          const displayCanvas = displayFrameCanvases[glowLayer.frameName];
                          const displayW = displayCanvas
                            ? Math.max(1, displayCanvas.width)
                            : Math.max(1, glowLayer.frame.spriteSize.width) * ICON_VISUAL_SCALE;
                          const displayH = displayCanvas
                            ? Math.max(1, displayCanvas.height)
                            : Math.max(1, glowLayer.frame.spriteSize.height) * ICON_VISUAL_SCALE;
                          return (
                            <div
                              key={`spider-part-${partId}-glow-back`}
                              className={`tm-icon-editor-spider-part-wrap tm-icon-editor-spider-part-wrap--${partId}`}
                              style={{
                                left: `${baseX}px`,
                                top: `${baseY}px`,
                                zIndex: SPIDER_GLOW_BACK_Z_BASE + glowStackIndex,
                              }}
                            >
                              <div
                                className={`tm-icon-editor-layer tm-icon-editor-layer-glow ${
                                  inspectorRole === "glow" ? "tm-icon-editor-layer-selected" : ""
                                }`}
                                data-frame-name={glowLayer.frameName}
                                data-part-id={partId}
                                style={{
                                  left: `${localDeltaX}px`,
                                  top: `${localDeltaY}px`,
                                  width: `${displayW}px`,
                                  height: `${displayH}px`,
                                  zIndex: 0,
                                }}
                                onPointerDown={(event) => onLayerPointerDown("glow", event)}
                                onPointerMove={onLayerPointerMove}
                                onPointerUp={onLayerPointerUp}
                                onPointerCancel={onLayerPointerUp}
                              >
                                <LayerCanvas
                                  sourceCanvas={displayFrameCanvases[glowLayer.frameName] ?? null}
                                  tint={glowLayer.tint}
                                />
                              </div>
                            </div>
                          );
                        })}
                        {(["flipH", "copy"] as const).map((variant, echoGlowStackIndex) => {
                          const echoPartId = "02";
                          const glowLayer = layers.find(
                            (l) => l.robotPartId === echoPartId && l.role === "glow",
                          );
                          const primaryLayer = layers.find(
                            (l) => l.robotPartId === echoPartId && l.role === "primary",
                          );
                          if (!glowLayer || !primaryLayer) {
                            return null;
                          }
                          const primaryOffset = primaryLayer.offset;
                          const { baseX, baseY } = computeSpiderFrontLegEchoWrapAnchor(
                            variant,
                            primaryOffset,
                            stageOriginY,
                          );
                          const localDeltaX = (glowLayer.offset.x - primaryOffset.x) * OFFSET_SCALE;
                          const localDeltaY = -(glowLayer.offset.y - primaryOffset.y) * OFFSET_SCALE;
                          const displayCanvas = displayFrameCanvases[glowLayer.frameName];
                          const displayW = displayCanvas
                            ? Math.max(1, displayCanvas.width)
                            : Math.max(1, glowLayer.frame.spriteSize.width) * ICON_VISUAL_SCALE;
                          const displayH = displayCanvas
                            ? Math.max(1, displayCanvas.height)
                            : Math.max(1, glowLayer.frame.spriteSize.height) * ICON_VISUAL_SCALE;
                          return (
                            <div
                              key={`spider-front-leg-echo-${variant}-glow`}
                              className={`tm-icon-editor-spider-part-wrap tm-icon-editor-spider-part-wrap-echo tm-icon-editor-spider-part-wrap-echo--glow tm-icon-editor-spider-front-leg-echo--${variant}`}
                              style={{
                                left: `${baseX}px`,
                                top: `${baseY}px`,
                                zIndex: SPIDER_FRONT_LEG_ECHO_GLOW_Z_BASE + echoGlowStackIndex,
                              }}
                              aria-hidden
                            >
                              <div
                                className="tm-icon-editor-layer tm-icon-editor-layer-glow"
                                data-frame-name=""
                                data-part-id=""
                                style={{
                                  left: `${localDeltaX}px`,
                                  top: `${localDeltaY}px`,
                                  width: `${displayW}px`,
                                  height: `${displayH}px`,
                                  zIndex: 0,
                                }}
                                aria-hidden
                              >
                                <LayerCanvas
                                  sourceCanvas={displayFrameCanvases[glowLayer.frameName] ?? null}
                                  tint={glowLayer.tint}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : null}
                    {(["flipH", "copy"] as const).map((variant) => {
                      const echoPartId = "02";
                      const partLayers = layers.filter(
                        (l) => l.robotPartId === echoPartId && l.role !== "glow",
                      );
                      if (partLayers.length === 0) {
                        return null;
                      }
                      const primaryLayer = partLayers.find((l) => l.role === "primary");
                      if (!primaryLayer) {
                        return null;
                      }
                      const primaryOffset = primaryLayer.offset;
                      const { baseX, baseY } = computeSpiderFrontLegEchoWrapAnchor(
                        variant,
                        primaryOffset,
                        stageOriginY,
                      );
                      const echoZ =
                        variant === "flipH"
                          ? SPIDER_FRONT_LEG_ECHO_SOLID_Z_FLIPPED
                          : SPIDER_FRONT_LEG_ECHO_SOLID_Z_COPY;
                      return (
                        <div
                          key={`spider-front-leg-echo-${variant}`}
                          className={`tm-icon-editor-spider-part-wrap tm-icon-editor-spider-part-wrap-echo tm-icon-editor-spider-front-leg-echo--${variant}`}
                          style={{
                            left: `${baseX}px`,
                            top: `${baseY}px`,
                            zIndex: echoZ,
                          }}
                          aria-hidden
                        >
                          {partLayers.map((layer) => {
                            const roleZOffset =
                              layer.role === "extra"
                                ? 3
                                : layer.role === "primary"
                                  ? 2
                                  : layer.role === "secondary"
                                    ? 1
                                    : 0;
                            const localDeltaX = (layer.offset.x - primaryOffset.x) * OFFSET_SCALE;
                            const localDeltaY = -(layer.offset.y - primaryOffset.y) * OFFSET_SCALE;
                            const displayCanvas = displayFrameCanvases[layer.frameName];
                            const displayW = displayCanvas
                              ? Math.max(1, displayCanvas.width)
                              : Math.max(1, layer.frame.spriteSize.width) * ICON_VISUAL_SCALE;
                            const displayH = displayCanvas
                              ? Math.max(1, displayCanvas.height)
                              : Math.max(1, layer.frame.spriteSize.height) * ICON_VISUAL_SCALE;
                            return (
                              <div
                                key={`spider-echo-${variant}-${layer.role}-${layer.frameName}`}
                                className={`tm-icon-editor-layer tm-icon-editor-layer-${layer.role}`}
                                data-frame-name=""
                                data-part-id=""
                                style={{
                                  left: `${localDeltaX}px`,
                                  top: `${localDeltaY}px`,
                                  width: `${displayW}px`,
                                  height: `${displayH}px`,
                                  zIndex: roleZOffset,
                                }}
                                aria-hidden
                              >
                                <LayerCanvas
                                  sourceCanvas={displayFrameCanvases[layer.frameName] ?? null}
                                  tint={layer.tint}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {SPIDER_PART_DRAW_ORDER.map((partId) => {
                      const partLayers = layers.filter(
                        (l) => l.robotPartId === partId && l.role !== "glow",
                      );
                      if (partLayers.length === 0) {
                        return null;
                      }
                      const primaryLayer = partLayers.find((l) => l.role === "primary");
                      if (!primaryLayer) {
                        return null;
                      }
                      const primaryOffset = primaryLayer.offset;
                      const viewNudge = SPIDER_PART_VIEW_OFFSET[partId];
                      const baseX = STAGE_ORIGIN_X + primaryOffset.x * OFFSET_SCALE + viewNudge.x;
                      const baseY = stageOriginY - primaryOffset.y * OFFSET_SCALE + viewNudge.y;
                      const spiderPartZBase = SPIDER_PART_Z_BASE[partId];
                      return (
                        <div
                          key={`spider-part-${partId}`}
                          className={`tm-icon-editor-spider-part-wrap tm-icon-editor-spider-part-wrap--${partId}`}
                          style={{
                            left: `${baseX}px`,
                            top: `${baseY}px`,
                            zIndex: spiderPartZBase,
                          }}
                        >
                          {partLayers.map((layer) => {
                            const roleZOffset =
                              layer.role === "extra"
                                ? 3
                                : layer.role === "primary"
                                  ? 2
                                  : layer.role === "secondary"
                                    ? 1
                                    : 0;
                            const localDeltaX = (layer.offset.x - primaryOffset.x) * OFFSET_SCALE;
                            const localDeltaY = -(layer.offset.y - primaryOffset.y) * OFFSET_SCALE;
                            const displayCanvas = displayFrameCanvases[layer.frameName];
                            const displayW = displayCanvas
                              ? Math.max(1, displayCanvas.width)
                              : Math.max(1, layer.frame.spriteSize.width) * ICON_VISUAL_SCALE;
                            const displayH = displayCanvas
                              ? Math.max(1, displayCanvas.height)
                              : Math.max(1, layer.frame.spriteSize.height) * ICON_VISUAL_SCALE;
                            return (
                              <div
                                key={`${layer.role}-${layer.frameName}`}
                                className={`tm-icon-editor-layer tm-icon-editor-layer-${layer.role} ${
                                  inspectorRole === layer.role ? "tm-icon-editor-layer-selected" : ""
                                }`}
                                data-frame-name={layer.frameName}
                                data-part-id={partId}
                                style={{
                                  left: `${localDeltaX}px`,
                                  top: `${localDeltaY}px`,
                                  width: `${displayW}px`,
                                  height: `${displayH}px`,
                                  zIndex: roleZOffset,
                                }}
                                onPointerDown={(event) => onLayerPointerDown(layer.role, event)}
                                onPointerMove={onLayerPointerMove}
                                onPointerUp={onLayerPointerUp}
                                onPointerCancel={onLayerPointerUp}
                              >
                                <LayerCanvas
                                  sourceCanvas={displayFrameCanvases[layer.frameName] ?? null}
                                  tint={layer.tint}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </>
                ) : layers.map((layer) => {
                      const capsuleViewYOffset =
                        layer.role === "capsule" ? capsuleStageVerticalNudge : 0;
                      const anchorCenterX = STAGE_ORIGIN_X + layer.offset.x * OFFSET_SCALE;
                      const anchorCenterY =
                        stageOriginY - layer.offset.y * OFFSET_SCALE + capsuleViewYOffset;
                      const displayCanvas = displayFrameCanvases[layer.frameName];
                      const displayW = displayCanvas
                        ? Math.max(1, displayCanvas.width)
                        : Math.max(1, layer.frame.spriteSize.width) * ICON_VISUAL_SCALE;
                      const displayH = displayCanvas
                        ? Math.max(1, displayCanvas.height)
                        : Math.max(1, layer.frame.spriteSize.height) * ICON_VISUAL_SCALE;
                      return (
                        <div
                          key={`${layer.role}-${layer.frameName}`}
                          className={`tm-icon-editor-layer tm-icon-editor-layer-${layer.role} ${
                            inspectorRole === layer.role ? "tm-icon-editor-layer-selected" : ""
                          }`}
                          data-frame-name={layer.frameName}
                          data-part-id=""
                          style={{
                            left: `${anchorCenterX}px`,
                            top: `${anchorCenterY}px`,
                            width: `${displayW}px`,
                            height: `${displayH}px`,
                          }}
                          onPointerDown={(event) => onLayerPointerDown(layer.role, event)}
                          onPointerMove={onLayerPointerMove}
                          onPointerUp={onLayerPointerUp}
                          onPointerCancel={onLayerPointerUp}
                        >
                          <LayerCanvas
                            sourceCanvas={displayFrameCanvases[layer.frameName] ?? null}
                            tint={layer.tint}
                          />
                        </div>
                      );
                    })}
                    </div>
                  </div>
                </div>
              </div>
            <aside
              className={`tm-icon-editor-roles-overlay${
                framesPanelCollapsed ? " tm-icon-editor-side-panel--collapsed" : ""
              }`}
              aria-label={t("frames.panelAria")}
            >
              <div className="tm-icon-editor-side-panel-head">
                <div className="tm-icon-editor-side-panel-head-copy">
                  <h3>
                    <Layers3 size={14} strokeWidth={2} aria-hidden />
                    {t("frames.title")}
                  </h3>
                  <p className="tm-icon-editor-side-panel-subtitle">
                    {t("frames.subtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  className="tm-icon-editor-side-panel-toggle"
                  onClick={() => setFramesPanelCollapsed((value) => !value)}
                  aria-expanded={!framesPanelCollapsed}
                  aria-label={
                    framesPanelCollapsed
                      ? t("frames.expandPanelAria")
                      : t("frames.collapsePanelAria")
                  }
                  title={
                    framesPanelCollapsed
                      ? t("frames.showPanel")
                      : t("frames.hidePanel")
                  }
                >
                  <span className="tm-icon-editor-side-panel-toggle-icon" aria-hidden>
                    <ChevronLeft size={15} />
                  </span>
                </button>
              </div>
              <div className="tm-icon-editor-side-panel-body" aria-hidden={framesPanelCollapsed}>
                <div className="tm-icon-editor-side-panel-body-inner">
              {isRobotIcon ? (
                <div
                  className="tm-icon-editor-part-tabs"
                  aria-label={t("frames.visualSelectorAria")}
                >
                  {ROBOT_PART_DRAW_ORDER.map((partId) => (
                    <button
                      key={partId}
                      type="button"
                      className={`tm-icon-editor-side-panel-tab${
                        selectedRobotPartId === partId ? " active" : ""
                      }`}
                      onClick={() => {
                        setSelectedRobotPartId(partId);
                        setInspectorFrameOverride(null);
                      }}
                    >
                      {t(ROBOT_PART_KEYS[partId])}
                    </button>
                  ))}
                </div>
              ) : isSpiderIcon ? (
                <div
                  className="tm-icon-editor-part-tabs"
                  aria-label={t("frames.visualSelectorAria")}
                >
                  {SPIDER_PART_DRAW_ORDER.map((partId) => (
                    <button
                      key={partId}
                      type="button"
                      className={`tm-icon-editor-side-panel-tab${
                        selectedSpiderPartId === partId ? " active" : ""
                      }`}
                      onClick={() => {
                        setSelectedSpiderPartId(partId);
                        setInspectorFrameOverride(null);
                      }}
                    >
                      {t(SPIDER_PART_KEYS[partId])}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="tm-icon-editor-roles-scroll">
                <div className="tm-icon-editor-role-grid">{roleControls}</div>
              </div>
                </div>
              </div>
            </aside>
            <aside
              className={`tm-icon-editor-plist-overlay${
                plistPanelCollapsed ? " tm-icon-editor-side-panel--collapsed" : ""
              }`}
              aria-label={t("plist.panelAria")}
            >
              <div className="tm-icon-editor-side-panel-head">
                <div className="tm-icon-editor-side-panel-head-copy">
                  <h3>
                    <FileCode2 size={14} strokeWidth={2} aria-hidden />
                    {t("plist.title")}
                  </h3>
                  <p className="tm-icon-editor-side-panel-subtitle">
                    {t("plist.subtitle")}
                  </p>
                </div>
                <button
                  type="button"
                  className="tm-icon-editor-side-panel-toggle"
                  onClick={() => setPlistPanelCollapsed((value) => !value)}
                  aria-expanded={!plistPanelCollapsed}
                  aria-label={
                    plistPanelCollapsed
                      ? t("plist.expandPanelAria")
                      : t("plist.collapsePanelAria")
                  }
                  title={
                    plistPanelCollapsed
                      ? t("plist.showPanel")
                      : t("plist.hidePanel")
                  }
                >
                  <span className="tm-icon-editor-side-panel-toggle-icon" aria-hidden>
                    <ChevronRight size={15} />
                  </span>
                </button>
              </div>
              <div className="tm-icon-editor-side-panel-body" aria-hidden={plistPanelCollapsed}>
                <div className="tm-icon-editor-side-panel-body-inner">
              {isRobotIcon ? (
                <div
                  className="tm-icon-editor-part-tabs"
                  aria-label={t("frames.visualSelectorAria")}
                >
                  {ROBOT_PART_DRAW_ORDER.map((partId) => (
                    <button
                      key={partId}
                      type="button"
                      className={`tm-icon-editor-side-panel-tab${
                        selectedRobotPartId === partId ? " active" : ""
                      }`}
                      onClick={() => {
                        setSelectedRobotPartId(partId);
                        setInspectorFrameOverride(null);
                      }}
                    >
                      {t(ROBOT_PART_KEYS[partId])}
                    </button>
                  ))}
                </div>
              ) : isSpiderIcon ? (
                <div
                  className="tm-icon-editor-part-tabs"
                  aria-label={t("frames.visualSelectorAria")}
                >
                  {SPIDER_PART_DRAW_ORDER.map((partId) => (
                    <button
                      key={partId}
                      type="button"
                      className={`tm-icon-editor-side-panel-tab${
                        selectedSpiderPartId === partId ? " active" : ""
                      }`}
                      onClick={() => {
                        setSelectedSpiderPartId(partId);
                        setInspectorFrameOverride(null);
                      }}
                    >
                      {t(SPIDER_PART_KEYS[partId])}
                    </button>
                  ))}
                </div>
              ) : null}
              <div
                className="tm-icon-editor-plist-role-tabs"
                role="tablist"
                aria-label={t("plist.roleTabsAria")}
              >
                {roleOrder.map((role) => (
                  <button
                    key={role}
                    type="button"
                    role="tab"
                    aria-selected={inspectorRole === role}
                    className={`tm-icon-editor-side-panel-tab tm-icon-editor-side-panel-tab-${role}${
                      inspectorRole === role ? " active" : ""
                    }`}
                    onClick={() => {
                      setInspectorRole(role);
                      setInspectorFrameOverride(null);
                    }}
                  >
                    {t(`roles.${role}`)}
                  </button>
                ))}
              </div>
              <div className="tm-icon-editor-plist-scroll">
                {!effectiveInspectorFrameName ? (
                  <div className="tm-icon-editor-panel-empty">
                    <FileCode2 size={20} strokeWidth={1.75} aria-hidden />
                    <p className="tm-icon-editor-panel-empty-title">
                      {t("plist.noFrameSelected")}
                    </p>
                    <p className="tm-icon-editor-panel-empty-hint">
                      {t("plist.noFrameSelectedHint")}
                    </p>
                  </div>
                ) : !inspectorFrame || !inspectorEffectiveOffset || !inspectorTrim ? (
                  <div className="tm-icon-editor-panel-empty tm-icon-editor-panel-empty-warning">
                    <FileCode2 size={20} strokeWidth={1.75} aria-hidden />
                    <p className="tm-icon-editor-panel-empty-title">
                      {t("plist.frameUnavailable")}
                    </p>
                    <p className="tm-icon-editor-panel-empty-hint">
                      {t("plist.frameUnavailableHint", {
                        frameName: effectiveInspectorFrameName,
                      })}
                    </p>
                  </div>
                ) : (
                  <div className="tm-icon-editor-plist-content">
                    <div className="tm-icon-editor-plist-frame-head">
                      <span className="tm-icon-editor-plist-section-label">
                        {t("plist.activeFrame")}
                      </span>
                      <div className="tm-icon-editor-plist-frame-row">
                        <code className="tm-icon-editor-plist-frame-name" title={effectiveInspectorFrameName}>
                          {effectiveInspectorFrameName}
                        </code>
                        <div className="tm-icon-editor-plist-rotate-actions">
                          <button
                            type="button"
                            className="tm-icon-editor-plist-rotate-btn"
                            aria-label={t("plist.rotateCounterClockwiseAria")}
                            title={t("plist.rotateCounterClockwiseTooltip")}
                            onClick={() => rotateFrame("counterClockwise")}
                            disabled={isBusy}
                          >
                            <RotateCcw size={15} strokeWidth={2} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="tm-icon-editor-plist-rotate-btn"
                            aria-label={t("plist.rotateClockwiseAria")}
                            title={t("plist.rotateClockwiseTooltip")}
                            onClick={() => rotateFrame("clockwise")}
                            disabled={isBusy}
                          >
                            <RotateCw size={15} strokeWidth={2} aria-hidden />
                          </button>
                        </div>
                      </div>
                    </div>

                    <section className="tm-icon-editor-plist-section" aria-labelledby="plist-trim-title">
                      <h4 id="plist-trim-title" className="tm-icon-editor-plist-section-title">
                        {t("plist.trimInsets")}
                      </h4>
                      <div className="tm-icon-editor-plist-trim-grid">
                        <div className="tm-icon-editor-plist-metric">
                          <span className="tm-icon-editor-plist-metric-label">
                            {t("plist.left")}
                          </span>
                          <span className="tm-icon-editor-plist-metric-value">{inspectorTrim.left}</span>
                        </div>
                        <div className="tm-icon-editor-plist-metric">
                          <span className="tm-icon-editor-plist-metric-label">
                            {t("plist.top")}
                          </span>
                          <span className="tm-icon-editor-plist-metric-value">{inspectorTrim.top}</span>
                        </div>
                        <div className="tm-icon-editor-plist-metric">
                          <span className="tm-icon-editor-plist-metric-label">
                            {t("plist.right")}
                          </span>
                          <span className="tm-icon-editor-plist-metric-value">{inspectorTrim.right}</span>
                        </div>
                        <div className="tm-icon-editor-plist-metric">
                          <span className="tm-icon-editor-plist-metric-label">
                            {t("plist.bottom")}
                          </span>
                          <span className="tm-icon-editor-plist-metric-value">{inspectorTrim.bottom}</span>
                        </div>
                      </div>
                    </section>

                    <section className="tm-icon-editor-plist-section" aria-labelledby="plist-offset-title">
                      <h4 id="plist-offset-title" className="tm-icon-editor-plist-section-title">
                        {t("plist.spriteOffset")}
                      </h4>
                      <div className="tm-icon-editor-plist-offset-grid">
                        <SpriteOffsetAxisControls
                          axis="x"
                          value={inspectorEffectiveOffset.x}
                          frameName={effectiveInspectorFrameName}
                          onBump={bumpSpriteOffset}
                          onSetAxis={setSpriteOffsetAxis}
                        />
                        <SpriteOffsetAxisControls
                          axis="y"
                          value={inspectorEffectiveOffset.y}
                          frameName={effectiveInspectorFrameName}
                          onBump={bumpSpriteOffset}
                          onSetAxis={setSpriteOffsetAxis}
                        />
                      </div>
                      <dl className="tm-icon-editor-plist-kv-list">
                        <div className="tm-icon-editor-plist-row">
                          <dt>{t("plist.mergedOffset")}</dt>
                          <dd title={t("plist.mergedOffsetTooltip")}>
                            {mergeOffsetFromNullifiedInput
                              ? formatPairF32(mergeOffsetFromNullifiedInput)
                              : "—"}
                          </dd>
                        </div>
                        <div className="tm-icon-editor-plist-row">
                          <dt>{t("plist.plistOffset")}</dt>
                          <dd>{formatPairF32(inspectorEffectiveOffset)}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="tm-icon-editor-plist-section" aria-labelledby="plist-atlas-title">
                      <h4 id="plist-atlas-title" className="tm-icon-editor-plist-section-title">
                        {t("plist.atlas")}
                      </h4>
                      <dl className="tm-icon-editor-plist-kv-list">
                        <div className="tm-icon-editor-plist-row">
                          <dt>{t("plist.spriteSize")}</dt>
                          <dd>
                            {formatIntPair(inspectorFrame.spriteSize.width, inspectorFrame.spriteSize.height)}
                          </dd>
                        </div>
                        <div className="tm-icon-editor-plist-row">
                          <dt>{t("plist.spriteSourceSize")}</dt>
                          <dd>
                            {formatIntPair(
                              inspectorFrame.spriteSourceSize.width,
                              inspectorFrame.spriteSourceSize.height,
                            )}
                          </dd>
                        </div>
                        <div className="tm-icon-editor-plist-row">
                          <dt>{t("plist.textureRect")}</dt>
                          <dd>{formatTextureRect(inspectorFrame.textureRect)}</dd>
                        </div>
                      </dl>
                    </section>
                  </div>
                )}
              </div>
                </div>
              </div>
            </aside>
            </div>
          </div>
        </div>
      </div>
      <div className="tm-icon-editor-bottom-bar">
        <div className="tm-icon-editor-tint-column">
          <div className="tm-icon-editor-tint-row">
            <div className="tm-icon-editor-tint-targets">
              {TINT_TARGETS.map((target) => (
                <button
                  key={target}
                  type="button"
                  className={`menu-btn ${activeTintTarget === target ? "active" : ""}`}
                  onClick={() => {
                    setActiveTintTarget(target);
                    setInspectorRole(target);
                  }}
                >
                  {t(`roles.${target}`)}
                </button>
              ))}
            </div>
            <div className="tm-icon-editor-tint-divider" aria-hidden />
          <div className="tm-icon-editor-palette">
            {ICON_EDITOR_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className={`tm-icon-editor-swatch ${
                  tintByTarget[activeTintTarget] === color ? "active" : ""
                }`}
                title={color}
                style={{ background: color }}
                onClick={() =>
                  setTintByTarget((previous) => ({ ...previous, [activeTintTarget]: color }))
                }
              />
            ))}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
