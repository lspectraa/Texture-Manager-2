import { invoke } from "@tauri-apps/api/core";
import type { AppBackgroundOption } from "../config/appBackground";
import { isTauriRuntime } from "./tauriOperations";

const imageDataUrlCache = new Map<string, Promise<string>>();

/**
 * Loads only a background id that the Rust side re-validates against the
 * discovered Geometry Dash Resources directory. The shared promise cache keeps
 * the shell and Settings thumbnails from transferring the same PNG repeatedly.
 */
export function getAppBackgroundImageDataUrl(id: string): Promise<string> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("App backgrounds require the Tauri runtime."));
  }

  const cached = imageDataUrlCache.get(id);
  if (cached) {
    return cached;
  }

  const pending = invoke<string>("app_background_png_data_url", { id }).catch(
    (error: unknown) => {
      imageDataUrlCache.delete(id);
      throw error;
    },
  );
  imageDataUrlCache.set(id, pending);
  return pending;
}

/**
 * Starts loading every discovered background into the shared image cache.
 * Individual failures are ignored so one unreadable file cannot block startup.
 */
export async function preloadAppBackgroundImages(
  options: readonly AppBackgroundOption[],
): Promise<void> {
  await Promise.allSettled(
    options.map((option) => getAppBackgroundImageDataUrl(option.id)),
  );
}
