import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { isAndroidPlatform, isTauriRuntime } from "../utils/platform";
import { importUserPath } from "./tauriMobileFs";

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
 * Open a file picker. On Android copies the selection into app storage so Rust
 * can read a real path (dialog returns content:// URIs).
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
              extensions: options.extensions,
            },
          ]
        : undefined,
  });
  if (typeof selected !== "string" || !selected.trim()) {
    return null;
  }
  return selected;
}
