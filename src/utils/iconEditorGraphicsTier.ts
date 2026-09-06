/** Geometry Dash icon sheet graphics tier (filename suffix). */
export type IconEditorGraphicsTier = "uhd" | "hd" | "low";

export function graphicsTierFromStem(stem: string): IconEditorGraphicsTier {
  const lower = stem.trim().toLowerCase();
  if (lower.endsWith("-uhd")) {
    return "uhd";
  }
  if (lower.endsWith("-hd")) {
    return "hd";
  }
  return "low";
}

export function graphicsTierFromPlistPath(plistPath: string): IconEditorGraphicsTier {
  const fileName = plistPath.split(/[/\\]/).pop() ?? "";
  const stem = fileName.replace(/\.plist$/i, "");
  return graphicsTierFromStem(stem);
}

/** Preview upscaling so HD/low sheets match UHD footprint in the editor. */
export function tierContentScale(tier: IconEditorGraphicsTier): number {
  switch (tier) {
    case "uhd":
      return 1;
    case "hd":
      return 2;
    case "low":
      return 4;
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

export function contentScaleForPlistPath(plistPath: string): number {
  return tierContentScale(graphicsTierFromPlistPath(plistPath));
}

const GLOW_THICKNESS_MIN = 1;
const GLOW_THICKNESS_MAX = 128;

export function clampGlowThickness(value: number): number {
  return Math.min(GLOW_THICKNESS_MAX, Math.max(GLOW_THICKNESS_MIN, Math.round(value)));
}

/** UHD-equivalent glow width → native pixels for this sheet tier (HD ÷2, low ÷4). */
export function glowThicknessForContentScale(userThickness: number, contentScale: number): number {
  return clampGlowThickness(userThickness / contentScale);
}
