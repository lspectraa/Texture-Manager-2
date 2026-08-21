import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/platform";

export const importUserPath = async (sourcePath: string): Promise<string> => {
  if (!isTauriRuntime()) {
    return sourcePath;
  }
  return invoke<string>("import_user_path", { sourcePath });
};

export const allocateOutputDir = async (toolId: string): Promise<string> => {
  if (!isTauriRuntime()) {
    return "";
  }
  return invoke<string>("allocate_output_dir", { toolId });
};

export const exportDirectoryAsZip = async (
  sourceDir: string,
  zipPath: string,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke<void>("export_directory_as_zip", { sourceDir, zipPath });
};
