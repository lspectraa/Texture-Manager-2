import { useEffect, useRef, useCallback } from "react";
import { ParticleConfig } from "../../../domain/particleConfig";
import { type PreviewMode } from "../../../domain/gdParticleEffects";
import { ParticleEmitter } from "./particleSimulator";

// ─── Background type ──────────────────────────────────────────────────────────

/** Canvas background modes. "gd" uses the bundled Geometry Dash game background. */
export type ParticleBackground = "checkerboard" | "dark" | "gd";

const GD_BACKGROUND_SRC = "/icon-editor-bg/game-bg-01.png";
const GD_FLOOR_SRC = "/icon-editor-bg/ground-square-01.png";

/** Multiply tints shared with the Icon Editor GD stage. */
const GD_BACKGROUND_TINT = "#287dff";
const GD_FLOOR_TINT = "#0066ff";

/** Floor tile edge in scene pixels — same 245 px ground square the Icon Editor tiles. */
const GD_FLOOR_TILE = 245;
/** Height of the gradient seam drawn on the floor/background boundary. */
const GD_FLOOR_DIVIDER_HEIGHT = 3;
/**
 * Match Icon Editor: only this fraction of each floor tile is visible (top of the
 * texture = walk surface), anchored to the bottom of the stage.
 */
const FLOOR_VISIBLE_FRACTION = 0.25;

/**
 * Maps Cocos point-space particle units into preview scene pixels (UHD icons /
 * gamesheets / floor). Preview uses scale 2 (not GD's typical Cocos factor 4)
 * so the composition stays readable next to Icon Editor art. Zoom then
 * magnifies icons + particles together.
 */
const GD_PARTICLE_CONTENT_SCALE = 2;

/** Fallback cube edge when no preview icon is loaded (~typical UHD player cube). */
const FALLBACK_CUBE_SIZE = 120;

/** Scene-space Y of the walkable ground line for the current stage height. */
function groundLineY(sceneHeight: number): number {
  return Math.max(0, sceneHeight - GD_FLOOR_TILE * FLOOR_VISIBLE_FRACTION);
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ParticlePreviewCanvasProps {
  config: ParticleConfig;
  /** PNG data URL for the particle sprite, or null when no texture is loaded. */
  textureSrc: string | null;
  /** When false the emitter is paused (particles freeze in place). */
  running: boolean;
  background: ParticleBackground;
  /**
   * Scene magnification. 1 keeps the stage-sized scene; higher values zoom in
   * around the canvas centre. The canvas itself always fills its container.
   */
  zoom?: number;
  /**
   * Controls emitter-attach animation and silhouette drawing.
   * "static" (default) preserves drag-to-reposition behavior.
   */
  previewMode?: PreviewMode;
  /**
   * Increment this value to reset the emitter (kill all live particles
   * and restart emission from t=0). Useful for oneShot and speedBurst effects.
   */
  resetKey?: number;
  /**
   * When true, use the plist sourcePosition x/y as-is (Particle Designer mode).
   * When false (default / in-game GD mode), sourcePosition is zeroed at spawn.
   */
  usePlistSourcePosition?: boolean;
  /**
   * Optional random GD icon PNG data URL used instead of the generic cube silhouette
   * for drag / trail / speed-burst previews.
   */
  previewIconSrc?: string | null;
  /** Cocos node-origin X within `previewIconSrc` (Icon Editor / spriteOffset). */
  previewIconAnchorX?: number;
  /** Cocos node-origin Y within `previewIconSrc` (from top of image). */
  previewIconAnchorY?: number;
  /**
   * Optional stock game sprite (portal, speed pad, pickup) drawn as the object
   * the emitter attaches to. Drawn at the frame's native UHD pixel size.
   */
  attachSpriteSrc?: string | null;
  /** Cocos node-origin X within `attachSpriteSrc`. */
  attachSpriteAnchorX?: number;
  /** Cocos node-origin Y within `attachSpriteSrc`. */
  attachSpriteAnchorY?: number;
  /**
   * Called while the user drags on the canvas in "static" mode to reposition
   * the emitter. Values are Cocos2d-coordinate offsets from scene center (y-up).
   */
  onEmitterMove?: (cocos2dX: number, cocos2dY: number) => void;
}

// ─── Background drawing ───────────────────────────────────────────────────────

const CHECKER_A = "#3a3a3a";
const CHECKER_B = "#2c2c2c";
const CHECKER_SIZE = 12;

// ─── Image loading + multiply tinting ─────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadSharedImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) {
    return cached;
  }
  const pending = loadImage(src).catch((err: unknown) => {
    imageCache.delete(src);
    throw err;
  });
  imageCache.set(src, pending);
  return pending;
}

const tintedCache = new Map<string, HTMLCanvasElement>();

/**
 * Multiply `tint` onto `img`, preserving its alpha. Mirrors the Icon Editor
 * GD stage, which multiplies a flat colour layer over the same artwork.
 */
function tintedImage(img: HTMLImageElement, tint: string): HTMLCanvasElement | null {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (iw <= 0 || ih <= 0) {
    return null;
  }
  const key = `${img.src}|${tint}`;
  const cached = tintedCache.get(key);
  if (cached) {
    return cached;
  }
  const canvas = document.createElement("canvas");
  canvas.width = iw;
  canvas.height = ih;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, iw, ih);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  tintedCache.set(key, canvas);
  return canvas;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  w: number,
  h: number,
): void {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }
  const scale = Math.max(w / sourceWidth, h / sourceHeight);
  const dw = sourceWidth * scale;
  const dh = sourceHeight * scale;
  // Top-anchored cover (matches icon editor game bg object-position).
  ctx.drawImage(source, (w - dw) / 2, 0, dw, dh);
}

/** Tiled floor strip anchored with its top edge on the ground line. */
function drawGdFloor(
  ctx: CanvasRenderingContext2D,
  floor: HTMLImageElement,
  w: number,
  h: number,
  floorTopY: number,
): void {
  const tinted = tintedImage(floor, GD_FLOOR_TINT);
  if (!tinted) {
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, floorTopY, w, h - floorTopY);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  for (let y = floorTopY; y < h; y += GD_FLOOR_TILE) {
    for (let x = 0; x < w; x += GD_FLOOR_TILE) {
      ctx.drawImage(tinted, x, y, GD_FLOOR_TILE, GD_FLOOR_TILE);
    }
  }
  ctx.restore();

  const seam = ctx.createLinearGradient(0, 0, w, 0);
  seam.addColorStop(0, "rgba(255, 255, 255, 0)");
  seam.addColorStop(0.25, "rgba(255, 255, 255, 0.4)");
  seam.addColorStop(0.5, "rgba(255, 255, 255, 0.6)");
  seam.addColorStop(0.75, "rgba(255, 255, 255, 0.4)");
  seam.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = seam;
  ctx.fillRect(0, floorTopY, w, GD_FLOOR_DIVIDER_HEIGHT);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mode: ParticleBackground,
  gdImage: HTMLImageElement | null,
  gdFloor: HTMLImageElement | null,
  floorTopY: number,
): void {
  switch (mode) {
    case "checkerboard":
      for (let row = 0; row * CHECKER_SIZE < h; row++) {
        for (let col = 0; col * CHECKER_SIZE < w; col++) {
          ctx.fillStyle = (row + col) % 2 === 0 ? CHECKER_A : CHECKER_B;
          ctx.fillRect(col * CHECKER_SIZE, row * CHECKER_SIZE, CHECKER_SIZE, CHECKER_SIZE);
        }
      }
      break;
    case "dark":
      ctx.fillStyle = "#1a1a1e";
      ctx.fillRect(0, 0, w, h);
      break;
    case "gd": {
      const tintedBg = gdImage?.complete ? tintedImage(gdImage, GD_BACKGROUND_TINT) : null;
      if (tintedBg) {
        drawCoverImage(ctx, tintedBg, tintedBg.width, tintedBg.height, w, h);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#1a3a5c");
        grad.addColorStop(1, "#0d1f36");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
      if (gdFloor?.complete) {
        drawGdFloor(ctx, gdFloor, w, h, floorTopY);
      }
      break;
    }
    default: {
      const _exhaustive: never = mode;
      ctx.fillStyle = "#1a1a1e";
      ctx.fillRect(0, 0, w, h);
      void _exhaustive;
    }
  }
}

function clipRoundedCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  radius = 24,
): void {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(0, 0, w, h, r);
  } else {
    ctx.rect(0, 0, w, h);
  }
  ctx.clip();
}

// ─── Silhouette helpers ───────────────────────────────────────────────────────

type SpriteAnchor = { x: number; y: number };

/** Default center anchor when metadata is missing. */
function centerAnchor(sprite: HTMLImageElement): SpriteAnchor {
  const iw = sprite.naturalWidth || sprite.width;
  const ih = sprite.naturalHeight || sprite.height;
  return { x: iw / 2, y: ih / 2 };
}

/**
 * Draw a sprite so `(originX, originY)` maps to the Cocos/node origin inside the
 * image (Icon Editor: image center = origin + (offset.x, -offset.y)).
 */
function drawSpriteAtOrigin(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  originX: number,
  originY: number,
  anchor: SpriteAnchor,
  alpha = 0.95,
  scale = 1,
): boolean {
  const iw = sprite.naturalWidth || sprite.width;
  const ih = sprite.naturalHeight || sprite.height;
  if (iw <= 0 || ih <= 0) {
    return false;
  }
  const dw = iw * scale;
  const dh = ih * scale;
  const ax = anchor.x * scale;
  const ay = anchor.y * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, originX - ax, originY - ay, dw, dh);
  ctx.globalAlpha = 1;
  return true;
}

function drawPreviewIconAtOrigin(
  ctx: CanvasRenderingContext2D,
  icon: HTMLImageElement | null,
  originX: number,
  originY: number,
  anchor: SpriteAnchor | null,
): void {
  if (icon?.complete) {
    const a = anchor ?? centerAnchor(icon);
    if (drawSpriteAtOrigin(ctx, icon, originX, originY, a)) {
      return;
    }
  }
  // Fallback cube: node origin at center (matches offset-0 player cubes).
  const s = FALLBACK_CUBE_SIZE * 0.85;
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "#7eb8f7";
  ctx.fillRect(originX - s / 2, originY - s / 2, s, s);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(originX - s / 2, originY + s * 0.15, s, s * 0.35);
  ctx.globalAlpha = 1;
}

/**
 * Place the node origin so the sprite's visual bottom sits on `groundY`
 * (Icon Editor floor snap: originY = groundY - (height - anchorY)).
 */
function originYForGroundContact(
  imageHeight: number,
  anchorY: number,
  groundY: number,
): number {
  return groundY - (imageHeight - anchorY);
}


// ─── Preview mode: emitter position animation ─────────────────────────────────

/**
 * Compute the scene-space path point for the current frame (ground line / sweep).
 * Callers convert ground contact into the Cocos node origin using sprite anchors.
 */
function computePathPos(
  mode: PreviewMode,
  t: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const cx = w / 2;
  const cy = h / 2;
  const groundY = groundLineY(h);

  switch (mode) {
    case "dragSlide": {
      const x = cx + Math.sin((t / 4) * Math.PI * 2) * (w * 0.35);
      return { x, y: groundY };
    }
    case "shipScrape": {
      const x = cx + Math.sin((t / 4) * Math.PI * 2) * (w * 0.35);
      return { x, y: groundY };
    }
    case "trailFollow": {
      const x = cx + Math.sin((t / 3) * Math.PI * 2) * (w * 0.38);
      return { x, y: cy };
    }
    case "oneShot":
      return { x: cx, y: cy };
    case "portalAura":
      return { x: cx, y: cy };
    case "speedBurst": {
      const SWEEP_S = 1.4;
      const PERIOD = SWEEP_S + 0.4;
      const phase = t % PERIOD;
      if (phase < SWEEP_S) {
        const x = (phase / SWEEP_S) * (w + 120) - 60;
        return { x, y: cy };
      }
      return { x: w + 60, y: cy };
    }
    case "ambientPinned":
      return { x: cx, y: cy };
    case "static":
      return { x: cx, y: cy };
    default: {
      const _exhaustive: never = mode;
      void _exhaustive;
      return { x: cx, y: cy };
    }
  }
}

/**
 * Map a path/ground contact point to the emitter's Cocos node origin for the mode.
 */
function emitterOriginFromPath(
  mode: PreviewMode,
  path: { x: number; y: number },
  icon: HTMLImageElement | null,
  iconAnchor: SpriteAnchor | null,
): { x: number; y: number } {
  switch (mode) {
    case "dragSlide":
    case "shipScrape": {
      if (icon?.complete) {
        const ih = icon.naturalHeight || icon.height;
        const ay = (iconAnchor ?? centerAnchor(icon)).y;
        return { x: path.x, y: originYForGroundContact(ih, ay, path.y) };
      }
      return { x: path.x, y: path.y - FALLBACK_CUBE_SIZE / 2 };
    }
    case "trailFollow":
    case "oneShot":
    case "portalAura":
    case "speedBurst":
    case "ambientPinned":
    case "static":
      return path;
    default: {
      const _exhaustive: never = mode;
      void _exhaustive;
      return path;
    }
  }
}

// ─── Preview mode: silhouette rendering ──────────────────────────────────────

type SilhouetteAssets = {
  previewIcon: HTMLImageElement | null;
  previewIconAnchor: SpriteAnchor | null;
  attachSprite: HTMLImageElement | null;
  attachSpriteAnchor: SpriteAnchor | null;
};

function drawModeSilhouette(
  ctx: CanvasRenderingContext2D,
  mode: PreviewMode,
  emitterX: number,
  emitterY: number,
  t: number,
  w: number,
  h: number,
  assets: SilhouetteAssets,
): void {
  const { previewIcon, previewIconAnchor, attachSprite, attachSpriteAnchor } = assets;
  const attach = attachSprite?.complete ? attachSprite : null;
  const attachAnchor = attach ? (attachSpriteAnchor ?? centerAnchor(attach)) : null;
  const iconAnchor = previewIcon?.complete
    ? (previewIconAnchor ?? centerAnchor(previewIcon))
    : null;
  ctx.save();

  switch (mode) {
    case "dragSlide": {
      drawPreviewIconAtOrigin(ctx, previewIcon, emitterX, emitterY, iconAnchor);
      break;
    }
    case "shipScrape": {
      if (previewIcon?.complete) {
        drawPreviewIconAtOrigin(ctx, previewIcon, emitterX, emitterY, iconAnchor);
      } else {
        ctx.globalAlpha = 0.82;
        ctx.fillStyle = "#7eb8f7";
        ctx.beginPath();
        ctx.moveTo(emitterX + 70, emitterY + 25);
        ctx.lineTo(emitterX - 56, emitterY + 45);
        ctx.lineTo(emitterX - 40, emitterY - 20);
        ctx.lineTo(emitterX + 20, emitterY - 5);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "trailFollow": {
      if (attach && attachAnchor) {
        drawSpriteAtOrigin(ctx, attach, emitterX, emitterY, attachAnchor);
      } else {
        drawPreviewIconAtOrigin(ctx, previewIcon, emitterX, emitterY, iconAnchor);
      }
      break;
    }
    case "oneShot": {
      if (attach && attachAnchor) {
        drawSpriteAtOrigin(ctx, attach, emitterX, emitterY, attachAnchor, 0.9);
        break;
      }
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(emitterX - 28, emitterY);
      ctx.lineTo(emitterX + 28, emitterY);
      ctx.moveTo(emitterX, emitterY - 28);
      ctx.lineTo(emitterX, emitterY + 28);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "portalAura": {
      const pulse = 0.85 + Math.sin(t * Math.PI * 2) * 0.1;
      if (attach && attachAnchor) {
        drawSpriteAtOrigin(ctx, attach, emitterX, emitterY, attachAnchor, 0.98, pulse);
        break;
      }
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = "#b07fff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(emitterX, emitterY, 58 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = "#7b3fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(emitterX, emitterY, 40 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.08 * pulse;
      ctx.fillStyle = "#b07fff";
      ctx.beginPath();
      ctx.arc(emitterX, emitterY, 56 * pulse, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "speedBurst": {
      const gx = w / 2;
      if (attach && attachAnchor) {
        drawSpriteAtOrigin(ctx, attach, gx, h / 2, attachAnchor, 0.95);
      } else {
        const gateH = h * 0.42;
        const gateY = h / 2 - gateH / 2;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "#ffe066";
        ctx.fillRect(gx - 44, gateY, 5, gateH);
        ctx.fillRect(gx + 39, gateY, 5, gateH);
        ctx.globalAlpha = 1;
      }
      if (emitterX >= -60 && emitterX <= w + 60) {
        drawPreviewIconAtOrigin(ctx, previewIcon, emitterX, emitterY, iconAnchor);
      }
      break;
    }
    case "ambientPinned": {
      if (attach && attachAnchor) {
        drawSpriteAtOrigin(ctx, attach, emitterX, emitterY, attachAnchor, 0.95);
      }
      break;
    }
    case "static":
      break;
    default: {
      const _exhaustive: never = mode;
      void _exhaustive;
    }
  }

  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Canvas 2D particle preview backed by `ParticleEmitter`.
 *
 * The canvas always fills its container; `zoom` magnifies the scene around the
 * centre so a small emitter can be inspected without resizing the panel.
 *
 * In **static** mode (default), drag anywhere on the canvas to reposition
 * the emitter origin.
 *
 * In any other `previewMode`, the emitter moves automatically on a
 * mode-specific path and either the real game object (`attachSpriteSrc`) or a
 * generic silhouette is drawn each frame before the particle layer. Dragging is
 * disabled in animated modes.
 *
 * Increment `resetKey` to kill all live particles and restart from t=0.
 */
export function ParticlePreviewCanvas({
  config,
  textureSrc,
  running,
  background,
  zoom = 1,
  previewMode = "static",
  resetKey,
  usePlistSourcePosition = false,
  previewIconSrc = null,
  previewIconAnchorX,
  previewIconAnchorY,
  attachSpriteSrc = null,
  attachSpriteAnchorX,
  attachSpriteAnchorY,
  onEmitterMove,
}: ParticlePreviewCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const emitterRef = useRef<ParticleEmitter | null>(null);
  const rafRef = useRef<number>(0);
  const lastMsRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const modeTimeRef = useRef(0);
  const gdImageRef = useRef<HTMLImageElement | null>(null);
  const gdFloorRef = useRef<HTMLImageElement | null>(null);
  const previewIconRef = useRef<HTMLImageElement | null>(null);
  const attachSpriteRef = useRef<HTMLImageElement | null>(null);
  const previewIconAnchorRef = useRef<SpriteAnchor | null>(null);
  const attachSpriteAnchorRef = useRef<SpriteAnchor | null>(null);
  /** Scene size in scene pixels, kept in sync with canvas size and zoom. */
  const sceneSizeRef = useRef({ w: 1, h: 1 });

  const runningRef = useRef(running);
  const backgroundRef = useRef(background);
  const previewModeRef = useRef(previewMode);
  const zoomRef = useRef(zoom);
  runningRef.current = running;
  backgroundRef.current = background;
  previewModeRef.current = previewMode;
  zoomRef.current = zoom;

  useEffect(() => {
    if (
      typeof previewIconAnchorX === "number" &&
      typeof previewIconAnchorY === "number" &&
      Number.isFinite(previewIconAnchorX) &&
      Number.isFinite(previewIconAnchorY)
    ) {
      previewIconAnchorRef.current = { x: previewIconAnchorX, y: previewIconAnchorY };
    } else {
      previewIconAnchorRef.current = null;
    }
  }, [previewIconAnchorX, previewIconAnchorY]);

  useEffect(() => {
    if (
      typeof attachSpriteAnchorX === "number" &&
      typeof attachSpriteAnchorY === "number" &&
      Number.isFinite(attachSpriteAnchorX) &&
      Number.isFinite(attachSpriteAnchorY)
    ) {
      attachSpriteAnchorRef.current = { x: attachSpriteAnchorX, y: attachSpriteAnchorY };
    } else {
      attachSpriteAnchorRef.current = null;
    }
  }, [attachSpriteAnchorX, attachSpriteAnchorY]);

  useEffect(() => {
    const emitter = new ParticleEmitter(config, null);
    // Scene is UHD pixel space (icons / floor); map Cocos points → that space.
    emitter.contentScale = GD_PARTICLE_CONTENT_SCALE;
    emitterRef.current = emitter;
    return () => {
      emitterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    emitterRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    if (!textureSrc) {
      emitterRef.current?.setTexture(null);
      return;
    }
    let cancelled = false;
    loadImage(textureSrc)
      .then((img) => {
        if (!cancelled) emitterRef.current?.setTexture(img);
      })
      .catch(() => {
        if (!cancelled) emitterRef.current?.setTexture(null);
      });
    return () => {
      cancelled = true;
    };
  }, [textureSrc]);

  useEffect(() => {
    let cancelled = false;
    void loadSharedImage(GD_BACKGROUND_SRC)
      .then((img) => {
        if (!cancelled) gdImageRef.current = img;
      })
      .catch(() => {
        /* keep gradient fallback */
      });
    void loadSharedImage(GD_FLOOR_SRC)
      .then((img) => {
        if (!cancelled) gdFloorRef.current = img;
      })
      .catch(() => {
        /* floor is optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!previewIconSrc) {
      previewIconRef.current = null;
      return;
    }
    let cancelled = false;
    loadImage(previewIconSrc)
      .then((img) => {
        if (!cancelled) previewIconRef.current = img;
      })
      .catch(() => {
        if (!cancelled) previewIconRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [previewIconSrc]);

  useEffect(() => {
    if (!attachSpriteSrc) {
      attachSpriteRef.current = null;
      return;
    }
    let cancelled = false;
    loadImage(attachSpriteSrc)
      .then((img) => {
        if (!cancelled) attachSpriteRef.current = img;
      })
      .catch(() => {
        if (!cancelled) attachSpriteRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [attachSpriteSrc]);

  // Canvas backing store follows the container box (device-pixel accurate).
  useEffect(() => {
    const host = hostRef.current;
    const canvasEl = canvasRef.current;
    if (!host || !canvasEl) return;

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssWidth = Math.max(1, Math.round(host.clientWidth));
      const cssHeight = Math.max(1, Math.round(host.clientHeight));
      const nextWidth = Math.round(cssWidth * dpr);
      const nextHeight = Math.round(cssHeight * dpr);
      if (canvasEl.width !== nextWidth) canvasEl.width = nextWidth;
      if (canvasEl.height !== nextHeight) canvasEl.height = nextHeight;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    emitterRef.current?.reset();
    modeTimeRef.current = 0;
    if (previewMode === "static") {
      const em = emitterRef.current;
      if (em) {
        em.centerX = sceneSizeRef.current.w / 2;
        em.centerY = sceneSizeRef.current.h / 2;
      }
    }
  }, [previewMode]);

  useEffect(() => {
    emitterRef.current?.reset();
    modeTimeRef.current = 0;
  }, [resetKey]);

  useEffect(() => {
    const em = emitterRef.current;
    if (em) em.usePlistSourcePosition = usePlistSourcePosition;
  }, [usePlistSourcePosition]);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const frame = (nowMs: number): void => {
      const emitter = emitterRef.current;
      if (!emitter) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const dt =
        lastMsRef.current !== null
          ? Math.min((nowMs - lastMsRef.current) / 1000, 0.1)
          : 0.016;
      lastMsRef.current = nowMs;

      const canvasW = canvasEl.width;
      const canvasH = canvasEl.height;
      // Device pixels per scene pixel; the scene rect always fills the canvas.
      const viewScale =
        Math.max(0.05, zoomRef.current) * Math.min(window.devicePixelRatio || 1, 2);
      const w = canvasW / viewScale;
      const h = canvasH / viewScale;
      const prevScene = sceneSizeRef.current;
      const sceneChanged = prevScene.w !== w || prevScene.h !== h;
      sceneSizeRef.current = { w, h };
      const mode = previewModeRef.current;

      if (mode === "static" && sceneChanged && !draggingRef.current) {
        emitter.centerX = w / 2;
        emitter.centerY = h / 2;
      }

      if (runningRef.current) {
        const prevT = modeTimeRef.current;
        modeTimeRef.current += dt;
        const t = modeTimeRef.current;

        if (mode === "speedBurst") {
          const PERIOD = 1.4 + 0.4;
          if (Math.floor(t / PERIOD) > Math.floor(prevT / PERIOD)) {
            emitter.reset();
          }
        }

        if (mode !== "static") {
          const path = computePathPos(mode, t, w, h);
          const origin = emitterOriginFromPath(
            mode,
            path,
            previewIconRef.current,
            previewIconAnchorRef.current,
          );
          emitter.centerX = origin.x;
          emitter.centerY = origin.y;
        }

        emitter.update(dt);
      }

      const t = modeTimeRef.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.save();
      clipRoundedCanvas(ctx, canvasW, canvasH);
      ctx.scale(viewScale, viewScale);

      drawBackground(
        ctx,
        w,
        h,
        backgroundRef.current,
        gdImageRef.current,
        gdFloorRef.current,
        groundLineY(h),
      );

      if (mode !== "static") {
        drawModeSilhouette(ctx, mode, emitter.centerX, emitter.centerY, t, w, h, {
          previewIcon: previewIconRef.current,
          previewIconAnchor: previewIconAnchorRef.current,
          attachSprite: attachSpriteRef.current,
          attachSpriteAnchor: attachSpriteAnchorRef.current,
        });
      }

      emitter.draw(ctx);
      ctx.restore();

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastMsRef.current = null;
    };
  }, []);

  const applyDrag = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): void => {
      const canvasEl = canvasRef.current;
      const emitter = emitterRef.current;
      if (!canvasEl || !emitter) return;

      const rect = canvasEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const { w, h } = sceneSizeRef.current;
      const sceneX = ((e.clientX - rect.left) / rect.width) * w;
      const sceneY = ((e.clientY - rect.top) / rect.height) * h;

      emitter.centerX = sceneX;
      emitter.centerY = sceneY;

      onEmitterMove?.(sceneX - w / 2, h / 2 - sceneY);
    },
    [onEmitterMove],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): void => {
      if (previewModeRef.current !== "static") return;
      draggingRef.current = true;
      applyDrag(e);
    },
    [applyDrag],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): void => {
      if (draggingRef.current) applyDrag(e);
    },
    [applyDrag],
  );

  const stopDrag = useCallback((): void => {
    draggingRef.current = false;
  }, []);

  const isStatic = previewMode === "static";

  return (
    <div className="tm-pe-canvas-host" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className="tm-particle-canvas"
        style={{ cursor: isStatic ? "crosshair" : "default" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      />
    </div>
  );
}
