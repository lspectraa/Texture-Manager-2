import {
  ALL_BANDS,
  clampBandRadiusDeg,
  clampBandRadiusSide,
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

export const MENU_RECOLOR_RULE_SETS = [
  "menuChrome",
  "symbols",
  "facesOnly",
  "fonts",
  "editor",
  "shop",
  "gauntlets",
  "objects",
  "effects",
  "icons",
  "geode",
  "logos",
  "exceptIcons",
] as const;

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
  const rawStem = fileStem(fileName);
  const stem = rawStem.toLowerCase();
  const flat = squashed(stem);
  const sheet = sheetBase(sheetStem);
  if (sheet === "blanksheet") {
    tags.push("chrome");
    const sheetStemTrimmed = sheetStem?.trim() ?? "";
    if (sheetStemTrimmed) {
      tags.push(`sheet:${sheetStemTrimmed}`);
    }
    return tags;
  }
  if (pathHasIconsSegment(relativePath) || isPlayerIconName(stem, flat)) {
    tags.push("icons");
  }
  if (isFaceName(fileName)) {
    tags.push("faces");
  }
  if (isFontName(fileName)) {
    tags.push("font");
  }
  if (isEffectName(flat) && !isButtonName(stem)) {
    tags.push("fx");
  }
  if (isSymbolName(rawStem, stem, flat)) {
    tags.push("symbols");
  }
  if (isEditorName(stem, flat) && !isPauseMenuEditorButton(stem)) {
    tags.push("editor");
  }
  if (isShopName(flat) || sheet.startsWith("gj_shopsheet")) {
    tags.push("shop");
  }
  if ((isGauntletName(flat) || sheet === "gauntletsheet") && !flat.includes("lostgauntletslabel")) {
    tags.push("gauntlet");
  }
  if (isChromeName(stem, flat)) {
    tags.push("chrome");
  }
  if (isGeodeName(stem, flat, sheet) && !isApiMenuChrome(flat)) {
    tags.push("geode");
  }
  if (isLogoName(flat, sheet)) {
    tags.push("logos");
  }
  if (isGameplaySheet(sheet) && !tags.some((tag) => tag === "chrome" || tag === "symbols" || tag === "faces" || tag === "font" || tag === "fx" || tag === "editor" || tag === "icons")) {
    tags.push("objects");
  }
  const sheetStemTrimmed = sheetStem?.trim() ?? "";
  if (sheetStemTrimmed) {
    tags.push(`sheet:${sheetStemTrimmed}`);
  }
  return tags;
}

export function ruleSetIncludes(tags: readonly string[], rule: MenuRecolorRuleSetId): boolean {
  const has = (name: string) => tags.some((tag) => tag === name);
  switch (rule) {
    case "menuChrome":
      return (
        has("chrome") &&
        !has("symbols") &&
        !has("faces") &&
        !has("font") &&
        !has("fx") &&
        !has("editor") &&
        !has("icons") &&
        !has("objects") &&
        !has("geode") &&
        !has("shop") &&
        !has("gauntlet") &&
        !has("logos")
      );
    case "symbols":
      return has("symbols") && !has("faces");
    case "facesOnly":
      return has("faces");
    case "fonts":
      return has("font");
    case "editor":
      return has("editor");
    case "shop":
      return has("shop");
    case "gauntlets":
      return has("gauntlet");
    case "objects":
      return has("objects");
    case "effects":
      return has("fx");
    case "icons":
      return has("icons");
    case "geode":
      return has("geode");
    case "logos":
      return has("logos");
    case "exceptIcons":
      return !has("icons");
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

export function overridesForIncluded(
  overrides: Record<string, SpriteOverride>,
  includes: Record<string, boolean>,
): Record<string, SpriteOverride> {
  const kept: Record<string, SpriteOverride> = {};
  for (const [id, override] of Object.entries(overrides)) {
    if (includes[id]) {
      kept[id] = override;
    }
  }
  return kept;
}

export function effectiveRecolor(
  included: boolean,
  global: ColorRecipe,
  override: SpriteOverride | undefined,
): { recipe: ColorRecipe; strength: number } | null {
  if (!included) {
    return null;
  }
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
          radiusDeg: clampBandRadiusDeg(band, existing.radiusDeg),
          radiusLowDeg: clampBandRadiusSide(band, existing.radiusLowDeg, existing.radiusDeg),
          radiusHighDeg: clampBandRadiusSide(band, existing.radiusHighDeg, existing.radiusDeg),
        }
      : {
          ...zeroBand(),
          radiusDeg: clampBandRadiusDeg(band, undefined),
          radiusLowDeg: clampBandRadiusSide(band, undefined, undefined),
          radiusHighDeg: clampBandRadiusSide(band, undefined, undefined),
        };
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
  const flat = squashed(fileStem(fileName).toLowerCase());
  return flat.includes("goldfont") || flat.includes("bigfont") || flat.includes("chatfont");
}

function squashed(stem: string): string {
  return stem.split("_").join("").split("-").join("");
}

function sheetBase(sheetStem: string | null): string {
  const stem = (sheetStem ?? "").trim().toLowerCase();
  if (stem.endsWith("-uhd")) {
    return stem.slice(0, -4);
  }
  if (stem.endsWith("-hd")) {
    return stem.slice(0, -3);
  }
  return stem;
}

function isGameplaySheet(base: string): boolean {
  return base === "gj_gamesheet" || base === "gj_gamesheet02";
}

function isButtonName(stem: string): boolean {
  return stem.includes("btn") || stem.includes("button");
}

function isEffectName(flat: string): boolean {
  return (
    flat.includes("portalshine") ||
    flat.includes("explosion") ||
    flat.includes("fireball") ||
    flat.includes("watersplash") ||
    flat.includes("playerdash") ||
    flat.includes("spiderdash") ||
    flat.includes("shineburst") ||
    flat.includes("staranim") ||
    flat.includes("waterfallanim") ||
    (flat.includes("shine") && !flat.includes("star"))
  );
}

const SYMBOL_TOKENS = new Set([
  "star",
  "stars",
  "coin",
  "coins",
  "diamond",
  "diamonds",
  "moon",
  "moons",
  "key",
  "lock",
  "arrow",
  "crown",
  "badge",
  "currency",
  "skull",
  "shard",
  "heart",
  "icon",
  "icons",
  "check",
]);

function nameTokens(stem: string): string[] {
  return stem
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token.length > 0);
}

function isSymbolName(rawStem: string, stem: string, flat: string): boolean {
  if (
    isButtonName(stem) ||
    isFaceName(stem) ||
    isEffectName(flat) ||
    flat.includes("label") ||
    isMenuArrow(flat) ||
    flat.startsWith("gjinfoicon") ||
    isApiMenuChrome(flat)
  ) {
    return false;
  }
  if (nameTokens(rawStem).some((token) => SYMBOL_TOKENS.has(token))) {
    return true;
  }
  return (
    flat.includes("discord") ||
    flat.includes("facebook") ||
    flat.includes("fbicon") ||
    flat.includes("twitter") ||
    flat.includes("twitch") ||
    flat.includes("youtube") ||
    flat.includes("yticon") ||
    flat.includes("insta") ||
    flat.includes("tiktok") ||
    flat.startsWith("exmark") ||
    flat === "uidot"
  );
}

function isEditorName(stem: string, flat: string): boolean {
  return (
    stem.startsWith("edit_") ||
    flat.startsWith("lightsquare") ||
    flat.startsWith("gridline") ||
    flat.startsWith("baseeditor")
  );
}

function isShopName(flat: string): boolean {
  return (
    flat.includes("chest") ||
    flat.includes("shopkeeper") ||
    flat.includes("shopsign") ||
    flat.includes("storedesk") ||
    flat.includes("plush")
  );
}

function isGauntletName(flat: string): boolean {
  return flat.startsWith("island") || flat.includes("gauntletcorner") || flat.includes("gauntletlock") || flat.includes("lostgauntlet");
}

function isPlayerIconName(stem: string, flat: string): boolean {
  if (isButtonName(stem) || isEffectName(flat)) {
    return false;
  }
  return (
    flat.startsWith("playerspecial") ||
    flat.startsWith("playersquare") ||
    /^(player|ship|ball|bird|robot|spider|swing|jetpack|dart)_/.test(stem)
  );
}

function isApiMenuChrome(flat: string): boolean {
  return flat.includes("modslist") || flat.startsWith("updates");
}

function isControllerButton(stem: string): boolean {
  return stem.startsWith("controllerbtn");
}

function isShardTitle(flat: string): boolean {
  return flat.includes("shard") && flat.includes("label");
}

function isMenuChromeExcluded(stem: string, flat: string): boolean {
  return (
    isControllerButton(stem) ||
    isShardTitle(flat) ||
    flat.includes("advideobtn") ||
    flat.includes("ncslibrarybtn") ||
    flat.includes("paintbtn") ||
    flat.includes("pausebtnclean") ||
    flat.includes("folderbtn") ||
    flat.includes("foldericon") ||
    flat.includes("levelleaderboard") ||
    flat.includes("checkpointbtn") ||
    flat.includes("removecheckbtn") ||
    flat.includes("adrope") ||
    flat.includes("achievementglow") ||
    flat.includes("nametxt")
  );
}

function isMenuArrow(flat: string): boolean {
  return flat.startsWith("gjarrow01") || flat.startsWith("gjarrow02") || flat.startsWith("gjarrow03");
}

function isPauseMenuEditorButton(stem: string): boolean {
  return (
    stem.startsWith("edit_buildbtn") ||
    stem.startsWith("edit_buildsbtn") ||
    stem.startsWith("edit_deletebtn") ||
    stem.startsWith("edit_deletesbtn") ||
    stem.startsWith("edit_editbtn") ||
    stem.startsWith("edit_editsbtn")
  );
}

function isChromeName(stem: string, flat: string): boolean {
  if (isMenuChromeExcluded(stem, flat)) {
    return false;
  }
  if (isApiMenuChrome(flat)) {
    return true;
  }
  if (isButtonName(stem) || isMenuArrow(flat) || flat.startsWith("gjinfoicon") || flat.includes("gjlogo")) {
    return true;
  }
  return (
    stem.includes("square") ||
    stem.includes("slider") ||
    stem.includes("gradient") ||
    stem.includes("progress") ||
    stem.includes("groove") ||
    flat.includes("topbar") ||
    flat.includes("sideart") ||
    flat.includes("comment") ||
    stem.includes("table_") ||
    /tab(on|off)/.test(flat) ||
    flat.startsWith("tabgradient") ||
    flat.startsWith("basecircle") ||
    flat.startsWith("basetab") ||
    flat.startsWith("baseaccount") ||
    flat.startsWith("basecross") ||
    flat.startsWith("basecategory") ||
    flat.startsWith("baseleaderboard") ||
    flat.startsWith("baseiconselect") ||
    flat.includes("label") ||
    flat.includes("rope") ||
    flat.includes("corner") ||
    flat.includes("levelcomplete") ||
    flat.includes("practicecomplete") ||
    flat.includes("newbest") ||
    flat.startsWith("gjselect") ||
    flat.includes("loadingcircle") ||
    flat.includes("smalldot")
  );
}

function isGeodeName(stem: string, flat: string, sheet: string): boolean {
  return (
    sheet === "apisheet" ||
    sheet === "logosheet" ||
    stem.startsWith("ge_") ||
    stem.startsWith("geode.") ||
    flat.startsWith("geode") ||
    flat.startsWith("dragicon")
  );
}

function isLogoName(flat: string, sheet: string): boolean {
  if (flat.includes("gjlogo")) {
    return false;
  }
  return (
    sheet === "logosheet" ||
    flat.includes("robtoplogo") ||
    flat.includes("fmod") ||
    flat.includes("cocos") ||
    flat.includes("subzerologo") ||
    flat.includes("worldlogo")
  );
}
