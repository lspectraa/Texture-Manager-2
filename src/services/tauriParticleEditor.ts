import { invoke } from "@tauri-apps/api/core";
import type { ParticleConfig } from "../domain/particleConfig";
import { isTauriRuntime } from "./tauriOperations";

export type { ParticleConfig } from "../domain/particleConfig";
export { defaultParticleConfig } from "../domain/particleConfig";

/** Where the texture was resolved from when opening a plist. */
export type TextureSource = "sibling" | "embedded" | "none";

/** Return value of `particle_editor_open`. */
export type ParticleOpenResult = {
  config: ParticleConfig;
  /** PNG data URL, or `null` when no texture could be resolved. */
  texturePngDataUrl: string | null;
  /** Raw `textureFileName` value from the plist. */
  textureFileName: string;
  textureSource: TextureSource;
  /** Non-fatal diagnostic messages (missing texture, failed embed decode, etc.). */
  warnings: string[];
};

/** Argument type for `particle_editor_save`. */
export type ParticleSaveRequest = {
  path: string;
  config: ParticleConfig;
  /** PNG data URL for the texture to embed / write as sibling. */
  texturePngDataUrl?: string;
  /** When `true`, gzip-embed the texture as `textureImageData` in the plist. */
  embedTexture: boolean;
  /** When `true`, write a sibling PNG next to the plist using `config.textureFileName`. */
  writeSiblingPng: boolean;
};

/**
 * Preview silhouette / attach sprite with Cocos node-origin inside the image.
 * `anchorX/Y` matches Icon Editor / TexturePacker `spriteOffset` placement.
 */
export type ParticlePreviewSprite = {
  dataUrl: string;
  anchorX: number;
  anchorY: number;
};

export const joinGameResourcePath = (resourcesDir: string, fileName: string): string => {
  const sep = resourcesDir.includes("\\") ? "\\" : "/";
  return `${resourcesDir.replace(/[/\\]+$/, "")}${sep}${fileName}`;
};

/**
 * Open a Cocos2d particle plist file.
 *
 * Returns the parsed config, a resolved texture PNG data URL (if any), and
 * diagnostic warnings (e.g. missing texture).
 */
export const openParticleEditor = async (
  path: string,
): Promise<ParticleOpenResult> =>
  invoke<ParticleOpenResult>("particle_editor_open", { path });

/**
 * Save a Cocos2d particle plist.
 *
 * Optionally embeds the texture as gzip+base64 `textureImageData` and/or
 * writes a sibling PNG file beside the plist.
 */
export const saveParticleEditor = async (
  request: ParticleSaveRequest,
): Promise<void> => invoke<void>("particle_editor_save", { request });

/**
 * Load an arbitrary image file (PNG, TIFF, …) from disk and return it as a
 * PNG data URL.  Used by the "Replace Texture" action.
 */
export const loadParticleEditorTexture = async (
  path: string,
): Promise<string> =>
  invoke<string>("particle_editor_load_texture", { path });

/**
 * Eligible UHD icon from GD Resources/icons (no glow), for preview silhouettes.
 *
 * Pass `kind: "ship"` to restrict the pool to ship sheets (ship-drag effects).
 * Pass `iconPlistPath` to load a specific icon gamesheet instead of a random pick.
 * Includes the Cocos/node origin (`anchorX/Y`) inside the image.
 */
export const getParticlePreviewIconDataUrl = async (
  refresh = false,
  kind?: "ship" | null,
  iconPlistPath?: string | null,
): Promise<ParticlePreviewSprite | null> => {
  if (!isTauriRuntime()) {
    return null;
  }
  try {
    const path = iconPlistPath?.trim() || null;
    const payload: Record<string, unknown> = {
      refresh,
      kind: path ? null : kind === "ship" ? "ship" : null,
    };
    if (path) {
      payload.iconPlistPath = path;
    }
    return await invoke<ParticlePreviewSprite>(
      "particle_editor_preview_icon_cmd",
      payload,
    );
  } catch {
    return null;
  }
};

/**
 * PNG data URL + anchor for a single frame of a stock GD gamesheet, used as the
 * preview attach object of specialized effects (portals, speed pads, pickups).
 *
 * Resolves to `null` outside Tauri or when Geometry Dash / the frame is missing,
 * so callers can fall back to the generic silhouette.
 */
export const getParticleEffectSpriteDataUrl = async (
  sheetStem: string,
  frameName: string,
): Promise<ParticlePreviewSprite | null> => {
  if (!isTauriRuntime()) {
    return null;
  }
  try {
    return await invoke<ParticlePreviewSprite>("particle_editor_sheet_frame_cmd", {
      sheetStem,
      frameName,
    });
  } catch {
    return null;
  }
};
