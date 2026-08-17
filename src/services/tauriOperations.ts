import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  OperationProgress,
  OperationReport,
  OperationRequest,
  PhaseDefaults,
} from "../domain/operations";

export const isTauriRuntime = (): boolean => {
  return "__TAURI_INTERNALS__" in window;
};

export const getPhaseDefaults = async (): Promise<PhaseDefaults> => {
  if (!isTauriRuntime()) {
    return {
      splitter: {
        sheetConcurrency: 5,
        skipIcons: false,
      },
      porter: {
        lowPort: false,
        dimensions: null,
        sheetConcurrency: 5,
      },
      merger: {
        includeOutsidePlistFiles: false,
        dimensions: null,
        sheetConcurrency: 5,
      },
      convertToNewVersion: {
        gameVersion: "",
        sheetConcurrency: 5,
      },
      upscaler: {
        model: "waifu2x",
        targetGraphics: "uhd",
        convertToLatest: false,
        gameVersion: "",
        sheetConcurrency: 1,
        glowThickness: 4,
        glowTolerance: 32,
      },
    };
  }

  return invoke<PhaseDefaults>("get_phase_defaults");
};

export const requestOperationCancel = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }
  await invoke<void>("cancel_operation");
};

export const runOperation = async (
  request: OperationRequest,
  onProgress?: (progress: OperationProgress) => void,
): Promise<OperationReport> => {
  if (!isTauriRuntime()) {
    onProgress?.({
      gamesheetName: "",
      spritesCompleted: 0,
      spritesTotal: 1,
      plistsCompleted: 0,
      plistsTotal: 0,
    });
    return {
      operation: request.kind,
      filesSeen: 0,
      filesProcessed: 0,
      outputDir: request.outputDir,
      elapsedMs: 0,
      issues: [
        {
          level: "warning",
          message:
            "Operation execution is only available inside the Tauri runtime.",
          file: null,
        },
      ],
    };
  }

  const unlisten = await listen<OperationProgress>("operation-progress", (event) => {
    onProgress?.(event.payload);
  });

  try {
    return await invoke<OperationReport>("run_operation", { request });
  } catch (error: unknown) {
    const backendMessage =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : JSON.stringify(error);
    throw new Error(`Backend operation failed: ${backendMessage}`);
  } finally {
    unlisten();
  }
};
