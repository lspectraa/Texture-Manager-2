import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { applyDocumentLocale } from "./documentLocale";
import {
  DEFAULT_APP_LANGUAGE,
  type AppLanguage,
} from "./languages";
import en from "./locales/en";
import es from "./locales/es";
import ru from "./locales/ru";

export const I18N_NAMESPACES = [
  "common",
  "navigation",
  "onboarding",
  "settings",
  "tools",
  "iconEditor",
  "reports",
  "errors",
] as const;

const resources = {
  en,
  es,
  ru,
} as const;

let initialized = false;

export async function initAppI18n(
  language: AppLanguage = DEFAULT_APP_LANGUAGE,
): Promise<typeof i18n> {
  if (!initialized) {
    await i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: DEFAULT_APP_LANGUAGE,
      defaultNS: "common",
      ns: [...I18N_NAMESPACES],
      interpolation: {
        escapeValue: false,
      },
      returnNull: false,
      // Surface missing keys in development.
      saveMissing: import.meta.env.DEV,
      missingKeyHandler: import.meta.env.DEV
        ? (_lngs, ns, key) => {
            console.warn(`[i18n] Missing key: ${ns}:${key}`);
          }
        : undefined,
    });
    initialized = true;
  } else if (i18n.language !== language) {
    await i18n.changeLanguage(language);
  }

  applyDocumentLocale(language);
  return i18n;
}

export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  if (!initialized) {
    await initAppI18n(language);
    return;
  }
  await i18n.changeLanguage(language);
  applyDocumentLocale(language);
}

export function getAppI18n() {
  return i18n;
}

export default i18n;
