import { invoke } from "@tauri-apps/api/core";
import type { DiscoveredSprite } from "../domain/menuRecolor";
import { isTauriRuntime } from "./tauriOperations";

export type MenuRecolorThumb = {
  id: string;
  dataUrl: string;
};

export type MenuRecolorDefaultInput = {
  inputDir: string;
  sheetStem: string;
};

export async function getMenuRecolorDefaultInput(): Promise<MenuRecolorDefaultInput | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const result = await invoke<MenuRecolorDefaultInput | null>("menu_recolor_default_input_cmd");
  return result ?? null;
}

export async function discoverMenuRecolorSprites(inputDir: string): Promise<DiscoveredSprite[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<DiscoveredSprite[]>("menu_recolor_discover_cmd", { inputDir });
}

export async function loadMenuRecolorThumbs(
  inputDir: string,
  spriteIds: string[],
): Promise<MenuRecolorThumb[]> {
  if (!isTauriRuntime() || spriteIds.length === 0) {
    return [];
  }
  return invoke<MenuRecolorThumb[]>("menu_recolor_thumbs_cmd", { inputDir, spriteIds });
}
