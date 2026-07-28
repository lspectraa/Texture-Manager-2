import { invoke } from "@tauri-apps/api/core";
import type { AppBackgroundOption } from "../config/appBackground";
import { isTauriRuntime } from "./tauriOperations";

const imageUrlCache = new Map<string, Promise<string>>();

/**
 * Resolve a shell/Settings background URL via the allowlisted Rust command.
 * Does not use the asset protocol (`convertFileSrc`) — that would require a
 * broad filesystem scope.
 */
export function getAppBackgroundImageDataUrl(
  optionOrId: AppBackgroundOption | string,
): Promise<string> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("App backgrounds require the Tauri runtime."));
  }

  const id = typeof optionOrId === "string" ? optionOrId : optionOrId.id;

  const cached = imageUrlCache.get(id);
  if (cached) {
    return cached;
  }

  const pending = invoke<string>("app_background_png_data_url", { id }).catch(
    (error: unknown) => {
      imageUrlCache.delete(id);
      throw error;
    },
  );

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
