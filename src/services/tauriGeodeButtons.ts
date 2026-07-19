import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauriOperations";

export type GeodeButtonsTargetSize = {
  width: number;
  height: number;
};

export type GeodeButtonsTargetFrame = {
  name: string;
  spriteSize: GeodeButtonsTargetSize;
};

export type GeodeButtonsTargetGroup = {
  id: string;
  label: string;
  frames: GeodeButtonsTargetFrame[];
  previewPngDataUrl: string | null;
};

export const getGeodeButtonsTargetIndex = async (
  plistPath: string,
  options?: { useGameFilesCache?: boolean },
): Promise<GeodeButtonsTargetGroup[]> => {
  if (!isTauriRuntime()) {
    throw new Error("Geode Buttons target index requires Tauri runtime.");
  }
  return invoke<GeodeButtonsTargetGroup[]>("geode_buttons_target_index_cmd", {
    plistPath,
    useGameFilesCache: options?.useGameFilesCache ?? true,
  });
};

export const autoSelectGeodeButtonsPlist = async (
  inputDir: string,
): Promise<string | null> => {
  if (!isTauriRuntime()) {
    throw new Error("Geode Buttons plist autoselect requires Tauri runtime.");
  }
  const result = await invoke<string | null>("geode_buttons_autoselect_plist_cmd", {
    inputDir,
  });
  return result ?? null;
};

export type GameFilesLayout = {
  rootDir: string;
  currentDir: string;
  splitDir: string;
  legacyDir: string;
  geometryDashDir: string;
  resourcesDir: string;
  geodeResourcesDir: string;
  geodeUnzippedDir: string;
};

export const getGameFilesLayout = async (): Promise<GameFilesLayout> => {
  if (!isTauriRuntime()) {
    throw new Error("Game files layout requires Tauri runtime.");
  }
  return invoke<GameFilesLayout>("get_game_files_layout");
};

export const getGeodeButtonsDefaultInputDir = async (): Promise<string> => {
  if (!isTauriRuntime()) {
    throw new Error("Geode Buttons default input requires Tauri runtime.");
  }
  return invoke<string>("geode_buttons_default_input_dir_cmd");
};

/** Load a template file as a PNG data URL (same path handling as export). */
export const getGeodeButtonsTemplatePreviewDataUrl = async (
  path: string,
): Promise<string | null> => {
  if (!isTauriRuntime() || !path.trim()) {
    return null;
  }
  try {
    return await invoke<string>("geode_buttons_template_preview_data_url_cmd", { path });
  } catch {
    return null;
  }
};

