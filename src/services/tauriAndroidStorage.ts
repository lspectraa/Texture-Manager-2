import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauriOperations";

export type AndroidGeodePathProbe = {
  path: string;
  exists: boolean;
  isDir: boolean;
  looksLikeGeode: boolean;
};

export type AndroidStorageStatus = {
  allFilesGranted: boolean;
  geodeReadable: boolean;
  geodePath: string | null;
};

declare global {
  interface Window {
    /** Playwright / dev override for storage status in browser builds. */
    __TM2_TEST_STORAGE_STATUS__?: AndroidStorageStatus;
  }
}

function readTestStorageStatus(): AndroidStorageStatus | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.__TM2_TEST_STORAGE_STATUS__ ?? null;
}

export async function androidGetStorageStatus(): Promise<AndroidStorageStatus> {
  const testStatus = readTestStorageStatus();
  if (testStatus) {
    return testStatus;
  }
  if (!isTauriRuntime()) {
    return {
      allFilesGranted: true,
      geodeReadable: true,
      geodePath: null,
    };
  }
  return invoke<AndroidStorageStatus>("android_get_storage_status");
}

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
