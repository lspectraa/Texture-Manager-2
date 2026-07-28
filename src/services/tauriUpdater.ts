import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { APP_VERSION } from "../config/appMeta";
import { isTauriRuntime } from "./tauriOperations";

export type UpdateDownloadProgress = {
  downloaded: number;
  total: number | null;
};

export type AvailableAppUpdate = {
  version: string;
  currentVersion: string;
  notes: string | null;
  date: string | null;
};

export type UpdateCheckResult =
  | { status: "unsupported" }
  | { status: "upToDate"; currentVersion: string }
  | { status: "available"; update: AvailableAppUpdate }
  | { status: "error"; message: string; currentVersion: string };

let pendingUpdate: Update | null = null;

function clearPendingUpdate(): void {
  if (pendingUpdate) {
    void pendingUpdate.close().catch(() => {
      // Best-effort cleanup if the updater resource is already closed.
    });
  }
  pendingUpdate = null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error);
}

export async function getAppPackageVersion(): Promise<string> {
  if (!isTauriRuntime()) {
    return APP_VERSION;
  }
  try {
    return await getVersion();
  } catch {
    return APP_VERSION;
  }
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = await getAppPackageVersion();
  if (!isTauriRuntime()) {
    return { status: "unsupported" };
  }

  try {
    clearPendingUpdate();
    const update = await check();
    if (!update) {
      return { status: "upToDate", currentVersion };
    }

    pendingUpdate = update;
    return {
      status: "available",
      update: {
        version: update.version,
        currentVersion: update.currentVersion || currentVersion,
        notes: update.body ?? null,
        date: update.date ?? null,
      },
    };
  } catch (error) {
    clearPendingUpdate();
    return {
      status: "error",
      message: toErrorMessage(error),
      currentVersion,
    };
  }
}

export async function downloadAndInstallPendingUpdate(
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<void> {
  if (!pendingUpdate) {
    throw new Error("No pending update is ready to install.");
  }

  let downloaded = 0;
  let total: number | null = null;

  await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        total =
          typeof event.data.contentLength === "number"
            ? event.data.contentLength
            : null;
        downloaded = 0;
        onProgress?.({ downloaded, total });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total });
        break;
      case "Finished":
        onProgress?.({ downloaded, total });
        break;
    }
  });

  pendingUpdate = null;
}

export async function relaunchAppAfterUpdate(): Promise<void> {
  await relaunch();
}

export function dismissPendingUpdate(): void {
  clearPendingUpdate();
}
