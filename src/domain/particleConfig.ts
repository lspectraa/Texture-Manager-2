/**
 * Cocos2d particle plist domain types.
 * Field names match the exact plist keys used by Cocos2d Particle Designer and GD.
 */

/** 0 = Gravity mode, 1 = Radius mode */
export type EmitterType = 0 | 1;

/** 0 = Free (world trail), 1 = Relative (shift with emitter), 2 = Grouped (locked to emitter) */
export type PositionType = 0 | 1 | 2;
export const POSITION_TYPE_FREE = 0 as const;
export const POSITION_TYPE_RELATIVE = 1 as const;
export const POSITION_TYPE_GROUPED = 2 as const;

/**
 * All editable Cocos2d particle keys, using exact plist key names.
 * Unused mode fields are still stored so round-trips are lossless.
 */
export interface ParticleConfig {
  // ── Emitter ──────────────────────────────────────────────────────────────
  emitterType: EmitterType;
  /** -1 = run forever */
  duration: number;
  maxParticles: number;
  sourcePositionx: number;
  sourcePositiony: number;
  sourcePositionVariancex: number;
  sourcePositionVariancey: number;
  /**
   * 0=Free (world trail as emitter moves), 1=Relative (particles shift with emitter),
   * 2=Grouped (particles locked to emitter). Cocos2d plist key: `positionType`. Default: 0.
   */
  positionType: PositionType;
  /**
   * Y-axis coordinate flip factor applied during physics. 1 = standard Cocos2d-x (+Y up).
   * Cocos2d plist key: `yCoordFlipped`. Default: 1.
   */
  yCoordFlipped: number;
  /**
   * When true, particle RGB channels are pre-multiplied by alpha at spawn (additive trail look).
   * Cocos2d plist key: `opacityModifyRGB`. Default: false.
   */
  opacityModifyRGB: boolean;

  // ── Lifetime / emission ───────────────────────────────────────────────────
  particleLifespan: number;
  particleLifespanVariance: number;
  /**
   * Emission rate stored in the plist; Cocos2d convention = maxParticles / particleLifespan.
   * Kept as an explicit field for round-trip fidelity even though it is derivable.
   */
  emissionRate: number;

  // ── Gravity mode motion ───────────────────────────────────────────────────
  angle: number;
  angleVariance: number;
  speed: number;
  speedVariance: number;
  gravityx: number;
  gravityy: number;
  radialAcceleration: number;
  radialAccelerationVariance: number;
  tangentialAcceleration: number;
  tangentialAccelerationVariance: number;
  /**
   * When true, particle rotation tracks the direction of travel (velocity angle).
   * Cocos2d plist key: `rotationIsDir`.
   */
  rotationIsDir: boolean;

  // ── Radius mode motion ────────────────────────────────────────────────────
  maxRadius: number;
  maxRadiusVariance: number;
  minRadius: number;
  minRadiusVariance: number;
  rotatePerSecond: number;
  rotatePerSecondVariance: number;

  // ── Start color (RGBA, each 0–1) ──────────────────────────────────────────
  startColorRed: number;
  startColorGreen: number;
  startColorBlue: number;
  startColorAlpha: number;
  startColorVarianceRed: number;
  startColorVarianceGreen: number;
  startColorVarianceBlue: number;
  startColorVarianceAlpha: number;

  // ── Finish color (RGBA, each 0–1) ─────────────────────────────────────────
  finishColorRed: number;
  finishColorGreen: number;
  finishColorBlue: number;
  finishColorAlpha: number;
  finishColorVarianceRed: number;
  finishColorVarianceGreen: number;
  finishColorVarianceBlue: number;
  finishColorVarianceAlpha: number;

  // ── Size ──────────────────────────────────────────────────────────────────
  startParticleSize: number;
  startParticleSizeVariance: number;
  finishParticleSize: number;
  finishParticleSizeVariance: number;

  // ── Rotation ──────────────────────────────────────────────────────────────
  rotationStart: number;
  rotationStartVariance: number;
  rotationEnd: number;
  rotationEndVariance: number;

  // ── Blend ────────────────────────────────────────────────────────────────
  /** OpenGL blend factor integer, e.g. 770 = GL_SRC_ALPHA */
  blendFuncSource: number;
  /** OpenGL blend factor integer, e.g. 1 = GL_ONE, 771 = GL_ONE_MINUS_SRC_ALPHA */
  blendFuncDestination: number;

  // ── Texture ───────────────────────────────────────────────────────────────
  textureFileName: string;
  /** Base64-encoded gzip-compressed TIFF/PNG texture embed. Empty = no embed. */
  textureImageData: string;
}

/** Emission rate derived per Cocos2d convention: maxParticles / particleLifespan */
export function getEmissionRate(config: ParticleConfig): number {
  if (config.emissionRate > 0) return config.emissionRate;
  if (config.particleLifespan <= 0) return config.maxParticles;
  return config.maxParticles / config.particleLifespan;
}

/**
 * Keep `emissionRate` in sync with Cocos2d convention after max/lifespan edits.
 * Callers that change `maxParticles` or `particleLifespan` should apply this.
 */
export function withSyncedEmissionRate(config: ParticleConfig): ParticleConfig {
  const emissionRate =
    config.particleLifespan > 0
      ? config.maxParticles / config.particleLifespan
      : config.maxParticles;
  if (config.emissionRate === emissionRate) return config;
  return { ...config, emissionRate };
}

/** Default config: a golden-orange additive fountain emitter. */
export const DEFAULT_PARTICLE_CONFIG: ParticleConfig = {
  emitterType: 0,
  duration: -1,
  maxParticles: 100,
  sourcePositionx: 0,
  sourcePositiony: 0,
  sourcePositionVariancex: 0,
  sourcePositionVariancey: 0,
  positionType: 0,
  yCoordFlipped: 1,
  opacityModifyRGB: false,

  particleLifespan: 1.0,
  particleLifespanVariance: 0.25,
  emissionRate: 100,

  angle: 90,
  angleVariance: 10,
  speed: 160,
  speedVariance: 30,
  gravityx: 0,
  gravityy: 0,
  radialAcceleration: 0,
  radialAccelerationVariance: 0,
  tangentialAcceleration: 0,
  tangentialAccelerationVariance: 0,
  rotationIsDir: false,

  maxRadius: 200,
  maxRadiusVariance: 0,
  minRadius: 0,
  minRadiusVariance: 0,
  rotatePerSecond: 45,
  rotatePerSecondVariance: 0,

  startColorRed: 1.0,
  startColorGreen: 0.6,
  startColorBlue: 0.0,
  startColorAlpha: 1.0,
  startColorVarianceRed: 0,
  startColorVarianceGreen: 0,
  startColorVarianceBlue: 0,
  startColorVarianceAlpha: 0,

  finishColorRed: 1.0,
  finishColorGreen: 0.0,
  finishColorBlue: 0.0,
  finishColorAlpha: 0.0,
  finishColorVarianceRed: 0,
  finishColorVarianceGreen: 0,
  finishColorVarianceBlue: 0,
  finishColorVarianceAlpha: 0,

  startParticleSize: 24,
  startParticleSizeVariance: 4,
  finishParticleSize: 4,
  finishParticleSizeVariance: 2,

  rotationStart: 0,
  rotationStartVariance: 0,
  rotationEnd: 0,
  rotationEndVariance: 0,

  // SRC_ALPHA / ONE — additive, typical for GD trail effects
  blendFuncSource: 770,
  blendFuncDestination: 1,

  textureFileName: "",
  textureImageData: "",
};

/** Factory function returning a fresh copy of the default particle config. */
export function defaultParticleConfig(): ParticleConfig {
  return { ...DEFAULT_PARTICLE_CONFIG };
}

// ─── Blend mode helpers ────────────────────────────────────────────────────

/** OpenGL blend factor → human-readable label */
export const GL_BLEND_LABELS: Record<number, string> = {
  0: "GL_ZERO",
  1: "GL_ONE",
  768: "GL_SRC_COLOR",
  769: "GL_ONE_MINUS_SRC_COLOR",
  770: "GL_SRC_ALPHA",
  771: "GL_ONE_MINUS_SRC_ALPHA",
  772: "GL_DST_ALPHA",
  773: "GL_ONE_MINUS_DST_ALPHA",
  774: "GL_DST_COLOR",
  775: "GL_ONE_MINUS_DST_COLOR",
};

/** Named preset blends commonly used in GD particle packs. */
export interface BlendPreset {
  label: string;
  src: number;
  dst: number;
}

export const BLEND_PRESETS: BlendPreset[] = [
  { label: "Additive (SRC_ALPHA / ONE)", src: 770, dst: 1 },
  { label: "Alpha blend (SRC_ALPHA / ONE_MINUS_SRC_ALPHA)", src: 770, dst: 771 },
  { label: "Pre-multiplied alpha (ONE / ONE_MINUS_SRC_ALPHA)", src: 1, dst: 771 },
  { label: "Pure additive (ONE / ONE)", src: 1, dst: 1 },
];

/**
 * Map a pair of OpenGL blend factors to a Canvas 2D globalCompositeOperation.
 * Canvas 2D doesn't support arbitrary blend equations; this maps common GD combos.
 */
export function blendToCompositeOp(src: number, dst: number): GlobalCompositeOperation {
  // Additive: SRC_ALPHA/ONE or ONE/ONE
  if ((src === 770 && dst === 1) || (src === 1 && dst === 1)) return "lighter";
  // Multiply approximation
  if (src === 774 && dst === 771) return "multiply";
  // Default: normal alpha blend
  return "source-over";
}
