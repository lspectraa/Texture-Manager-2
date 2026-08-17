import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./tauriOperations";

function invokeErrorMessage(err: unknown): string {
  if (typeof err === "string" && err.trim()) {
    return err;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
  }
  return "glow generation failed";
}

export const generateIconGlowFromPng = async (
  pngDataUrl: string,
  thickness: number,
): Promise<{ dataUrl: string } | { error: string }> => {
  if (!isTauriRuntime()) {
    return { error: "Glow generation needs the desktop app." };
  }
  try {
    const dataUrl = await invoke<string>("generate_icon_glow_cmd", {
      pngDataUrl,
      thickness: Math.min(128, Math.max(1, thickness)),
    });
    if (!dataUrl) {
      return { error: "empty glow response" };
    }
    return { dataUrl };
  } catch (err) {
    return { error: invokeErrorMessage(err) };
  }
};
