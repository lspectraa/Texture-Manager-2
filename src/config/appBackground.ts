import type { CSSProperties } from "react";

/**
 * App shell Geometry Dash background layer.
 *
 * Change this manually to experiment with how `game_bg_*` images composite
 * over the gradient orbs (and under the glass UI).
 */
export const BACKGROUND_BLEND_MODE =
  "overlay" as const satisfies CSSProperties["mixBlendMode"];

export const DEFAULT_APP_BACKGROUND_OPACITY = 0.75;
export const MIN_APP_BACKGROUND_OPACITY = 0.1;
export const MAX_APP_BACKGROUND_OPACITY = 1;

/** Persisted setting value meaning “pick a background for this session”. */
export const APP_BACKGROUND_RANDOM = "random" as const;

export type AppBackgroundId = typeof APP_BACKGROUND_RANDOM | string;

export type AppBackgroundKind = "game" | "custom";

export type AppBackgroundOption = {
  id: string;
  label: string;
  path: string;
  kind: AppBackgroundKind;
};

/** Merge game + custom lists for Random / shell resolution. */
export function allAppBackgroundOptions(
  game: readonly AppBackgroundOption[],
  custom: readonly AppBackgroundOption[],
): AppBackgroundOption[] {
  return [...game, ...custom];
}

/**
 * Session-random: when the setting is `random`, pick one entry from the
 * available list once per app session (stable until reload or list change).
 * Soft-fails to `null` when the list is empty (gradients-only).
 */
export function pickSessionRandomBackground(
  options: readonly AppBackgroundOption[],
  previousId: string | null,
): AppBackgroundOption | null {
  if (options.length === 0) {
    return null;
  }
  if (previousId) {
    const stillThere = options.find((option) => option.id === previousId);
    if (stillThere) {
      return stillThere;
    }
  }
  const index = Math.floor(Math.random() * options.length);
  return options[index] ?? null;
}

export function resolveAppBackgroundOption(
  setting: AppBackgroundId,
  options: readonly AppBackgroundOption[],
  sessionRandomId: string | null,
): AppBackgroundOption | null {
  if (options.length === 0) {
    return null;
  }
  if (setting === APP_BACKGROUND_RANDOM) {
    return pickSessionRandomBackground(options, sessionRandomId);
  }
  return options.find((option) => option.id === setting) ?? null;
}

/**
 * Shell backdrop layers (TM2 Path redesign, SPEC §7.6):
 * - `art`: the user's `game_bg_*` image composited over the blue/purple atmosphere.
 * - `procedural`: original procedural Path landscape — the fallback when game art is missing.
 * - `placeholder`: the quiet moon placeholder scene, shown only as a review backdrop (`?bg=placeholder`).
 */
export type ShellBackdropMode = "art" | "procedural" | "placeholder";

/** Dev/review override from the `?bg=` query (no effect in a packaged window, which has no query). */
export type ShellBackdropOverride = "placeholder" | "procedural" | null;

export function parseShellBackdropOverride(value: string | null | undefined): ShellBackdropOverride {
  return value === "placeholder" || value === "procedural" ? value : null;
}

export function resolveShellBackdropMode(
  hasGameArt: boolean,
  override: ShellBackdropOverride,
): ShellBackdropMode {
  if (override) {
    return override;
  }
  return hasGameArt ? "art" : "procedural";
}
