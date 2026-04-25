import { invoke } from "@tauri-apps/api/core";

export type IconEditorSize = {
  width: number;
  height: number;
};

export type IconEditorPoint = {
  x: number;
  y: number;
};

export type IconEditorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IconEditorFrameInfo = {
  name: string;
  textureRect: IconEditorRect;
  spriteSize: IconEditorSize;
  spriteSourceSize: IconEditorSize;
  spriteOffset: IconEditorPoint;
  textureRotated: boolean;
};

export type IconEditorSheetInfo = {
  plistPath: string;
  atlasPath: string;
  atlasSize: IconEditorSize;
  frames: IconEditorFrameInfo[];
};

export type IconEditorFrameUpdate = {
  name: string;
  spriteOffset: IconEditorPoint;
};

export type IconEditorRenameResult = {
  plistPath: string;
  atlasPath: string;
};

export type IconEditorExtractedFrame = {
  name: string;
  pngDataUrl: string;
};

export const getIconEditorSheetInfo = async (
  plistPath: string,
): Promise<IconEditorSheetInfo> =>
  invoke<IconEditorSheetInfo>("icon_editor_sheet_info", { plistPath });

export const saveIconEditorPlist = async (
  plistPath: string,
  updates: IconEditorFrameUpdate[],
  removedFrameNames?: string[],
): Promise<void> => {
  await invoke<void>("icon_editor_save_plist", {
    plistPath,
    updates,
    removedFrameNames: removedFrameNames ?? [],
  });
};

export const importIconEditorFrameTexture = async (
  plistPath: string,
  frameName: string,
  texturePath: string,
): Promise<void> => {
  await invoke<void>("icon_editor_import_frame", {
    plistPath,
    frameName,
    texturePath,
  });
};

export const addIconEditorFrameTexture = async (
  plistPath: string,
  frameName: string,
  texturePath: string,
): Promise<void> => {
  await invoke<void>("icon_editor_add_frame", {
    plistPath,
    frameName,
    texturePath,
  });
};

export const extractIconEditorFrames = async (
  plistPath: string,
): Promise<IconEditorExtractedFrame[]> =>
  invoke<IconEditorExtractedFrame[]>("icon_editor_extract_frames", { plistPath });

export const renameIconEditorSheet = async (
  plistPath: string,
  newStem: string,
): Promise<IconEditorRenameResult> =>
  invoke<IconEditorRenameResult>("icon_editor_rename_sheet", { plistPath, newStem });
