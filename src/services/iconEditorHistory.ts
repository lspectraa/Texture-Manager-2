import type { IconEditorPoint, IconEditorSize } from "./tauriIconEditor";

export type IconEditorSerializedTextureEdit = {
  pngDataUrl: string;
  spriteSize: IconEditorSize;
  spriteSourceSize: IconEditorSize;
  spriteOffset: IconEditorPoint;
  textureRotated: boolean;
  isNewFrame: boolean;
};

export type IconEditorEditSnapshot = {
  offsetEdits: Record<string, IconEditorPoint>;
  roleMapExtra: string;
  textureEdits: Record<string, IconEditorSerializedTextureEdit>;
};

export type IconEditorHistoryState = {
  past: IconEditorEditSnapshot[];
  present: IconEditorEditSnapshot;
  future: IconEditorEditSnapshot[];
};

const STORAGE_KEY_PREFIX = "texture-manager:icon-editor-history:";
export const ICON_EDITOR_HISTORY_LIMIT = 100;
/** Cap persisted undo depth (in-memory can be larger). */
export const ICON_EDITOR_PERSISTED_HISTORY_LIMIT = 20;

export const emptyIconEditorEditSnapshot = (): IconEditorEditSnapshot => ({
  offsetEdits: {},
  roleMapExtra: "",
  textureEdits: {},
});

const cloneSerializedTextureEdit = (
  edit: IconEditorSerializedTextureEdit,
): IconEditorSerializedTextureEdit => ({
  pngDataUrl: edit.pngDataUrl,
  spriteSize: { ...edit.spriteSize },
  spriteSourceSize: { ...edit.spriteSourceSize },
  spriteOffset: { ...edit.spriteOffset },
  textureRotated: edit.textureRotated,
  isNewFrame: edit.isNewFrame,
});

export const cloneIconEditorEditSnapshot = (
  snapshot: IconEditorEditSnapshot,
): IconEditorEditSnapshot => ({
  roleMapExtra: snapshot.roleMapExtra,
  offsetEdits: Object.fromEntries(
    Object.entries(snapshot.offsetEdits).map(([name, point]) => [name, { ...point }]),
  ),
  textureEdits: Object.fromEntries(
    Object.entries(snapshot.textureEdits ?? {}).map(([name, edit]) => [
      name,
      cloneSerializedTextureEdit(edit),
    ]),
  ),
});

/** Persist offsets / role map only — strip PNG data URLs to avoid localStorage quota pressure. */
const snapshotForPersistence = (
  snapshot: IconEditorEditSnapshot,
): IconEditorEditSnapshot => ({
  roleMapExtra: snapshot.roleMapExtra,
  offsetEdits: Object.fromEntries(
    Object.entries(snapshot.offsetEdits).map(([name, point]) => [name, { ...point }]),
  ),
  textureEdits: {},
});

const serializedTextureEditsEqual = (
  left: Record<string, IconEditorSerializedTextureEdit>,
  right: Record<string, IconEditorSerializedTextureEdit>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    const leftEdit = left[key];
    const rightEdit = right[key];
    if (!rightEdit) {
      return false;
    }
    if (
      leftEdit.pngDataUrl !== rightEdit.pngDataUrl ||
      leftEdit.spriteSize.width !== rightEdit.spriteSize.width ||
      leftEdit.spriteSize.height !== rightEdit.spriteSize.height ||
      leftEdit.spriteSourceSize.width !== rightEdit.spriteSourceSize.width ||
      leftEdit.spriteSourceSize.height !== rightEdit.spriteSourceSize.height ||
      leftEdit.spriteOffset.x !== rightEdit.spriteOffset.x ||
      leftEdit.spriteOffset.y !== rightEdit.spriteOffset.y ||
      leftEdit.textureRotated !== rightEdit.textureRotated ||
      leftEdit.isNewFrame !== rightEdit.isNewFrame
    ) {
      return false;
    }
  }
  return true;
};

export const iconEditorEditSnapshotsEqual = (
  left: IconEditorEditSnapshot,
  right: IconEditorEditSnapshot,
): boolean => {
  if (left.roleMapExtra !== right.roleMapExtra) {
    return false;
  }
  const leftKeys = Object.keys(left.offsetEdits);
  const rightKeys = Object.keys(right.offsetEdits);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    const leftPoint = left.offsetEdits[key];
    const rightPoint = right.offsetEdits[key];
    if (!rightPoint || leftPoint.x !== rightPoint.x || leftPoint.y !== rightPoint.y) {
      return false;
    }
  }
  return serializedTextureEditsEqual(left.textureEdits ?? {}, right.textureEdits ?? {});
};

const historyStorageKey = (plistPath: string): string =>
  `${STORAGE_KEY_PREFIX}${plistPath.trim().toLowerCase()}`;

export const loadIconEditorHistory = (plistPath: string): IconEditorHistoryState | null => {
  if (typeof window === "undefined" || !plistPath.trim()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(historyStorageKey(plistPath));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as IconEditorHistoryState;
    if (!parsed || typeof parsed !== "object" || !parsed.present) {
      return null;
    }
    return {
      past: Array.isArray(parsed.past)
        ? parsed.past.map((entry) => cloneIconEditorEditSnapshot(entry))
        : [],
      present: cloneIconEditorEditSnapshot(parsed.present),
      future: Array.isArray(parsed.future)
        ? parsed.future.map((entry) => cloneIconEditorEditSnapshot(entry))
        : [],
    };
  } catch {
    return null;
  }
};

export const saveIconEditorHistory = (
  plistPath: string,
  history: IconEditorHistoryState,
): void => {
  if (typeof window === "undefined" || !plistPath.trim()) {
    return;
  }
  try {
    window.localStorage.setItem(
      historyStorageKey(plistPath),
      JSON.stringify({
        past: history.past
          .slice(-ICON_EDITOR_PERSISTED_HISTORY_LIMIT)
          .map((entry) => snapshotForPersistence(entry)),
        present: snapshotForPersistence(history.present),
        // Do not persist redo stack — texture blobs were stripped anyway.
        future: [],
      }),
    );
  } catch {
    // Ignore quota or serialization failures; in-memory undo still works.
  }
};

export const clearIconEditorHistory = (plistPath: string): void => {
  if (typeof window === "undefined" || !plistPath.trim()) {
    return;
  }
  try {
    window.localStorage.removeItem(historyStorageKey(plistPath));
  } catch {
    // ignore
  }
};

export const commitIconEditorHistory = (
  history: IconEditorHistoryState,
  nextPresent: IconEditorEditSnapshot,
): IconEditorHistoryState => {
  const present = cloneIconEditorEditSnapshot(nextPresent);
  if (iconEditorEditSnapshotsEqual(history.present, present)) {
    return history;
  }
  return {
    past: [...history.past, cloneIconEditorEditSnapshot(history.present)].slice(
      -ICON_EDITOR_HISTORY_LIMIT,
    ),
    present,
    future: [],
  };
};

export const undoIconEditorHistory = (
  history: IconEditorHistoryState,
): IconEditorHistoryState | null => {
  if (history.past.length === 0) {
    return null;
  }
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: cloneIconEditorEditSnapshot(previous),
    future: [cloneIconEditorEditSnapshot(history.present), ...history.future],
  };
};

export const redoIconEditorHistory = (
  history: IconEditorHistoryState,
): IconEditorHistoryState | null => {
  if (history.future.length === 0) {
    return null;
  }
  const [next, ...remainingFuture] = history.future;
  return {
    past: [...history.past, cloneIconEditorEditSnapshot(history.present)],
    present: cloneIconEditorEditSnapshot(next),
    future: remainingFuture.map((entry) => cloneIconEditorEditSnapshot(entry)),
  };
};
