import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauriOperations";

export type GlowMakerPreviewOptions = {
  thickness: number;
  tolerance: number;
  rainbowGlow: boolean;
  compositeLayers: boolean;
  /** When true, discard the cached sample and pick a new random UHD icon. */
  refresh?: boolean;
};

/**
 * Live preview PNG from the Tauri backend.
 * Loads a random `-uhd` icon from Geometry Dash `Resources/icons` (excluding UFO,
 * robot, and spider), then runs `render_icon_glow_from_primary`.
 */
export const getGlowMakerPreviewDataUrl = async (
  options: GlowMakerPreviewOptions,
): Promise<string | null> => {
  if (!isTauriRuntime()) {
    return null;
  }
  try {
    return await invoke<string>("glow_maker_preview_cmd", {
      options: {
        thickness: Math.min(128, Math.max(1, options.thickness)),
        tolerance: Math.min(255, Math.max(0, options.tolerance)),
        dimensions: null,
        rainbowGlow: options.rainbowGlow,
        compositeLayers: options.compositeLayers,
      },
      refresh: options.refresh ?? false,
    });
  } catch {
    return null;
  }
};
