import {
  ALL_BANDS,
  type BandDelta,
  type BandId,
  type ColorRecipe,
  identityRecipe,
  zeroBand,
} from "./menuRecolorColor";

export type {
  BandDelta,
  BandId,
  ColorRecipe,
} from "./menuRecolorColor";

export const MENU_RECOLOR_RULE_SETS = ["menuChrome", "exceptIcons", "facesOnly"] as const;

export type MenuRecolorRuleSetId = (typeof MENU_RECOLOR_RULE_SETS)[number];

export type SpriteOverride =
  | { mode: "inherit" }
  | { mode: "off" }
  | { mode: "strength"; amount: number }
  | { mode: "custom"; recipe: ColorRecipe };

export type MenuRecolorOptions = {
  ruleSet: MenuRecolorRuleSetId;
  recipe: ColorRecipe;
  overrides: Record<string, SpriteOverride>;
  includes: Record<string, boolean>;
};

export type MenuRecolorRecipeFile = {
  ruleSetId: MenuRecolorRuleSetId;
  recipe: ColorRecipe;
  overrides: Record<string, SpriteOverride>;
};

export type DiscoveredSprite = {
  id: string;
  name: string;
  relativePath: string;
  tags: string[];
  sheetStem: string | null;
};

export function defaultMenuRecolorOptions(): MenuRecolorOptions {
  return {
    ruleSet: "menuChrome",
    recipe: identityRecipe(),
    overrides: {},
    includes: {},
  };
}

export function tagSprite(relativePath: string, fileName: string, sheetStem: string | null): string[] {
  const tags: string[] = [];
  if (pathHasIconsSegment(relativePath)) {
    tags.push("icons");
  }
  if (isFaceName(fileName)) {
    tags.push("faces");
  }
  if (fileName.toLowerCase().startsWith("geode.")) {
    tags.push("geode");
  }
  if (isFontName(fileName)) {
    tags.push("font");
  }
  const stem = sheetStem?.trim() ?? "";
  if (stem) {
    tags.push(`sheet:${stem}`);
  }
  return tags;
}

export function ruleSetIncludes(tags: readonly string[], rule: MenuRecolorRuleSetId): boolean {
  const has = (name: string) => tags.some((tag) => tag === name);
  switch (rule) {
    case "menuChrome":
      return !has("faces") && !has("icons");
    case "exceptIcons":
      return !has("icons");
    case "facesOnly":
      return has("faces");
    default: {
      const neverRule: never = rule;
      return neverRule;
    }
  }
}

export function includesForRuleSet(
  sprites: readonly { id: string; tags: readonly string[] }[],
  rule: MenuRecolorRuleSetId,
): Record<string, boolean> {
  const includes: Record<string, boolean> = {};
  for (const sprite of sprites) {
    includes[sprite.id] = ruleSetIncludes(sprite.tags, rule);
  }
  return includes;
}

export function effectiveRecolor(
  included: boolean,
  global: ColorRecipe,
  override: SpriteOverride | undefined,
): { recipe: ColorRecipe; strength: number } | null {
  const mode = override ?? { mode: "inherit" };
  switch (mode.mode) {
    case "off":
      return null;
    case "inherit":
      return included ? { recipe: global, strength: 1 } : null;
    case "strength":
      return { recipe: global, strength: clampStrength(mode.amount) };
    case "custom":
      return { recipe: normalizeRecipe(mode.recipe), strength: 1 };
    default: {
      const neverMode: never = mode;
      return neverMode;
    }
  }
}

export function normalizeRecipe(recipe: ColorRecipe): ColorRecipe {
  const bands = {} as Record<BandId, BandDelta>;
  for (const band of ALL_BANDS) {
    const existing = recipe.bands[band];
    bands[band] = existing
      ? {
          hueDeg: finiteOrZero(existing.hueDeg),
          satDelta: finiteOrZero(existing.satDelta),
          valDelta: finiteOrZero(existing.valDelta),
        }
      : zeroBand();
  }
  return {
    bands,
    locks: {
      neutral: recipe.locks?.neutral ?? true,
      gold: recipe.locks?.gold ?? true,
    },
    points: [],
  };
}

export function normalizeOverride(override: SpriteOverride): SpriteOverride {
  switch (override.mode) {
    case "inherit":
    case "off":
      return override;
    case "strength":
      return { mode: "strength", amount: clampStrength(override.amount) };
    case "custom":
      return { mode: "custom", recipe: normalizeRecipe(override.recipe) };
    default: {
      const neverOverride: never = override;
      return neverOverride;
    }
  }
}

export function recipeFileFromOptions(options: MenuRecolorOptions): MenuRecolorRecipeFile {
  const overrides: Record<string, SpriteOverride> = {};
  for (const [id, override] of Object.entries(options.overrides)) {
    overrides[id] = normalizeOverride(override);
  }
  return {
    ruleSetId: options.ruleSet,
    recipe: normalizeRecipe(options.recipe),
    overrides,
  };
}

export function isRuleSetId(value: string): value is MenuRecolorRuleSetId {
  return (MENU_RECOLOR_RULE_SETS as readonly string[]).includes(value);
}

function clampStrength(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.max(0, Math.min(1, amount));
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function fileStem(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function pathHasIconsSegment(relativePath: string): boolean {
  return relativePath
    .split("\\")
    .join("/")
    .split("/")
    .some((segment) => segment.toLowerCase() === "icons");
}

function isFaceName(fileName: string): boolean {
  const stem = fileStem(fileName).toLowerCase();
  const squashed = stem.split("_").join("").split("-").join("");
  const prefixes = [
    "difficon",
    "difficulty",
    "demon",
    "easydemon",
    "mediumdemon",
    "harddemon",
    "insanedemon",
    "extremedemon",
    "autodemon",
  ];
  if (prefixes.some((prefix) => squashed.startsWith(prefix))) {
    return true;
  }
  return stem === "auto" || stem.startsWith("auto_") || stem.startsWith("auto-");
}

function isFontName(fileName: string): boolean {
  const squashed = fileStem(fileName).toLowerCase().split("_").join("").split("-").join("");
  return squashed.includes("goldfont") || squashed.includes("bigfont") || squashed.includes("chatfont");
}
