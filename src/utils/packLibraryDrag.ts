import type { InstalledPack } from "../domain/packInstaller";
import { PACK_LIBRARY_DRAG_MIME } from "../services/tauriPackInstaller";

export type PackLibraryDragPayload = {
  path: string;
  folderName: string;
};

let activeDragPack: PackLibraryDragPayload | null = null;

export function packLibraryDragPayload(pack: {
  path: string;
  folderName: string;
}): string {
  return JSON.stringify({
    path: pack.path,
    folderName: pack.folderName,
  } satisfies PackLibraryDragPayload);
}

export function beginPackLibraryDrag(pack: {
  path: string;
  folderName: string;
}): void {
  activeDragPack = {
    path: pack.path,
    folderName: pack.folderName,
  };
}

export function endPackLibraryDrag(): void {
  activeDragPack = null;
}

export function isPackLibraryDragActive(): boolean {
  return activeDragPack !== null;
}

export function startPackLibraryDrag(
  dataTransfer: DataTransfer,
  pack: { path: string; folderName: string },
): void {
  beginPackLibraryDrag(pack);
  const payload = packLibraryDragPayload(pack);
  try {
    dataTransfer.setData(PACK_LIBRARY_DRAG_MIME, payload);
    dataTransfer.setData("text/plain", payload);
  } catch {
    // Tauri/WKWebView may reject custom types; in-memory state is the source of truth.
  }
  dataTransfer.effectAllowed = "copy";
}

export function packLibraryDragActive(dataTransfer: DataTransfer): boolean {
  if (isPackLibraryDragActive()) {
    return true;
  }
  return (
    dataTransfer.types.includes(PACK_LIBRARY_DRAG_MIME) ||
    dataTransfer.types.includes("text/plain")
  );
}

function payloadToInstalledPack(payload: PackLibraryDragPayload): InstalledPack {
  return {
    id: `library:${payload.folderName}`,
    folderName: payload.folderName,
    path: payload.path,
  };
}

export function consumePackLibraryDrag(): InstalledPack | null {
  if (!activeDragPack) {
    return null;
  }
  const pack = payloadToInstalledPack(activeDragPack);
  activeDragPack = null;
  return pack;
}

export function readPackLibraryDragData(dataTransfer: DataTransfer): InstalledPack | null {
  const raw =
    dataTransfer.getData(PACK_LIBRARY_DRAG_MIME) ||
    dataTransfer.getData("text/plain");
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as PackLibraryDragPayload;
      if (parsed.path && parsed.folderName) {
        return payloadToInstalledPack(parsed);
      }
    } catch {
      // Fall through to in-memory drag state.
    }
  }
  return consumePackLibraryDrag();
}
