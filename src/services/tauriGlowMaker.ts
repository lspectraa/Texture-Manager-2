import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauriOperations";

export type GlowMakerPreviewOptions = {
  thickness: number;
  tolerance: number;
  rainbowGlow: boolean;
  compositeLayers: boolean;
  /** When true, discard the cached sample and pick a new random UHD icon. */
  refresh?: boolean;
  /**
   * Optional path to an icon gamesheet `.plist` (sibling `.png` required).
   * When set, that sheet is used instead of a random game icon.
   */
  iconPlistPath?: string | null;
};

function invokeErrorMessage(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message.trim()) return err.message;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
  }
  return "preview failed";
}

/**
 * Live preview PNG from the Tauri backend.
 * Loads a random `-uhd` icon from Geometry Dash `Resources/icons` (excluding UFO,
 * robot, and spider), then runs `render_icon_glow_from_primary`. Pass
 * `iconPlistPath` to preview a specific icon sheet instead (PNG resolved from
 * the same folder as the plist).
 *
 * Returns `{ dataUrl }` on success, or `{ error }` when the backend rejects the
 * request (missing PNG, bad plist, …).
 */
export const getGlowMakerPreviewDataUrl = async (
  options: GlowMakerPreviewOptions,
): Promise<{ dataUrl: string } | { error: string } | null> => {
  if (!isTauriRuntime()) {
    return null;
  }
  try {
    const iconPlistPath = options.iconPlistPath?.trim() || null;
    const payload: Record<string, unknown> = {
      options: {
        thickness: Math.min(128, Math.max(1, options.thickness)),
        tolerance: Math.min(255, Math.max(0, options.tolerance)),
        dimensions: null,
        rainbowGlow: options.rainbowGlow,
        compositeLayers: options.compositeLayers,
      },
      refresh: options.refresh ?? false,
    };
    // Only send when set — avoids fragile null handling on the Rust side.
    if (iconPlistPath) {
      payload.iconPlistPath = iconPlistPath;
    }
    const dataUrl = await invoke<string>("glow_maker_preview_cmd", payload);
    if (!dataUrl) {
      return { error: "empty preview response" };
    }
    return { dataUrl };
  } catch (err) {
    return { error: invokeErrorMessage(err) };
  }
};
