import { invoke } from "@tauri-apps/api/core";
import type { DiscoveredSprite, MenuRecolorRecipeFile } from "../domain/menuRecolor";
import { isTauriRuntime } from "./tauriOperations";

export type MenuRecolorThumb = {
  id: string;
  dataUrl: string;
};

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

export async function readMenuRecolorRecipe(path: string): Promise<MenuRecolorRecipeFile> {
  return invoke<MenuRecolorRecipeFile>("menu_recolor_read_recipe_cmd", { path });
}

export async function writeMenuRecolorRecipe(
  path: string,
  recipe: MenuRecolorRecipeFile,
): Promise<void> {
  await invoke<void>("menu_recolor_write_recipe_cmd", { path, recipe });
}
