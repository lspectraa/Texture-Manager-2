import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { APP_VERSION } from "../config/appMeta";
import {
  isAndroidPlatform,
  isDesktopPlatform,
  isSimulateUpdateEnabled,
  isTauriRuntime,
} from "../utils/platform";

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

type PendingAndroidUpdate = {
  url: string;
  sha256: string;
};

type AndroidUpdateCheckResult =
  | { status: "unsupported" }
  | { status: "upToDate"; currentVersion: string }
  | {
      status: "available";
      currentVersion: string;
      version: string;
      notes: string | null;
      date: string | null;
      url: string;
      sha256: string;
    };

const ANDROID_UPDATE_DOWNLOAD_PROGRESS_EVENT =
  "android-update-download-progress";

let pendingUpdate: Update | null = null;
let pendingAndroidUpdate: PendingAndroidUpdate | null = null;
let pendingSimulatedUpdate = false;

function clearPendingDesktopUpdate(): void {
  if (pendingUpdate) {
    void pendingUpdate.close().catch(() => {
      // Best-effort cleanup if the updater resource is already closed.
    });
  }
  pendingUpdate = null;
}

function clearPendingUpdate(): void {
  clearPendingDesktopUpdate();
  pendingAndroidUpdate = null;
  pendingSimulatedUpdate = false;
}

function bumpPatchVersion(version: string): string {
  const trimmed = version.trim().replace(/^v/i, "");
  const [core] = trimmed.split(/[-+]/);
  const parts = core.split(".");
  const major = Number.parseInt(parts[0] ?? "0", 10) || 0;
  const minor = Number.parseInt(parts[1] ?? "0", 10) || 0;
  const patch = Number.parseInt(parts[2] ?? "0", 10) || 0;
  return `${major}.${minor}.${patch + 1}`;
}

async function checkForSimulatedAppUpdate(
  currentVersion: string,
): Promise<UpdateCheckResult> {
  clearPendingUpdate();
  pendingSimulatedUpdate = true;
  const nextVersion = bumpPatchVersion(currentVersion);
  return {
    status: "available",
    update: {
      version: nextVersion,
      currentVersion,
      notes:
        "Simulated update for UI testing (?simulateUpdate=1 or localStorage.tmSimulateUpdate=1). Install runs a fake download only — nothing is applied.",
      date: new Date().toISOString(),
    },
  };
}

async function downloadAndInstallSimulatedUpdate(
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<void> {
  if (!pendingSimulatedUpdate) {
    throw new Error("No pending update is ready to install.");
  }

  const total = 4_000_000;
  let downloaded = 0;
  const steps = 12;
  const stepBytes = Math.floor(total / steps);
  for (let i = 0; i < steps; i += 1) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, 80);
    });
    downloaded = Math.min(total, downloaded + stepBytes);
    onProgress?.({ downloaded, total });
  }
  onProgress?.({ downloaded: total, total });
  pendingSimulatedUpdate = false;
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

async function checkForAndroidAppUpdate(
  currentVersion: string,
): Promise<UpdateCheckResult> {
  try {
    clearPendingUpdate();
    const result = await invoke<AndroidUpdateCheckResult>(
      "android_check_app_update",
    );

    switch (result.status) {
      case "unsupported":
        return { status: "unsupported" };
      case "upToDate":
        return {
          status: "upToDate",
          currentVersion: result.currentVersion || currentVersion,
        };
      case "available":
        pendingAndroidUpdate = {
          url: result.url,
          sha256: result.sha256,
        };
        return {
          status: "available",
          update: {
            version: result.version,
            currentVersion: result.currentVersion || currentVersion,
            notes: result.notes ?? null,
            date: result.date ?? null,
          },
        };
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  } catch (error) {
    clearPendingUpdate();
    return {
      status: "error",
      message: toErrorMessage(error),
      currentVersion,
    };
  }
}

async function checkForDesktopAppUpdate(
  currentVersion: string,
): Promise<UpdateCheckResult> {
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

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = await getAppPackageVersion();

  if (isSimulateUpdateEnabled()) {
    return checkForSimulatedAppUpdate(currentVersion);
  }

  if (!isTauriRuntime()) {
    return { status: "unsupported" };
  }

  if (isAndroidPlatform()) {
    return checkForAndroidAppUpdate(currentVersion);
  }

  if (isDesktopPlatform()) {
    return checkForDesktopAppUpdate(currentVersion);
  }

  return { status: "unsupported" };
}

async function downloadAndInstallAndroidUpdate(
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<void> {
  if (!pendingAndroidUpdate) {
    throw new Error("No pending update is ready to install.");
  }

  const { url, sha256 } = pendingAndroidUpdate;

  const unlisten = onProgress
    ? await listen<UpdateDownloadProgress>(
        ANDROID_UPDATE_DOWNLOAD_PROGRESS_EVENT,
        (event) => {
          onProgress(event.payload);
        },
      )
    : null;

  try {
    const { path } = await invoke<{ path: string }>(
      "android_download_app_update",
      { url, sha256 },
    );
    await invoke("android_install_app_update", { path });
    pendingAndroidUpdate = null;
  } catch (error) {
    const message = toErrorMessage(error);
    if (/checksum|integrity|sha-?256/i.test(message)) {
      throw new Error("INTEGRITY_FAILED");
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    unlisten?.();
  }
}

async function downloadAndInstallDesktopUpdate(
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

export async function downloadAndInstallPendingUpdate(
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<void> {
  if (pendingSimulatedUpdate || isSimulateUpdateEnabled()) {
    await downloadAndInstallSimulatedUpdate(onProgress);
    return;
  }

  if (isAndroidPlatform()) {
    await downloadAndInstallAndroidUpdate(onProgress);
    return;
  }

  await downloadAndInstallDesktopUpdate(onProgress);
}

export async function relaunchAppAfterUpdate(): Promise<void> {
  if (isAndroidPlatform() || pendingSimulatedUpdate || isSimulateUpdateEnabled()) {
    // System package installer / simulated update — no in-app relaunch.
    return;
  }
  await relaunch();
}

export function dismissPendingUpdate(): void {
  clearPendingUpdate();
}

export async function needsInstallPermission(): Promise<boolean> {
  if (!isTauriRuntime() || !isAndroidPlatform()) {
    return false;
  }
  try {
    const canInstall = await invoke<boolean>("android_can_install_packages");
    return !canInstall;
  } catch {
    return false;
  }
}

export async function openInstallPermissionSettings(): Promise<void> {
  if (!isTauriRuntime() || !isAndroidPlatform()) {
    return;
  }
  await invoke("android_open_install_permission_settings");
}
