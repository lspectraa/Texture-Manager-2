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
import { applyTheme, initTheme, setStoredTheme } from "./utils/theme";

async function bootstrap(): Promise<void> {
  // First paint from localStorage; persisted settings refine it before render.
  initTheme();

  const settings = await getAppSettings().catch(() => ({
    ...DEFAULT_APP_SETTINGS_VIEW,
  }));
  applyTheme(settings.theme);
  setStoredTheme(settings.theme);

  const language = resolveInitialAppLanguage({
    persistedLanguage: settings.language,
    onboardingComplete:
      settings.onboardingVersion >= CURRENT_ONBOARDING_VERSION,
  });
  await initAppI18n(language);

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
