import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  CURRENT_ONBOARDING_VERSION,
  DEFAULT_APP_SETTINGS_VIEW,
} from "./domain/settings";
import { initAppI18n } from "./i18n";
import { resolveInitialAppLanguage } from "./i18n/languages";
import { getAppSettings } from "./services/tauriSettings";
import { applyShellDataset } from "./utils/platform";
import { applyTheme, initTheme, setStoredTheme } from "./utils/theme";

const BOOTSTRAP_TIMEOUT_MS = 8000;

async function withTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs = BOOTSTRAP_TIMEOUT_MS,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

function showBootError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[TM2] bootstrap failed", error);
  const root = document.getElementById("root");
  if (!root) {
    return;
  }
  root.innerHTML = `<p id="boot-fallback" style="white-space:pre-wrap;color:#ffb4b4">Failed to start Texture Manager 2:\n${message}</p>`;
}

async function bootstrap(): Promise<void> {
  applyShellDataset();
  // First paint from localStorage; persisted settings refine it before render.
  initTheme();

  // Desktop app: suppress the browser default context menu everywhere.
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  const settings = await withTimeout(
    getAppSettings().catch(() => ({
      ...DEFAULT_APP_SETTINGS_VIEW,
    })),
    { ...DEFAULT_APP_SETTINGS_VIEW },
  );
  applyTheme(settings.theme);
  setStoredTheme(settings.theme);

  const language = resolveInitialAppLanguage({
    persistedLanguage: settings.language,
    onboardingComplete:
      settings.onboardingVersion >= CURRENT_ONBOARDING_VERSION,
  });
  await withTimeout(initAppI18n(language), undefined);

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap().catch(showBootError);
