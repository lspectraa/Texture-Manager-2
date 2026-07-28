import type { ParticleConfig } from "../domain/particleConfig";
import { defaultParticleConfig } from "../domain/particleConfig";
import type { TextureSource } from "./tauriParticleEditor";

export type ParticleEditorSnapshot = {
  config: ParticleConfig;
  textureSrc: string | null;
  /** How the current texture was resolved — used for save embed vs sibling PNG. */
  textureSource: TextureSource;
  filePath: string | null;
  effectId: string | null;
  usePlistSourcePosition: boolean;
};

export type ParticleEditorHistoryState = {
  past: ParticleEditorSnapshot[];
  present: ParticleEditorSnapshot;
  future: ParticleEditorSnapshot[];
};

export const PARTICLE_EDITOR_HISTORY_LIMIT = 100;

export const emptyParticleEditorSnapshot = (): ParticleEditorSnapshot => ({
  config: defaultParticleConfig(),
  textureSrc: null,
  textureSource: "none",
  filePath: null,
  effectId: null,
  usePlistSourcePosition: false,
});

export const cloneParticleEditorSnapshot = (
  snapshot: ParticleEditorSnapshot,
): ParticleEditorSnapshot => ({
  config: { ...snapshot.config },
  textureSrc: snapshot.textureSrc,
  textureSource: snapshot.textureSource,
  filePath: snapshot.filePath,
  effectId: snapshot.effectId,
  usePlistSourcePosition: snapshot.usePlistSourcePosition,
});

export const particleEditorSnapshotsEqual = (
  left: ParticleEditorSnapshot,
  right: ParticleEditorSnapshot,
): boolean => {
  if (
    left.textureSrc !== right.textureSrc ||
    left.textureSource !== right.textureSource ||
    left.filePath !== right.filePath ||
    left.effectId !== right.effectId ||
    left.usePlistSourcePosition !== right.usePlistSourcePosition
  ) {
    return false;
  }
  const leftKeys = Object.keys(left.config) as Array<keyof ParticleConfig>;
  const rightKeys = Object.keys(right.config) as Array<keyof ParticleConfig>;
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left.config[key] !== right.config[key]) {
      return false;
    }
  }
  return true;
};

export const commitParticleEditorHistory = (
  history: ParticleEditorHistoryState,
  nextPresent: ParticleEditorSnapshot,
): ParticleEditorHistoryState => {
  const present = cloneParticleEditorSnapshot(nextPresent);
  if (particleEditorSnapshotsEqual(history.present, present)) {
    return history;
  }
  return {
    past: [...history.past, cloneParticleEditorSnapshot(history.present)].slice(
      -PARTICLE_EDITOR_HISTORY_LIMIT,
    ),
    present,
    future: [],
  };
};

export const undoParticleEditorHistory = (
  history: ParticleEditorHistoryState,
): ParticleEditorHistoryState | null => {
  if (history.past.length === 0) {
    return null;
  }
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: cloneParticleEditorSnapshot(previous),
    future: [cloneParticleEditorSnapshot(history.present), ...history.future],
  };
};

export const redoParticleEditorHistory = (
  history: ParticleEditorHistoryState,
): ParticleEditorHistoryState | null => {
  if (history.future.length === 0) {
    return null;
  }
  const [next, ...rest] = history.future;
  return {
    past: [...history.past, cloneParticleEditorSnapshot(history.present)].slice(
      -PARTICLE_EDITOR_HISTORY_LIMIT,
    ),
    present: cloneParticleEditorSnapshot(next),
    future: rest,
  };
};
