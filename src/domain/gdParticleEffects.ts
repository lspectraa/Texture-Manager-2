/**
 * Catalog of all 42 stock Geometry Dash particle emitter plists found in Resources.
 * Provides preview-mode mapping and group classification for the particle editor.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Preview animation mode for the particle canvas.
 * Controls how the emitter attach point moves and which silhouette is drawn.
 */
export type PreviewMode =
  | "dragSlide"     // Cube slides on ground; Free trail scrapes behind
  | "shipScrape"    // Ship silhouette scrapes along ground line
  | "trailFollow"   // Icon moves horizontally; emitter follows
  | "oneShot"       // Pinned contact point; emit once; Restart re-fires
  | "portalAura"    // Pinned portal ring graphic; continuous radius/gravity aura
  | "speedBurst"    // Lateral flash past gate marker; finite duration auto-replays
  | "ambientPinned" // Static/ambient emitter (starFall spawns from top)
  | "static";       // Manual drag emitter; user repositions freely

/** Gameplay group for catalog organization and UI grouping. */
export type EffectGroup =
  | "playerTrails"
  | "bursts"
  | "portals"
  | "speed"
  | "explode"
  | "collectibles"
  | "ambient";

/** Icon silhouette drawn in the preview canvas. */
export type EffectIcon =
  | "cube"
  | "ship"
  | "coin"
  | "portal"
  | "none";

/**
 * Stock gamesheet frame drawn as the preview attach object.
 *
 * Resolved at runtime against `{Geometry Dash}/Resources`; when the game is not
 * installed the preview silently falls back to the generic silhouette.
 */
export interface EffectAttachSprite {
  /** Gamesheet basename inside GD `Resources` (no extension). */
  sheet: string;
  /** Frame key inside the sheet plist. */
  frame: string;
}

/** Metadata for a single GD stock particle effect. */
export interface GDParticleEffect {
  /** Basename without extension, matching the GD Resources filename. */
  id: string;
  /** Human-readable label for UI display. */
  label: string;
  /** Gameplay group for catalog organization. */
  group: EffectGroup;
  /** Preview animation mode. */
  previewMode: PreviewMode;
  /** Icon silhouette to draw in the preview canvas. */
  defaultIcon: EffectIcon;
  /**
   * Real in-game object this effect attaches to. Present for specialized
   * effects (portals, speed pads, orbs, pickups) where a random player icon
   * would be misleading.
   */
  attachSprite?: EffectAttachSprite;
}

/** Object gamesheet holding portals, speed pads, and pickups. */
const OBJECT_SHEET = "GJ_GameSheet02-uhd";
/** Gamesheet holding jump rings / orbs. */
const RING_SHEET = "GJ_GameSheet-uhd";
/** UI gamesheet holding the large key / star pickups. */
const UI_SHEET = "GJ_GameSheet03-uhd";

// ─── Catalog ──────────────────────────────────────────────────────────────────

/** All 42 GD stock particle emitter plists, ordered by group. */
export const GD_PARTICLE_EFFECTS: readonly GDParticleEffect[] = [
  // ── Player motion / trails ─────────────────────────────────────────────────
  {
    id: "dragEffect",
    label: "Drag (Cube Slide Dust)",
    group: "playerTrails",
    previewMode: "dragSlide",
    defaultIcon: "cube",
  },
  {
    id: "shipDragEffect",
    label: "Ship Drag (Scrape Trail)",
    group: "playerTrails",
    previewMode: "shipScrape",
    defaultIcon: "ship",
  },
  {
    id: "dashEffect",
    label: "Dash Trail",
    group: "playerTrails",
    previewMode: "trailFollow",
    defaultIcon: "cube",
  },
  {
    id: "trailEffect",
    label: "Sparkle Trail",
    group: "playerTrails",
    previewMode: "trailFollow",
    defaultIcon: "cube",
  },
  {
    id: "glitterEffect",
    label: "Glitter (Vehicle)",
    group: "playerTrails",
    previewMode: "trailFollow",
    defaultIcon: "cube",
  },
  {
    id: "glitterEffectIcon",
    label: "Glitter (Icon)",
    group: "playerTrails",
    previewMode: "trailFollow",
    defaultIcon: "cube",
  },
  {
    id: "fireballEffect",
    label: "Fireball Trail",
    group: "playerTrails",
    previewMode: "trailFollow",
    defaultIcon: "cube",
  },

  // ── Jump / land / vehicle bursts ───────────────────────────────────────────
  {
    id: "landEffect",
    label: "Landing Puff",
    group: "bursts",
    previewMode: "oneShot",
    defaultIcon: "cube",
  },
  {
    id: "burstEffect",
    label: "UFO Jump Burst",
    group: "bursts",
    previewMode: "oneShot",
    defaultIcon: "cube",
  },
  {
    id: "burstEffect2",
    label: "Robot Jump Burst",
    group: "bursts",
    previewMode: "oneShot",
    defaultIcon: "cube",
  },
  {
    id: "swingBurstEffect",
    label: "Swing Jump Burst",
    group: "bursts",
    previewMode: "oneShot",
    defaultIcon: "cube",
  },
  {
    id: "bumpEffect",
    label: "Bump / Pad Hit",
    group: "bursts",
    previewMode: "oneShot",
    defaultIcon: "cube",
  },
  {
    id: "chargeEffect",
    label: "Charge Burst",
    group: "bursts",
    previewMode: "oneShot",
    defaultIcon: "cube",
  },

  // ── Portals / pads / end wall ──────────────────────────────────────────────
  {
    id: "portalEffect01",
    label: "Portal Aura 1",
    group: "portals",
    previewMode: "portalAura",
    defaultIcon: "portal",
    attachSprite: { sheet: OBJECT_SHEET, frame: "portal_01_front_001.png" },
  },
  {
    id: "portalEffect02",
    label: "Portal Aura 2",
    group: "portals",
    previewMode: "portalAura",
    defaultIcon: "portal",
    attachSprite: { sheet: OBJECT_SHEET, frame: "portal_02_front_001.png" },
  },
  {
    id: "portalEffect03",
    label: "Portal Aura 3",
    group: "portals",
    previewMode: "portalAura",
    defaultIcon: "portal",
    attachSprite: { sheet: OBJECT_SHEET, frame: "portal_03_front_001.png" },
  },
  {
    id: "portalEffect04",
    label: "Portal Aura 4",
    group: "portals",
    previewMode: "portalAura",
    defaultIcon: "portal",
    attachSprite: { sheet: OBJECT_SHEET, frame: "portal_04_front_001.png" },
  },
  {
    id: "portalEffect08",
    label: "Portal Aura 8",
    group: "portals",
    previewMode: "portalAura",
    defaultIcon: "portal",
    attachSprite: { sheet: OBJECT_SHEET, frame: "portal_08_front_001.png" },
  },
  {
    id: "portalEffect09",
    label: "Portal Aura 9",
    group: "portals",
    previewMode: "portalAura",
    defaultIcon: "portal",
    attachSprite: { sheet: OBJECT_SHEET, frame: "portal_09_front_001.png" },
  },
  {
    id: "ringEffect",
    label: "Jump Ring / Orb",
    group: "portals",
    previewMode: "portalAura",
    defaultIcon: "portal",
    attachSprite: { sheet: RING_SHEET, frame: "ring_01_001.png" },
  },
  {
    id: "endEffectPortal",
    label: "End Portal Wall",
    group: "portals",
    previewMode: "portalAura",
    defaultIcon: "portal",
  },
  {
    id: "boost_01_effect",
    label: "Speed Portal Pad 1",
    group: "portals",
    previewMode: "ambientPinned",
    defaultIcon: "none",
    attachSprite: { sheet: OBJECT_SHEET, frame: "boost_01_001.png" },
  },
  {
    id: "boost_02_effect",
    label: "Speed Portal Pad 2",
    group: "portals",
    previewMode: "ambientPinned",
    defaultIcon: "none",
    attachSprite: { sheet: OBJECT_SHEET, frame: "boost_02_001.png" },
  },
  {
    id: "boost_03_effect",
    label: "Speed Portal Pad 3",
    group: "portals",
    previewMode: "ambientPinned",
    defaultIcon: "none",
    attachSprite: { sheet: OBJECT_SHEET, frame: "boost_03_001.png" },
  },
  {
    id: "boost_04_effect",
    label: "Speed Portal Pad 4",
    group: "portals",
    previewMode: "ambientPinned",
    defaultIcon: "none",
    attachSprite: { sheet: OBJECT_SHEET, frame: "boost_04_001.png" },
  },

  // ── Speed change ───────────────────────────────────────────────────────────
  {
    id: "speedEffect",
    label: "Speed Flash",
    group: "speed",
    previewMode: "speedBurst",
    defaultIcon: "cube",
    attachSprite: { sheet: OBJECT_SHEET, frame: "boost_02_001.png" },
  },
  {
    id: "speedEffect_slow",
    label: "Speed Flash (Slow)",
    group: "speed",
    previewMode: "speedBurst",
    defaultIcon: "cube",
    attachSprite: { sheet: OBJECT_SHEET, frame: "boost_01_001.png" },
  },
  {
    id: "speedEffect_normal",
    label: "Speed Flash (Normal)",
    group: "speed",
    previewMode: "speedBurst",
    defaultIcon: "cube",
    attachSprite: { sheet: OBJECT_SHEET, frame: "boost_02_001.png" },
  },
  {
    id: "speedEffect_fast",
    label: "Speed Flash (Fast)",
    group: "speed",
    previewMode: "speedBurst",
    defaultIcon: "cube",
    attachSprite: { sheet: OBJECT_SHEET, frame: "boost_03_001.png" },
  },
  {
    id: "speedEffect_vfast",
    label: "Speed Flash (Very Fast)",
    group: "speed",
    previewMode: "speedBurst",
    defaultIcon: "cube",
    attachSprite: { sheet: OBJECT_SHEET, frame: "boost_04_001.png" },
  },
  {
    id: "speedEffect_vvfast",
    label: "Speed Flash (Ultra Fast)",
    group: "speed",
    previewMode: "speedBurst",
    defaultIcon: "cube",
    attachSprite: { sheet: OBJECT_SHEET, frame: "boost_05_001.png" },
  },

  // ── Death / explode ────────────────────────────────────────────────────────
  {
    id: "explodeEffect",
    label: "Death Explosion",
    group: "explode",
    previewMode: "oneShot",
    defaultIcon: "cube",
  },
  {
    id: "explodeEffectGrav",
    label: "Gravity Death Explosion",
    group: "explode",
    previewMode: "oneShot",
    defaultIcon: "cube",
  },
  {
    id: "explodeEffectVortex",
    label: "Vortex Death Explosion",
    group: "explode",
    previewMode: "oneShot",
    defaultIcon: "cube",
  },

  // ── Collectibles / UI ──────────────────────────────────────────────────────
  {
    id: "coinEffect",
    label: "Coin Trail",
    group: "collectibles",
    previewMode: "trailFollow",
    defaultIcon: "coin",
    attachSprite: { sheet: OBJECT_SHEET, frame: "secretCoin_01_001.png" },
  },
  {
    id: "coinPickupEffect",
    label: "Coin Pickup Burst",
    group: "collectibles",
    previewMode: "oneShot",
    defaultIcon: "coin",
    attachSprite: { sheet: OBJECT_SHEET, frame: "secretCoin_01_001.png" },
  },
  {
    id: "keyEffect",
    label: "Key Trail",
    group: "collectibles",
    previewMode: "trailFollow",
    defaultIcon: "cube",
    attachSprite: { sheet: UI_SHEET, frame: "GJ_bigKey_001.png" },
  },
  {
    id: "starEffect",
    label: "Star Burst",
    group: "collectibles",
    previewMode: "oneShot",
    defaultIcon: "none",
    attachSprite: { sheet: UI_SHEET, frame: "GJ_bigStar_001.png" },
  },
  {
    id: "starEffect01",
    label: "Star Burst 2",
    group: "collectibles",
    previewMode: "oneShot",
    defaultIcon: "none",
    attachSprite: { sheet: UI_SHEET, frame: "GJ_bigStar_001.png" },
  },
  {
    id: "lvlupEffect",
    label: "Level Up Burst",
    group: "collectibles",
    previewMode: "oneShot",
    defaultIcon: "none",
    attachSprite: { sheet: UI_SHEET, frame: "GJ_bigStar_001.png" },
  },

  // ── Ambient ────────────────────────────────────────────────────────────────
  {
    id: "starFall",
    label: "Falling Stars",
    group: "ambient",
    previewMode: "ambientPinned",
    defaultIcon: "none",
  },
  {
    id: "bubbleEffect",
    label: "Bubble Ambient",
    group: "ambient",
    previewMode: "ambientPinned",
    defaultIcon: "none",
  },
] as const;

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Map from effect id → GDParticleEffect for O(1) lookups. */
const _effectById = new Map<string, GDParticleEffect>(
  GD_PARTICLE_EFFECTS.map((e) => [e.id, e]),
);

/**
 * Detect the stock GD effect from a filename (with or without extension).
 * Strips the `.plist` extension and looks up by basename.
 * Returns `undefined` for custom/unknown files.
 */
export function detectEffectKind(filename: string): GDParticleEffect | undefined {
  const basename = filename.replace(/\.[^./\\]+$/, "").split(/[/\\]/).pop() ?? filename;
  return _effectById.get(basename);
}

/**
 * Look up a stock GD effect by its exact id (basename without extension).
 * Returns `undefined` if the id is not in the catalog.
 */
export function getEffectMeta(id: string): GDParticleEffect | undefined {
  return _effectById.get(id);
}

/**
 * Return all effects belonging to the given gameplay group,
 * preserving catalog order.
 */
export function getEffectsByGroup(group: EffectGroup): GDParticleEffect[] {
  return GD_PARTICLE_EFFECTS.filter((e) => e.group === group);
}

/** All distinct effect groups, in the canonical display order. */
export const EFFECT_GROUP_ORDER: readonly EffectGroup[] = [
  "playerTrails",
  "bursts",
  "portals",
  "speed",
  "explode",
  "collectibles",
  "ambient",
] as const;

/** Human-readable labels for each effect group. */
export const EFFECT_GROUP_LABELS: Record<EffectGroup, string> = {
  playerTrails: "Player Trails",
  bursts: "Bursts",
  portals: "Portals & Pads",
  speed: "Speed",
  explode: "Death / Explode",
  collectibles: "Collectibles",
  ambient: "Ambient",
};
