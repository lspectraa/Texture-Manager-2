/**
 * Cocos2d-x v3 CCParticleSystem / CCParticleSystemQuad accurate particle simulator.
 *
 * Coordinate convention: all physics run in Cocos2d local space (+Y up).
 * Canvas conversion happens only at draw time: canvasY = emitterCanvasY - localY.
 *
 * Key fidelity points vs. old simulator:
 *  - Local-space physics; startPos captures emitter world pos at spawn.
 *  - _emitCounter / (1 / emissionRate) accumulator (Cocos2d exact).
 *  - Gravity: tangential = swap(radial) + negate-X; dir += (r+t+g)*yCoordFlipped*dt; pos += dir*dt.
 *  - Radius:  pos.x = -cos(a)*r;  pos.y = -sin(a)*r*yCoordFlipped.
 *  - Per-particle color/size/rotation deltas (not per-frame t-lerp).
 *  - lifespan = 0 is allowed (landEffect, explodeEffect).
 *  - rotationIsDir applied at spawn + continuously in draw.
 *  - positionType Free/Relative/Grouped world-pos computation (updateParticleQuads logic).
 *  - opacityModifyRGB pre-multiplies RGB by alpha.
 *  - usePlistSourcePosition flag: when false (in-game/GD mode), sourcePositionx/y are zeroed.
 */

import { ParticleConfig, getEmissionRate } from "../../../domain/particleConfig";

// ─── Blend helpers ────────────────────────────────────────────────────────────

const GL_ONE = 1;
const GL_SRC_ALPHA = 770;
const GL_ONE_MINUS_SRC_ALPHA = 771;

function blendToComposite(src: number, dst: number): GlobalCompositeOperation {
  if (dst === GL_ONE) return "lighter";
  if (src === GL_SRC_ALPHA && dst === GL_ONE_MINUS_SRC_ALPHA) return "source-over";
  return "source-over";
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;

/** Uniform random in [min, max]. */
function rng(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export type ParticleTexture = HTMLImageElement | ImageBitmap;

// ─── Internal particle state ──────────────────────────────────────────────────

/**
 * Per-particle state mirroring Cocos2d CCParticle.
 * All positions/velocities are in Cocos2d local space (+Y up).
 */
export interface Particle {
  // Local-space physics position (origin = emitter position)
  x: number;
  y: number;
  // Velocity (Cocos2d +Y-up space)
  vx: number;
  vy: number;
  // Life
  life: number;
  lifespan: number;

  // Gravity-mode per-particle accelerations
  radialAccel: number;
  tangentialAccel: number;

  // Radius-mode state
  radius: number;
  /** dr/dt (negative = contracting toward centre) */
  radiusDelta: number;
  orbitAngle: number;
  /** rad/s */
  orbitSpeed: number;

  // Per-particle color (Cocos2d integrates deltas each frame, not t-lerp)
  r: number;
  g: number;
  b: number;
  a: number;
  deltaR: number;
  deltaG: number;
  deltaB: number;
  deltaA: number;

  // Size
  size: number;
  deltaSize: number;

  // Sprite self-rotation (degrees; Cocos2d integrates delta each frame)
  rotation: number;
  deltaRotation: number;

  /**
   * Canvas-space X/Y of the emitter at the time this particle was spawned.
   * Used by Free (0) and Relative (1) positionType to pin the particle's world
   * trajectory to where the emitter was, not where it is now.
   */
  startPosX: number;
  startPosY: number;
}

// ─── Offscreen tint canvas ────────────────────────────────────────────────────

/**
 * Cocos2d tint: `gl_FragColor = texture2D(tex) * v_fragmentColor` (RGB).
 *
 * Canvas `globalCompositeOperation = "multiply"` does **not** match that for
 * soft-alpha brushes (it washes / darkens incorrectly). We bake an exact
 * per-pixel multiply into a cached sprite and apply particle alpha via
 * `globalAlpha` at draw time.
 */
const TINT_MAX_EDGE = 64;
const TINT_CACHE_LIMIT = 96;
/** 5-bit/channel — enough chroma; keeps cache small while colors scrub/fade. */
const TINT_RGB_LEVELS = 31;

let texIdSeq = 0;
const texIds = new WeakMap<object, number>();

type TexTintMode = "mask" | "modulate";

type TexBase = {
  w: number;
  h: number;
  mode: TexTintMode;
  /** Scaled source for the GPU mask path. */
  source: HTMLCanvasElement;
  /** RGBA of `source` for exact modulate (texture × RGB). */
  pixels: Uint8ClampedArray;
};

const texBases = new WeakMap<object, TexBase>();
/** Cross-frame LRU: `${texId}|${mode}|r,g,b` → tinted sprite. */
const tintCache = new Map<string, HTMLCanvasElement>();

function textureCacheId(tex: ParticleTexture): string {
  if (typeof HTMLImageElement !== "undefined" && tex instanceof HTMLImageElement) {
    return `img:${tex.src}`;
  }
  let id = texIds.get(tex as object);
  if (id === undefined) {
    id = ++texIdSeq;
    texIds.set(tex as object, id);
  }
  return `bmp:${id}`;
}

function texturePixelSize(tex: ParticleTexture): { w: number; h: number } {
  if (typeof HTMLImageElement !== "undefined" && tex instanceof HTMLImageElement) {
    return {
      w: Math.max(1, tex.naturalWidth || tex.width || 1),
      h: Math.max(1, tex.naturalHeight || tex.height || 1),
    };
  }
  const bitmap = tex as ImageBitmap;
  return {
    w: Math.max(1, bitmap.width || 1),
    h: Math.max(1, bitmap.height || 1),
  };
}

/**
 * White / soft grayscale brushes → mask (fill color × texture alpha).
 * Anything with real chroma or dark cores → modulate (texture RGB × color).
 */
function classifyTexturePixels(pixels: Uint8ClampedArray): TexTintMode {
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]!;
    if (a < 8) continue;
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
    const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
    // Chromatic texel → must modulate.
    if (maxC - minC > 8) {
      return "modulate";
    }
    // Near-black core on an opaque texel (not a soft white brush).
    if (a > 200 && maxC < 40) {
      return "modulate";
    }
  }
  return "mask";
}

function getTextureBase(tex: ParticleTexture): TexBase | null {
  const key = tex as object;
  const cached = texBases.get(key);
  if (cached) {
    return cached;
  }

  const { w: tw, h: th } = texturePixelSize(tex);
  const scale = Math.min(1, TINT_MAX_EDGE / Math.max(tw, th));
  const w = Math.max(1, Math.round(tw * scale));
  const h = Math.max(1, Math.round(th * scale));

  const source = document.createElement("canvas");
  source.width = w;
  source.height = h;
  const tc = source.getContext("2d", { willReadFrequently: true });
  if (!tc) {
    return null;
  }
  tc.drawImage(tex, 0, 0, w, h);

  let pixels: Uint8ClampedArray;
  let mode: TexTintMode = "mask";
  try {
    pixels = tc.getImageData(0, 0, w, h).data;
    mode = classifyTexturePixels(pixels);
  } catch {
    pixels = new Uint8ClampedArray(w * h * 4);
    mode = "mask";
  }

  const base: TexBase = { w, h, mode, source, pixels };
  texBases.set(key, base);
  return base;
}

function quantizeRgbByte(value: number): number {
  const level = Math.round(clamp01(value) * TINT_RGB_LEVELS);
  return Math.round((level * 255) / TINT_RGB_LEVELS);
}

function tintCacheSet(key: string, canvas: HTMLCanvasElement): void {
  if (tintCache.has(key)) {
    tintCache.delete(key);
  }
  tintCache.set(key, canvas);
  while (tintCache.size > TINT_CACHE_LIMIT) {
    const oldest = tintCache.keys().next().value;
    if (oldest === undefined) break;
    tintCache.delete(oldest);
  }
}

/**
 * Exact Cocos RGB multiply into ImageData (alpha left as texture alpha).
 */
function buildModulateSprite(
  base: TexBase,
  qr: number,
  qg: number,
  qb: number,
): HTMLCanvasElement {
  const { w, h, pixels } = base;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const tc = canvas.getContext("2d");
  if (!tc) {
    return canvas;
  }
  const out = tc.createImageData(w, h);
  const dst = out.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]!;
    if (a === 0) {
      continue;
    }
    dst[i] = (pixels[i]! * qr) / 255;
    dst[i + 1] = (pixels[i + 1]! * qg) / 255;
    dst[i + 2] = (pixels[i + 2]! * qb) / 255;
    dst[i + 3] = a;
  }
  tc.putImageData(out, 0, 0);
  return canvas;
}

/**
 * White-brush fast path: solid color masked by texture alpha.
 * Equivalent to texture×color when texture RGB ≈ white.
 */
function buildMaskSprite(
  base: TexBase,
  qr: number,
  qg: number,
  qb: number,
): HTMLCanvasElement {
  const { w, h, source } = base;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const tc = canvas.getContext("2d");
  if (!tc) {
    return canvas;
  }
  tc.globalCompositeOperation = "source-over";
  tc.fillStyle = `rgb(${qr},${qg},${qb})`;
  tc.fillRect(0, 0, w, h);
  tc.globalCompositeOperation = "destination-in";
  tc.drawImage(source, 0, 0);
  tc.globalCompositeOperation = "source-over";
  return canvas;
}

function getTintedSprite(
  tex: ParticleTexture,
  r: number,
  g: number,
  b: number,
): HTMLCanvasElement {
  const qr = quantizeRgbByte(r);
  const qg = quantizeRgbByte(g);
  const qb = quantizeRgbByte(b);

  const base = getTextureBase(tex);
  if (!base) {
    const empty = document.createElement("canvas");
    empty.width = 1;
    empty.height = 1;
    return empty;
  }

  const key = `${textureCacheId(tex)}|${base.mode}|${qr},${qg},${qb}`;
  const hit = tintCache.get(key);
  if (hit) {
    // Refresh LRU order.
    tintCacheSet(key, hit);
    return hit;
  }

  const built =
    base.mode === "mask"
      ? buildMaskSprite(base, qr, qg, qb)
      : buildModulateSprite(base, qr, qg, qb);
  tintCacheSet(key, built);
  return built;
}

function clearTintCache(): void {
  tintCache.clear();
}

/** No-ops kept so draw() framing stays explicit if we reintroduce per-frame pools. */
function beginTintFrame(): void {}
function endTintFrame(): void {}

/**
 * Draw an RGB-multiplied texture sprite. Caller sets `ctx.globalAlpha` for
 * particle opacity (and OMR adjustments).
 */
function blitTintedTexture(
  ctx: CanvasRenderingContext2D,
  tex: ParticleTexture,
  cx: number,
  cy: number,
  size: number,
  rotRad: number,
  r: number,
  g: number,
  b: number,
): void {
  const sprite = getTintedSprite(tex, r, g, b);
  const drawSize = Math.max(size, 0.5);
  const half = drawSize / 2;
  if (rotRad === 0) {
    ctx.drawImage(sprite, cx - half, cy - half, drawSize, drawSize);
    return;
  }
  ctx.translate(cx, cy);
  ctx.rotate(rotRad);
  ctx.drawImage(sprite, -half, -half, drawSize, drawSize);
  ctx.rotate(-rotRad);
  ctx.translate(-cx, -cy);
}

// ─── ParticleEmitter ─────────────────────────────────────────────────────────

/**
 * Cocos2d-x v3–accurate Canvas 2D particle emitter.
 *
 * Public API:
 * ```ts
 * const emitter = new ParticleEmitter(config, texture);
 * emitter.setEmitterWorldPos(canvas.width / 2, canvas.height / 2);
 *
 * // In RAF loop:
 * emitter.update(dt);
 * ctx.clearRect(0, 0, w, h);
 * emitter.draw(ctx);
 * ```
 *
 * Legacy shims (centerX / centerY) also work and delegate to setEmitterWorldPos.
 */
export class ParticleEmitter {
  private cfg: ParticleConfig;
  private tex: ParticleTexture | null;
  private particles: Particle[];
  /** Cocos2d _emitCounter: accumulated time waiting for the next emission slot. */
  private emitCounter: number;
  private elapsed: number;

  private _worldX = 0;
  private _worldY = 0;

  /**
   * When `false` (default / GD in-game mode), `sourcePositionx/y` from the plist are
   * ignored and treated as (0, 0). Only `sourcePositionVariance*` variance is applied.
   *
   * Set to `true` to restore Particle Designer behaviour where the plist offsets shift
   * the emit origin (useful for authoring / round-trip editing).
   */
  usePlistSourcePosition = false;

  /**
   * Multiplies Cocos point-space linear quantities into scene pixels.
   * Particle Editor preview uses contentScale 4 so sizes/speeds/gravity match
   * UHD icons drawn at native pixels (GD UHD = 4× points).
   */
  contentScale = 1;

  /**
   * Previous emitter world position — used to shift Relative particles by the
   * emitter's frame-to-frame delta (Cocos2d PositionType::RELATIVE).
   */
  private _prevWorldX = 0;
  private _prevWorldY = 0;

  constructor(cfg: ParticleConfig, tex?: ParticleTexture | null) {
    this.cfg = { ...cfg };
    this.tex = tex ?? null;
    this.particles = [];
    this.emitCounter = 0;
    this.elapsed = 0;
  }

  // ── Configuration ──────────────────────────────────────────────────────────

  /** Replace the active config. Resets simulation when the emitter type changes. */
  setConfig(cfg: ParticleConfig): void {
    const prevType = this.cfg.emitterType;
    this.cfg = { ...cfg };
    if (prevType !== cfg.emitterType) this.reset();
  }

  /** Swap the particle sprite texture. */
  setTexture(tex: ParticleTexture | null): void {
    this.tex = tex;
    clearTintCache();
  }

  /** Kill all live particles and restart emission from t=0. */
  reset(): void {
    this.particles = [];
    this.emitCounter = 0;
    this.elapsed = 0;
    this._prevWorldX = this._worldX;
    this._prevWorldY = this._worldY;
  }

  // ── Position ───────────────────────────────────────────────────────────────

  /**
   * Set the emitter's world position in canvas coordinates.
   * Call this each frame before update() when the emitter should track a moving object.
   */
  setEmitterWorldPos(x: number, y: number): void {
    this._worldX = x;
    this._worldY = y;
  }

  /**
   * Shift Free-mode particle world anchors by `(dx, dy)` in canvas pixels.
   * Used by the preview treadmill so the icon can stay locked while Free trails
   * drift as if the emitter were travelling. Relative / Grouped particles stay
   * with the emitter and are left untouched.
   */
  scrollWorld(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    const posType = this.cfg.positionType ?? 0;
    if (posType !== 0) return;
    for (const p of this.particles) {
      p.startPosX += dx;
      p.startPosY += dy;
    }
  }

  /** Legacy shim: sets world X. */
  set centerX(v: number) {
    this._worldX = v;
  }
  get centerX(): number {
    return this._worldX;
  }

  /** Legacy shim: sets world Y. */
  set centerY(v: number) {
    this._worldY = v;
  }
  get centerY(): number {
    return this._worldY;
  }

  get particleCount(): number {
    return this.particles.length;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  /**
   * Advance the simulation by `dt` seconds (Cocos2d-x update loop).
   * Call once per animation frame before `draw`.
   */
  update(dt: number): void {
    // Cap delta to prevent spiral-of-death on tab background resume
    const step = Math.min(dt, 0.05);

    // Relative (1): translate each particle's spawn anchor by emitter movement
    // so trails follow the emitter without being locked in local space (Grouped).
    const posType = this.cfg.positionType ?? 0;
    const dx = this._worldX - this._prevWorldX;
    const dy = this._worldY - this._prevWorldY;
    if (posType === 1 && this.particles.length > 0 && (dx !== 0 || dy !== 0)) {
      for (const p of this.particles) {
        p.startPosX += dx;
        p.startPosY += dy;
      }
    }
    this._prevWorldX = this._worldX;
    this._prevWorldY = this._worldY;

    this.elapsed += step;

    const cfg = this.cfg;
    const isActive = cfg.duration < 0 || this.elapsed < cfg.duration;

    if (isActive && this.particles.length < cfg.maxParticles) {
      // Cocos2d _emitCounter accumulator: emit exactly floor(accum / rate) particles per frame.
      const rate = 1.0 / getEmissionRate(cfg);
      this.emitCounter += step;

      let emitCount = Math.floor(this.emitCounter / rate);
      emitCount = Math.min(emitCount, cfg.maxParticles - this.particles.length);

      if (emitCount > 0) {
        for (let i = 0; i < emitCount; i++) {
          this.particles.push(this.spawnParticle());
        }
        this.emitCounter -= rate * emitCount;
      }
    }

    // Integrate existing particles
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life -= step;
      if (p.life <= 0) continue;
      this.stepParticle(p, step);
      alive.push(p);
    }
    this.particles = alive;
  }

  // ── Draw ───────────────────────────────────────────────────────────────────

  /**
   * Render all live particles to `ctx` (Cocos2d updateParticleQuads logic).
   * Does NOT clear the canvas – callers are responsible for clearing beforehand.
   */
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;

    const cfg = this.cfg;
    const posType = cfg.positionType ?? 0;
    const composite = blendToComposite(cfg.blendFuncSource, cfg.blendFuncDestination);

    beginTintFrame();
    ctx.save();
    ctx.globalCompositeOperation = composite;

    for (const p of this.particles) {
      // Cocos2d updateParticleQuads: compute world position from positionType.
      //
      // Free (0):     particle stays in the world as the emitter moves.
      //               worldPos = spawnEmitterPos + localPhysicsPos
      // Relative (1): same draw formula as Free; startPos is shifted each update
      //               by the emitter's frame delta so particles translate with it.
      // Grouped (2):  particle locked to current emitter pos.
      //               worldPos = currentEmitterPos + localPhysicsPos
      //
      // Physics runs in Cocos2d local space (+Y up).
      // Canvas Y-flip: canvasY = emitterCanvasY - localY.
      let worldX: number;
      let worldY: number;

      if (posType === 2) {
        // Grouped: locked to current emitter
        worldX = this._worldX + p.x;
        worldY = this._worldY - p.y;
      } else {
        // Free / Relative: anchored to (possibly shifted) spawn emitter pos
        worldX = p.startPosX + p.x;
        worldY = p.startPosY - p.y;
      }

      // Integrate color from current frame's state (Cocos2d delta-per-frame model)
      const r = clamp01(p.r);
      const g = clamp01(p.g);
      const b = clamp01(p.b);
      const a = clamp01(p.a);

      const size = Math.max(0, p.size);
      if (a <= 0 || size <= 0) continue;

      // opacityModifyRGB: vertex RGB is pre-multiplied by alpha (Cocos2d).
      let drawR = r;
      let drawG = g;
      let drawB = b;
      if (cfg.opacityModifyRGB) {
        drawR *= a;
        drawG *= a;
        drawB *= a;
      }

      // Rotation: rotationIsDir computes from velocity direction each frame (Cocos2d quad logic).
      let rotRad: number;
      if (cfg.rotationIsDir) {
        const speed2 = p.vx * p.vx + p.vy * p.vy;
        if (speed2 > 1e-8) {
          // Velocity in Cocos2d (+Y-up) space → canvas rotation (clockwise positive).
          // atan2 gives CCW angle from +X; negate Y to flip into canvas space.
          rotRad = Math.atan2(-p.vy, p.vx);
        } else {
          rotRad = -p.rotation * DEG2RAD;
        }
      } else {
        // Cocos2d rotation is CCW-positive (degrees); canvas rotate() is CW-positive.
        rotRad = -p.rotation * DEG2RAD;
      }

      if (this.tex) {
        // RGB tint is cached; particle alpha via globalAlpha.
        // Premultiplied canvas compositing: contribution ≈ (tex×rgb)×texA×ga.
        // Non-OMR wants ×a once → ga=a. OMR+lighter wants ×a² → ga=a*a.
        // OMR+source-over: tint with premultiplied RGB and ga=a.
        if (cfg.opacityModifyRGB && composite === "lighter") {
          ctx.globalAlpha = a * a;
          blitTintedTexture(ctx, this.tex, worldX, worldY, size, rotRad, r, g, b);
        } else if (cfg.opacityModifyRGB) {
          ctx.globalAlpha = a;
          blitTintedTexture(
            ctx,
            this.tex,
            worldX,
            worldY,
            size,
            rotRad,
            drawR,
            drawG,
            drawB,
          );
        } else {
          ctx.globalAlpha = a;
          blitTintedTexture(ctx, this.tex, worldX, worldY, size, rotRad, r, g, b);
        }
      } else {
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(worldX, worldY);
        ctx.rotate(rotRad);
        ctx.fillStyle = `rgb(${Math.round(drawR * 255)},${Math.round(drawG * 255)},${Math.round(drawB * 255)})`;
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
    endTintFrame();
  }

  // ── Spawn ──────────────────────────────────────────────────────────────────

  /** @internal Exposed for unit tests. */
  spawnParticle(): Particle {
    const cfg = this.cfg;
    const scale = this.contentScale;

    // Allow lifespan = 0 (e.g. landEffect, explodeEffect: burst+die immediately after 1 frame)
    const lifespan = Math.max(
      0,
      cfg.particleLifespan + cfg.particleLifespanVariance * rng(-1, 1),
    );

    // In-game mode (usePlistSourcePosition=false): treat sourcePositionx/y as zero.
    // Particle Designer mode (true): use plist offset so the canvas emitter origin shifts.
    const srcX = this.usePlistSourcePosition ? cfg.sourcePositionx : 0;
    const srcY = this.usePlistSourcePosition ? cfg.sourcePositiony : 0;

    // Spawn local position in Cocos2d space (the sourcePosition + variance is the initial p->pos).
    // `contentScale` maps point units into scene pixels (UHD icons / gamesheets).
    const localX = (srcX + cfg.sourcePositionVariancex * rng(-1, 1)) * scale;
    const localY = (srcY + cfg.sourcePositionVariancey * rng(-1, 1)) * scale;

    // Per-particle color with variance
    const sR = clamp01(cfg.startColorRed + cfg.startColorVarianceRed * rng(-1, 1));
    const sG = clamp01(cfg.startColorGreen + cfg.startColorVarianceGreen * rng(-1, 1));
    const sB = clamp01(cfg.startColorBlue + cfg.startColorVarianceBlue * rng(-1, 1));
    const sA = clamp01(cfg.startColorAlpha + cfg.startColorVarianceAlpha * rng(-1, 1));
    const eR = clamp01(cfg.finishColorRed + cfg.finishColorVarianceRed * rng(-1, 1));
    const eG = clamp01(cfg.finishColorGreen + cfg.finishColorVarianceGreen * rng(-1, 1));
    const eB = clamp01(cfg.finishColorBlue + cfg.finishColorVarianceBlue * rng(-1, 1));
    const eA = clamp01(cfg.finishColorAlpha + cfg.finishColorVarianceAlpha * rng(-1, 1));

    const startSize =
      Math.max(0, cfg.startParticleSize + cfg.startParticleSizeVariance * rng(-1, 1)) * scale;
    const endSize =
      cfg.finishParticleSize < 0
        ? startSize
        : Math.max(0, cfg.finishParticleSize + cfg.finishParticleSizeVariance * rng(-1, 1)) *
          scale;

    const rotStart = cfg.rotationStart + cfg.rotationStartVariance * rng(-1, 1);
    const rotEnd = cfg.rotationEnd + cfg.rotationEndVariance * rng(-1, 1);

    const invLife = lifespan > 0 ? 1 / lifespan : 0;

    const p: Particle = {
      x: localX,
      y: localY,
      vx: 0,
      vy: 0,
      life: lifespan,
      lifespan,
      radialAccel: 0,
      tangentialAccel: 0,
      radius: 0,
      radiusDelta: 0,
      orbitAngle: 0,
      orbitSpeed: 0,
      r: sR,
      g: sG,
      b: sB,
      a: sA,
      deltaR: (eR - sR) * invLife,
      deltaG: (eG - sG) * invLife,
      deltaB: (eB - sB) * invLife,
      deltaA: (eA - sA) * invLife,
      size: startSize,
      deltaSize: (endSize - startSize) * invLife,
      rotation: rotStart,
      deltaRotation: (rotEnd - rotStart) * invLife,
      // Canvas-space emitter position at spawn (for Free/Relative positionType)
      startPosX: this._worldX,
      startPosY: this._worldY,
    };

    if (cfg.emitterType === 0) {
      // ── Gravity mode ────────────────────────────────────────────────────────
      const angleDeg = cfg.angle + cfg.angleVariance * rng(-1, 1);
      const angleRad = angleDeg * DEG2RAD;
      const speed = (cfg.speed + cfg.speedVariance * rng(-1, 1)) * scale;
      // Cocos2d: vx = cos(angle)*speed, vy = sin(angle)*speed  (in +Y-up local space)
      p.vx = Math.cos(angleRad) * speed;
      p.vy = Math.sin(angleRad) * speed;
      p.radialAccel =
        (cfg.radialAcceleration + cfg.radialAccelerationVariance * rng(-1, 1)) * scale;
      p.tangentialAccel =
        (cfg.tangentialAcceleration + cfg.tangentialAccelerationVariance * rng(-1, 1)) *
        scale;

      // rotationIsDir at spawn: initial rotation from velocity direction
      if (cfg.rotationIsDir) {
        p.rotation = Math.atan2(p.vy, p.vx) / DEG2RAD;
      }
    } else {
      // ── Radius mode ─────────────────────────────────────────────────────────
      const maxR =
        Math.max(0, cfg.maxRadius + cfg.maxRadiusVariance * rng(-1, 1)) * scale;
      const minR =
        Math.max(0, cfg.minRadius + cfg.minRadiusVariance * rng(-1, 1)) * scale;
      p.radius = maxR;
      p.radiusDelta = (minR - maxR) * invLife;
      p.orbitSpeed =
        (cfg.rotatePerSecond + cfg.rotatePerSecondVariance * rng(-1, 1)) * DEG2RAD;
      p.orbitAngle = (cfg.angle + cfg.angleVariance * rng(-1, 1)) * DEG2RAD;

      const yFlip = cfg.yCoordFlipped ?? 1;
      // Cocos2d CCParticleSystem.cpp radius mode initial position:
      //   pos.x = -cos(angle) * radius
      //   pos.y = -sin(angle) * radius * yCoordFlipped
      p.x = -Math.cos(p.orbitAngle) * p.radius;
      p.y = -Math.sin(p.orbitAngle) * p.radius * yFlip;
    }

    return p;
  }

  // ── Step ───────────────────────────────────────────────────────────────────

  /** @internal Exposed for unit tests. */
  stepParticle(p: Particle, dt: number): void {
    const cfg = this.cfg;
    const yFlip = cfg.yCoordFlipped ?? 1;
    const scale = this.contentScale;

    // Integrate per-particle color, size, rotation deltas (Cocos2d per-frame model)
    p.r += p.deltaR * dt;
    p.g += p.deltaG * dt;
    p.b += p.deltaB * dt;
    p.a += p.deltaA * dt;
    p.size = Math.max(0, p.size + p.deltaSize * dt);

    if (cfg.emitterType === 0) {
      // ── Gravity mode (CCParticleSystem.cpp modeA) ────────────────────────────
      //
      // Port of CCParticleSystem::updateWithNoTransform():
      //   radial  = normalize(pos) * radialAccel
      //   tangential: swap(radial.x, radial.y), then negate X component, multiply by tangentialAccel
      //   dir += (radial + tangential + gravity) * yCoordFlipped * dt
      //   pos += dir * dt
      //
      const dist = Math.sqrt(p.x * p.x + p.y * p.y);

      let accX = cfg.gravityx * scale;
      let accY = cfg.gravityy * scale;

      if (dist > 1e-6) {
        const nx = p.x / dist;
        const ny = p.y / dist;

        // Radial component
        accX += nx * p.radialAccel;
        accY += ny * p.radialAccel;

        // Tangential: swap (nx,ny) → (ny,nx); then negate new-X; multiply by tangentialAccel
        // Result: tx = -ny * tangentialAccel,  ty = nx * tangentialAccel
        accX += -ny * p.tangentialAccel;
        accY += nx * p.tangentialAccel;
      }

      // yCoordFlipped scales the velocity update (applied once to dir, not to pos)
      p.vx += accX * yFlip * dt;
      p.vy += accY * yFlip * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Integrate sprite rotation unless rotationIsDir overrides it at draw time
      if (!cfg.rotationIsDir) {
        p.rotation += p.deltaRotation * dt;
      }
    } else {
      // ── Radius mode (CCParticleSystem.cpp modeB) ─────────────────────────────
      //
      //   radius   += radiusDelta * dt
      //   angle    += orbitSpeed * dt
      //   pos.x     = -cos(angle) * radius
      //   pos.y     = -sin(angle) * radius * yCoordFlipped
      //
      p.radius += p.radiusDelta * dt;
      p.orbitAngle += p.orbitSpeed * dt;
      p.x = -Math.cos(p.orbitAngle) * p.radius;
      p.y = -Math.sin(p.orbitAngle) * p.radius * yFlip;

      p.rotation += p.deltaRotation * dt;
    }
  }

  // ── Test / introspection helpers ───────────────────────────────────────────

  /** Read-only snapshot of all live particles (for unit tests). */
  getParticles(): readonly Particle[] {
    return this.particles;
  }
}
