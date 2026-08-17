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
): GlowGenSettings {
  return settingsByKey[key] ?? DEFAULT_GLOW_GEN_SETTINGS;
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

/** Align secondary/primary/extra the same way Glow Maker composites before glow. */
export function compositeGlowSourceLayers(
  layers: readonly GlowGenSourceLayer[],
  primaryOffset: { x: number; y: number },
): HTMLCanvasElement | null {
  if (layers.length === 0) {
    return null;
  }
  if (layers.length === 1) {
    return layers[0].canvas;
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
    return layers[0].canvas;
  }
  context.imageSmoothingEnabled = false;
  for (const layer of positioned) {
    context.drawImage(layer.canvas, Math.round(layer.left - minLeft), Math.round(layer.top - minTop));
  }
  return canvas;
}
