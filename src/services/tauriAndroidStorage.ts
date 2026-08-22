import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauriOperations";

export type AndroidGeodePathProbe = {
  path: string;
  exists: boolean;
  isDir: boolean;
  looksLikeGeode: boolean;
};

export async function androidCheckAllFilesAccess(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return true;
  }
  return invoke<boolean>("android_check_all_files_access");
}

export async function androidRequestAllFilesAccess(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke("android_request_all_files_access");
}

export async function androidProbeGeodePaths(): Promise<AndroidGeodePathProbe[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<AndroidGeodePathProbe[]>("android_probe_geode_paths");
}
