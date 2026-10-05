/**
 * Menu Recolor hue-band mixer. Constants match `src-tauri/src/core/color.rs`.
 * Create Geode Buttons keeps its own whole-sprite preview path.
 */

export const NEUTRAL_SAT_MAX = 0.12;
export const GOLD_SAT_MIN = 0.28;
export const GOLD_CENTER_DEG = 42;
export const GOLD_RADIUS_DEG = 22;
export const CHROMATIC_RADIUS_DEG = 40;

export type BandId =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "aqua"
  | "blue"
  | "purple"
  | "magenta"
  | "neutral"
  | "gold";

export const CHROMATIC_BANDS: ReadonlyArray<readonly [BandId, number]> = [
  ["red", 0],
  ["orange", 30],
  ["yellow", 60],
  ["green", 120],
  ["aqua", 180],
  ["blue", 240],
  ["purple", 275],
  ["magenta", 315],
];

export const ALL_BANDS: readonly BandId[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta",
  "neutral",
  "gold",
];

export type BandDelta = {
  hueDeg: number;
  satDelta: number;
  valDelta: number;
};

export type ColorRecipe = {
  bands: Record<BandId, BandDelta>;
  locks: { neutral: boolean; gold: boolean };
  /** Point Color hook. This pass always stores an empty list and does not apply it. */
  points: [];
};

export function zeroBand(): BandDelta {
  return { hueDeg: 0, satDelta: 0, valDelta: 0 };
}

export function identityRecipe(): ColorRecipe {
  const bands = {} as Record<BandId, BandDelta>;
  for (const band of ALL_BANDS) {
    bands[band] = zeroBand();
  }
  return {
    bands,
    locks: { neutral: true, gold: true },
    points: [],
  };
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const v = max;
  const s = max <= 1e-6 ? 0 : delta / max;
  let h = 0;
  if (delta > 1e-6) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
  }
  h /= 6;
  if (h < 0) {
    h += 1;
  }
  return [h, s, v];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const h6 = Math.max(0, (h - Math.floor(h)) * 6);
  const i = Math.floor(h6);
  const f = h6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

/** Same Value curve as Create Geode Buttons `apply_value_delta_rgb`. */
export function applyValueDeltaRgb(
  r: number,
  g: number,
  b: number,
  valDelta: number,
): [number, number, number] {
  const d = clamp01(Math.abs(valDelta));
  if (valDelta >= 0) {
    return [r + (1 - r) * d, g + (1 - g) * d, b + (1 - b) * d];
  }
  return [r * (1 - d), g * (1 - d), b * (1 - d)];
}

function smoothstep01(t: number): number {
  const clamped = clamp01(t);
  return clamped * clamped * (3 - 2 * clamped);
}

function circularDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

function hueWeight(hue: number, center: number, radius: number): number {
  if (radius <= 1e-6) {
    return 0;
  }
  const dist = circularDist(hue, center);
  if (dist >= radius) {
    return 0;
  }
  return smoothstep01(1 - dist / radius);
}

function weightedChromatic(hue: number, recipe: ColorRecipe): [number, number, number] {
  const radius = CHROMATIC_RADIUS_DEG / 360;
  let hueDeg = 0;
  let satDelta = 0;
  let valDelta = 0;
  let sum = 0;
  for (const [id, centerDeg] of CHROMATIC_BANDS) {
    const weight = hueWeight(hue, centerDeg / 360, radius);
    if (weight <= 0) {
      continue;
    }
    const delta = recipe.bands[id];
    hueDeg += weight * delta.hueDeg;
    satDelta += weight * delta.satDelta;
    valDelta += weight * delta.valDelta;
    sum += weight;
  }
  if (sum <= 1e-6) {
    return [0, 0, 0];
  }
  return [hueDeg / sum, satDelta / sum, valDelta / sum];
}

function mixedDeltas(
  r: number,
  g: number,
  b: number,
  recipe: ColorRecipe,
  strength: number,
): [number, number, number] | null {
  const [h, s] = rgbToHsv(r, g, b);
  let hueDeg: number;
  let satDelta: number;
  let valDelta: number;
  if (s <= NEUTRAL_SAT_MAX) {
    const neutral = recipe.bands.neutral;
    if (recipe.locks.neutral) {
      hueDeg = 0;
      satDelta = 0;
      valDelta = neutral.valDelta;
    } else {
      hueDeg = neutral.hueDeg;
      satDelta = neutral.satDelta;
      valDelta = neutral.valDelta;
    }
  } else {
    const [ch, cs, cv] = weightedChromatic(h, recipe);
    const goldM =
      s >= GOLD_SAT_MIN ? hueWeight(h, GOLD_CENTER_DEG / 360, GOLD_RADIUS_DEG / 360) : 0;
    if (recipe.locks.gold) {
      const scale = 1 - goldM;
      hueDeg = ch * scale;
      satDelta = cs * scale;
      valDelta = cv * scale;
    } else {
      const gold = recipe.bands.gold;
      const keep = 1 - goldM;
      hueDeg = ch * keep + gold.hueDeg * goldM;
      satDelta = cs * keep + gold.satDelta * goldM;
      valDelta = cv * keep + gold.valDelta * goldM;
    }
  }
  hueDeg *= strength;
  satDelta *= strength;
  valDelta *= strength;
  if (Math.abs(hueDeg) < 1e-6 && Math.abs(satDelta) < 1e-6 && Math.abs(valDelta) < 1e-6) {
    return null;
  }
  return [hueDeg, satDelta, valDelta];
}

export function applyColorRecipeToRgba(
  r: number,
  g: number,
  b: number,
  a: number,
  recipe: ColorRecipe,
  strength: number,
): [number, number, number, number] {
  const scaled = clamp01(strength);
  if (a === 0 || scaled <= 1e-6) {
    return [r, g, b, a];
  }
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const mixed = mixedDeltas(rf, gf, bf, recipe, scaled);
  if (!mixed) {
    return [r, g, b, a];
  }
  const [hueDeg, satDelta, valDelta] = mixed;
  const [h, s, v] = rgbToHsv(rf, gf, bf);
  const nh = (((h + hueDeg / 360) % 1) + 1) % 1;
  const ns = clamp01(s + satDelta);
  const nv = clamp01(v);
  const [nr, ng, nb] = hsvToRgb(nh, ns, nv);
  const [vr, vg, vb] = applyValueDeltaRgb(clamp01(nr), clamp01(ng), clamp01(nb), valDelta);
  return [
    Math.round(clamp01(vr) * 255),
    Math.round(clamp01(vg) * 255),
    Math.round(clamp01(vb) * 255),
    a,
  ];
}

/** In-place RGBA bytes. Used by the virtualized grid preview. */
export function applyColorRecipeToBytes(
  bytes: Uint8ClampedArray,
  recipe: ColorRecipe,
  strength: number,
): void {
  for (let index = 0; index + 3 < bytes.length; index += 4) {
    const [r, g, b, a] = applyColorRecipeToRgba(
      bytes[index],
      bytes[index + 1],
      bytes[index + 2],
      bytes[index + 3],
      recipe,
      strength,
    );
    bytes[index] = r;
    bytes[index + 1] = g;
    bytes[index + 2] = b;
    bytes[index + 3] = a;
  }
}
