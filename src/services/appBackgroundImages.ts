import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { AppBackgroundOption } from "../config/appBackground";
import { isTauriRuntime } from "./tauriOperations";

const imageUrlCache = new Map<string, Promise<string>>();

/**
 * Resolve a shell/Settings background URL without pulling UHD PNGs through IPC as
 * base64. Prefer the asset protocol (`convertFileSrc`); fall back to the Rust
 * data-URL command only when that is unavailable.
 */
export function getAppBackgroundImageDataUrl(
  optionOrId: AppBackgroundOption | string,
): Promise<string> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("App backgrounds require the Tauri runtime."));
  }

  const id = typeof optionOrId === "string" ? optionOrId : optionOrId.id;
  const path = typeof optionOrId === "string" ? "" : optionOrId.path.trim();

  const cached = imageUrlCache.get(id);
  if (cached) {
    return cached;
  }

  const pending = (async (): Promise<string> => {
    if (path) {
      return convertFileSrc(path);
    }
    return invoke<string>("app_background_png_data_url", { id });
  })().catch((error: unknown) => {
    imageUrlCache.delete(id);
    throw error;
  });

  imageUrlCache.set(id, pending);
  return pending;
}

/**
 * Intentionally a no-op. Eagerly loading every `game_bg_*` UHD PNG (via IPC or
 * the network stack) freezes the release build on startup. Callers load the
 * active background and Settings thumbnails on demand instead.
 */
export async function preloadAppBackgroundImages(
  _options: readonly AppBackgroundOption[],
): Promise<void> {
  // no-op — see docstring
}
