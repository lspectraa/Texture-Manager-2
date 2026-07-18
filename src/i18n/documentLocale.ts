import {
  getLanguageMeta,
  type AppLanguage,
} from "./languages";

/** Sync `document.documentElement` lang/dir with the active app language. */
export function applyDocumentLocale(language: AppLanguage): void {
  if (typeof document === "undefined") {
    return;
  }
  const meta = getLanguageMeta(language);
  document.documentElement.lang = meta.locale;
  document.documentElement.dir = meta.direction;
}
