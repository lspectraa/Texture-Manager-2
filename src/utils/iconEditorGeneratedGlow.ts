import { glowThicknessForContentScale } from "./iconEditorGraphicsTier";

export type GlowGenPartId = "01" | "02" | "03" | "04";

export type GlowGenSettings = {
  enabled: boolean;
  thickness: number;
  compositeLayers: boolean;
};

export type GeneratedGlowFrame = {
  key: string;
  frameName: string;
  canvas: HTMLCanvasElement;
  spriteSize: { width: number; height: number };
  spriteOffset: { x: number; y: number };
  isNewFrame: boolean;
  partId: GlowGenPartId | null;
};

export type GlowGenSourceLayer = {
  canvas: HTMLCanvasElement;
  offset: { x: number; y: number };
};

/** Named icon layer used to build glow source pixels and regeneration tokens. */
export type GlowGenNamedLayer = {
  name: string;
  canvas: HTMLCanvasElement | null;
  offset: { x: number; y: number };
};

export type GlowGenSourceSpec = {
  compositeLayers: boolean;
  primary: GlowGenNamedLayer;
  secondary: GlowGenNamedLayer;
  extra: GlowGenNamedLayer;
};

export type GlowCompositeLayout = {
  canvas: HTMLCanvasElement;
  /** Primary sprite center in the composite image (canvas Y-down). */
  primaryCenterX: number;
  primaryCenterY: number;
};

export type GlowGenJob = {
  key: string;
  enabled: boolean;
  thickness: number;
  compositeLayers: boolean;
  sourceCanvas: HTMLCanvasElement | null;
  sourceToken: string;
  glowFrameName: string;
  glowOffset: { x: number; y: number };
  isNewFrame: boolean;
  partId: GlowGenPartId | null;
};

export const DEFAULT_GLOW_GEN_SETTINGS: GlowGenSettings = {
  enabled: false,
  thickness: 4,
  compositeLayers: true,
};

export function glowGenKeyForComponent(args: {
  isRobot: boolean;
  isSpider: boolean;
  robotPartId: GlowGenPartId;
  spiderPartId: GlowGenPartId;
}): string {
  if (args.isRobot) {
    return `robot:${args.robotPartId}`;
  }
  if (args.isSpider) {
    return `spider:${args.spiderPartId}`;
  }
  return "icon";
}

export function resolveGlowGenSettings(
  settingsByKey: Record<string, GlowGenSettings>,
  key: string,
  contentScale = 1,
): GlowGenSettings {
  if (settingsByKey[key]) {
    return settingsByKey[key];
  }
  return {
    ...DEFAULT_GLOW_GEN_SETTINGS,
    thickness: glowThicknessForContentScale(DEFAULT_GLOW_GEN_SETTINGS.thickness, contentScale),
  };
}

export type GlowPlistPoint = { x: number; y: number };
export type GlowTrimInsets = { left: number; top: number; right: number; bottom: number };

/** Same fold as `merger::apply_alpha_trim_to_frame_dict` / Icon Editor merge-adjusted offset. */
export function glowMakerPlistOffset(
  primaryOffset: GlowPlistPoint,
  primaryTrim: GlowTrimInsets,
): GlowPlistPoint {
  return {
    x: primaryOffset.x + primaryTrim.left / 2 - primaryTrim.right / 2,
    y: primaryOffset.y - primaryTrim.top / 2 + primaryTrim.bottom / 2,
  };
}

export function isGlowMakerOwnedFrame(
  frameName: string,
  jobs: readonly Pick<GlowGenJob, "enabled" | "glowFrameName">[],
  generated: readonly Pick<GeneratedGlowFrame, "frameName">[],
): boolean {
  if (!frameName) {
    return false;
  }
  return (
    generated.some((frame) => frame.frameName === frameName) ||
    jobs.some((job) => job.enabled && job.glowFrameName === frameName)
  );
}

export function glowMakerOwnedOffset(
  frameName: string,
  jobs: readonly Pick<GlowGenJob, "enabled" | "glowFrameName" | "glowOffset">[],
  generated: readonly Pick<GeneratedGlowFrame, "frameName" | "spriteOffset">[],
): GlowPlistPoint | null {
  if (!frameName) {
    return null;
  }
  const generatedFrame = generated.find((frame) => frame.frameName === frameName);
  if (!generatedFrame) {
    return null;
  }
  const job = jobs.find((entry) => entry.enabled && entry.glowFrameName === frameName);
  if (job) {
    return job.glowOffset;
  }
  return generatedFrame.spriteOffset;
}

export function glowGenJobsSignature(jobs: readonly GlowGenJob[]): string {
  return jobs
    .filter((job) => job.enabled)
    .map((job) =>
      [
        job.key,
        job.thickness,
        job.compositeLayers ? "composite" : "primary",
        job.glowFrameName,
        job.sourceToken,
      ].join(":"),
    )
    .join("|");
}

/** Signature of enabled Generate Glow settings, used to know when live glow is unsaved. */
export function glowGenSettingsSignature(
  settingsByKey: Record<string, GlowGenSettings>,
): string {
  return Object.entries(settingsByKey)
    .filter(([, settings]) => settings.enabled)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, settings]) =>
        `${key}:${settings.thickness}:${settings.compositeLayers ? "composite" : "primary"}`,
    )
    .join("|");
}

const glowSourceCanvasIds = new WeakMap<HTMLCanvasElement, number>();
let nextGlowSourceCanvasId = 1;

/** Stable identity for a source canvas so pixel replacements retrigger glow without hashing. */
export function glowSourceCanvasIdentity(canvas: HTMLCanvasElement | null): string {
  if (!canvas) {
    return "none";
  }
  let id = glowSourceCanvasIds.get(canvas);
  if (id === undefined) {
    id = nextGlowSourceCanvasId;
    nextGlowSourceCanvasId += 1;
    glowSourceCanvasIds.set(canvas, id);
  }
  return `${id}:${canvas.width}x${canvas.height}`;
}

export function glowGenNamedLayerToken(layer: GlowGenNamedLayer): string {
  return `${layer.name}:${glowSourceCanvasIdentity(layer.canvas)}@${layer.offset.x},${layer.offset.y}`;
}

const stripGlowFrameExt = (name: string): string => name.replace(/\.png$/i, "").trim();

/** Capsule (`_3_001`) and existing glow sprites must never feed Generate Glow. */
export function isExcludedFromGlowComposite(frameName: string): boolean {
  if (!frameName.trim()) {
    return false;
  }
  const base = stripGlowFrameExt(frameName);
  if (/_glow_001$/i.test(base)) {
    return true;
  }
  return /^.+_\d+_3_001$/i.test(base);
}

export function glowGenBodyLayer(
  name: string,
  canvas: HTMLCanvasElement | null,
  offset: { x: number; y: number },
): GlowGenNamedLayer {
  if (!name.trim() || isExcludedFromGlowComposite(name)) {
    return { name, canvas: null, offset: { x: 0, y: 0 } };
  }
  return { name, canvas, offset };
}

/**
 * Regeneration key for Generate Glow.
 * Composite: primary + secondary + extra (pixels or offset). Primary-only: the primary sprite.
 * Cosmetic tint colors are not part of this token. Capsule and glow frames are ignored.
 */
export function glowGenSourceToken(spec: GlowGenSourceSpec): string {
  if (!spec.compositeLayers) {
    return `primary|${glowGenNamedLayerToken(spec.primary)}`;
  }
  return [
    "composite",
    glowGenNamedLayerToken(spec.secondary),
    glowGenNamedLayerToken(spec.primary),
    glowGenNamedLayerToken(spec.extra),
  ].join("|");
}

/** Layers fed into glow: primary alone, or secondary + primary + extra. */
export function glowGenSourceLayers(spec: GlowGenSourceSpec): GlowGenSourceLayer[] {
  if (!spec.compositeLayers) {
    return spec.primary.canvas
      ? [{ canvas: spec.primary.canvas, offset: spec.primary.offset }]
      : [];
  }
  if (!spec.primary.canvas) {
    return [];
  }
  return [spec.secondary, spec.primary, spec.extra].flatMap((layer) =>
    layer.canvas ? [{ canvas: layer.canvas, offset: layer.offset }] : [],
  );
}

/**
 * Sprite offset that keeps the composite glow centered on the same node as the primary.
 * The stage places sprites by image center + spriteOffset; a composite larger than the
 * primary is not centered on the primary, so the glow must be shifted by that delta.
 */
export function glowOffsetForCompositeSource(
  primaryOffset: { x: number; y: number },
  compositeWidth: number,
  compositeHeight: number,
  primaryCenterX: number,
  primaryCenterY: number,
): { x: number; y: number } {
  return {
    x: primaryOffset.x - primaryCenterX + compositeWidth / 2,
    y: primaryOffset.y + primaryCenterY - compositeHeight / 2,
  };
}

/** Align secondary/primary/extra the same way Glow Maker composites before glow. */
export function compositeGlowSourceLayers(
  layers: readonly GlowGenSourceLayer[],
  primaryOffset: { x: number; y: number },
): GlowCompositeLayout | null {
  if (layers.length === 0) {
    return null;
  }
  if (layers.length === 1) {
    const canvas = layers[0].canvas;
    return {
      canvas,
      primaryCenterX: canvas.width / 2,
      primaryCenterY: canvas.height / 2,
    };
  }

  const positioned = layers.map((layer) => {
    const centerX = layer.offset.x - primaryOffset.x;
    const centerY = -(layer.offset.y - primaryOffset.y);
    const halfW = layer.canvas.width / 2;
    const halfH = layer.canvas.height / 2;
    return {
      canvas: layer.canvas,
      left: centerX - halfW,
      top: centerY - halfH,
      right: centerX + halfW,
      bottom: centerY + halfH,
    };
  });

  const minLeft = Math.min(...positioned.map((layer) => layer.left));
  const minTop = Math.min(...positioned.map((layer) => layer.top));
  const maxRight = Math.max(...positioned.map((layer) => layer.right));
  const maxBottom = Math.max(...positioned.map((layer) => layer.bottom));
  const width = Math.max(1, Math.ceil(maxRight - minLeft));
  const height = Math.max(1, Math.ceil(maxBottom - minTop));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    const fallback = layers[0].canvas;
    return {
      canvas: fallback,
      primaryCenterX: fallback.width / 2,
      primaryCenterY: fallback.height / 2,
    };
  }
  context.imageSmoothingEnabled = false;
  for (const layer of positioned) {
    context.drawImage(layer.canvas, Math.round(layer.left - minLeft), Math.round(layer.top - minTop));
  }
  return {
    canvas,
    primaryCenterX: -minLeft,
    primaryCenterY: -minTop,
  };
}
