import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { isAndroidPlatform, isTauriRuntime } from "../utils/platform";
import { commitUserSave, importUserPath } from "./tauriMobileFs";

export type PickFolderOptions = {
  /** When true (default), Android copies the tree into app storage. */
  importToSandbox?: boolean;
  title?: string;
};

export type PickFileOptions = {
  title?: string;
  extensions?: string[];
  filterName?: string;
};

export type PickSaveFileOptions = {
  title?: string;
  defaultName?: string;
  extensions?: string[];
  filterName?: string;
};

export type UserSavePick = {
  path: string;
  needsCommit: boolean;
};

/** Map picker extensions to native dialog filters (desktop). */
function dialogExtensions(extensions: string[]): string[] {
  const normalized = extensions.map((ext) => ext.trim().toLowerCase().replace(/^\./, ""));
  const out = new Set(normalized);
  if (normalized.includes("plist")) {
    out.add("xml");
  }
  return [...out];
}

/**
 * Open a folder picker. On Android uses SAF (dialog plugin has no folder picker).
 * Returns null when the user cancels.
 */
export async function pickUserFolder(
  options: PickFolderOptions = {},
): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  const importToSandbox = options.importToSandbox ?? true;

  if (isAndroidPlatform()) {
    const path = await invoke<string | null>("android_pick_folder", {
      importToSandbox,
    });
    if (typeof path !== "string" || !path.trim()) {
      return null;
    }
    return path;
  }

  const selected = await open({
    directory: true,
    multiple: false,
    title: options.title,
  });
  if (typeof selected !== "string" || !selected.trim()) {
    return null;
  }
  if (importToSandbox) {
    return importUserPath(selected);
  }
  return selected;
}

/**
 * Open a file picker.
 *
 * **Desktop:** native dialog → absolute path.
 *
 * **Android:** SAF picker → Kotlin materializes into `game-files/imports` (or returns
 * a real Geode path when All files access is granted and plist + atlas are readable).
 * Rust always receives an absolute filesystem path, never a `content://` URI.
 */
export async function pickUserFile(
  options: PickFileOptions = {},
): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  if (isAndroidPlatform()) {
    const path = await invoke<string | null>("android_pick_file", {
      extensions: options.extensions ?? null,
    });
    if (typeof path !== "string" || !path.trim()) {
      return null;
    }
    return path;
  }

  const selected = await open({
    directory: false,
    multiple: false,
    title: options.title,
    filters:
      options.extensions && options.extensions.length > 0
        ? [
            {
              name: options.filterName ?? "Files",
              extensions: dialogExtensions(options.extensions),
            },
          ]
        : undefined,
  });
  if (typeof selected !== "string" || !selected.trim()) {
    return null;
  }
  return selected;
}

/**
 * Pick a save destination.
 *
 * **Desktop:** native save dialog → absolute path.
 *
 * **Android:** SAF CREATE_DOCUMENT → writable filesystem path when possible, otherwise
 * a staging path under `game-files/staging` plus `needsCommit` (call [`finalizeUserSave`]).
 */
export async function pickUserSaveFile(
  options: PickSaveFileOptions = {},
): Promise<UserSavePick | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  if (isAndroidPlatform()) {
    const response = await invoke<{ path: string | null; needsCommit: boolean }>(
      "android_save_file",
      {
        defaultName: options.defaultName ?? null,
        extensions: options.extensions ?? null,
      },
    );
    if (typeof response.path !== "string" || !response.path.trim()) {
      return null;
    }
    return { path: response.path, needsCommit: response.needsCommit };
  }

  const selected = await save({
    title: options.title,
    defaultPath: options.defaultName,
    filters:
      options.extensions && options.extensions.length > 0
        ? [
            {
              name: options.filterName ?? "Files",
              extensions: dialogExtensions(options.extensions),
            },
          ]
        : undefined,
  });
  if (typeof selected !== "string" || !selected.trim()) {
    return null;
  }
  return { path: selected, needsCommit: false };
}

/** Copy a staged save from app storage into the user-picked SAF location (Android only). */
export async function finalizeUserSave(sourcePath: string): Promise<void> {
  if (!isTauriRuntime() || !isAndroidPlatform()) {
    return;
  }
  await commitUserSave(sourcePath);
}
