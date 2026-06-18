import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "../services/tauriOperations";

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    await openUrl(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
