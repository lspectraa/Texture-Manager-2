import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  CreateTexturePackRequest,
  CreateTexturePackResult,
  InstallPackOptions,
  InstallPackResult,
  InstallPlan,
  InstalledPack,
  PackInstallProgress,
  PackOperationKind,
  ReadPackMetadataResult,
  RunPackOperationOptions,
  RunPackOperationResult,
  UpdateInstalledPackMetadataRequest,
} from "../domain/packInstaller";
import { DEFAULT_INSTALL_PACK_OPTIONS } from "../domain/packInstaller";
import { isTauriRuntime } from "./tauriOperations";

const PACK_INSTALL_PROGRESS_EVENT = "pack-install-progress";

export const discoverPackInstall = async (path: string): Promise<InstallPlan> => {
  if (!isTauriRuntime()) {
    throw new Error("Pack discovery requires the Tauri runtime.");
  }
  return invoke<InstallPlan>("discover_pack_install", { path });
};

export const installPackPlan = async (
  plan: InstallPlan,
  unitIds: string[],
  options: InstallPackOptions = DEFAULT_INSTALL_PACK_OPTIONS,
  onProgress?: (progress: PackInstallProgress) => void,
): Promise<InstallPackResult> => {
  if (!isTauriRuntime()) {
    throw new Error("Pack install requires the Tauri runtime.");
  }

  const unlisten = onProgress
    ? await listen<PackInstallProgress>(PACK_INSTALL_PROGRESS_EVENT, (event) => {
        onProgress(event.payload);
      })
    : null;

  try {
    return await invoke<InstallPackResult>("install_pack_plan", {
      plan,
      unitIds,
      options,
    });
  } finally {
    unlisten?.();
  }
};

export const createTexturePack = async (
  request: CreateTexturePackRequest,
): Promise<CreateTexturePackResult> => {
  if (!isTauriRuntime()) {
    throw new Error("Create pack requires the Tauri runtime.");
  }
  return invoke<CreateTexturePackResult>("create_texture_pack", {
    folderName: request.folderName,
    metadata: request.metadata,
    packPngPath: request.packPngPath ?? null,
    sourceDir: request.sourceDir ?? null,
  });
};

export const readPackMetadata = async (
  packDir: string,
): Promise<ReadPackMetadataResult> => {
  if (!isTauriRuntime()) {
    throw new Error("Read pack metadata requires the Tauri runtime.");
  }
  return invoke<ReadPackMetadataResult>("read_pack_metadata", { packDir });
};

export const cleanupPackInstallTemp = async (tempDir: string): Promise<void> => {
  if (!isTauriRuntime() || !tempDir.trim()) {
    return;
  }
  await invoke<void>("cleanup_pack_install_temp", { tempDir });
};

/**
 * Load pack.png (or any PNG) as a data URL for the metadata sidebar.
 * Uses the shared allowlisted PNG reader until a dedicated pack command exists.
 */
export const getPackPngDataUrl = async (path: string): Promise<string | null> => {
  if (!isTauriRuntime() || !path.trim()) {
    return null;
  }
  try {
    return await invoke<string>("icon_editor_png_data_url", {
      texturePath: path,
    });
  } catch {
    return null;
  }
};

export const listInstalledPacks = async (): Promise<InstalledPack[]> => {
  if (!isTauriRuntime()) {
    throw new Error("List installed packs requires the Tauri runtime.");
  }
  return invoke<InstalledPack[]>("list_installed_packs");
};

export const updateInstalledPackMetadata = async (
  request: UpdateInstalledPackMetadataRequest,
): Promise<ReadPackMetadataResult> => {
  if (!isTauriRuntime()) {
    throw new Error("Update pack metadata requires the Tauri runtime.");
  }
  return invoke<ReadPackMetadataResult>("update_installed_pack_metadata", {
    packDir: request.packDir,
    metadata: request.metadata,
    updatePackPng: request.updatePackPng,
    packPngPath: request.updatePackPng ? (request.packPngPath ?? null) : null,
  });
};

export const deleteInstalledPack = async (packDir: string): Promise<void> => {
  if (!isTauriRuntime()) {
    throw new Error("Delete pack requires the Tauri runtime.");
  }
  await invoke<void>("delete_installed_pack", { packDir });
};

export const runPackOperation = async (
  packDir: string,
  kind: PackOperationKind,
  options: RunPackOperationOptions = {},
  onProgress?: (progress: PackInstallProgress) => void,
): Promise<RunPackOperationResult> => {
  if (!isTauriRuntime()) {
    throw new Error("Pack operation requires the Tauri runtime.");
  }

  const unlisten = onProgress
    ? await listen<PackInstallProgress>(PACK_INSTALL_PROGRESS_EVENT, (event) => {
        onProgress(event.payload);
      })
    : null;

  try {
    return await invoke<RunPackOperationResult>("run_pack_operation", {
      packDir,
      kind,
      options: {
        gameVersion: options.gameVersion ?? "",
        lowPort: options.lowPort ?? false,
        outputDir: options.outputDir ?? "",
        sheetConcurrency: options.sheetConcurrency ?? 5,
      },
    });
  } finally {
    unlisten?.();
  }
};
