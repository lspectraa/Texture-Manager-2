/** Supported UI languages. Keep in sync with Rust `SUPPORTED_LANGUAGES`. */
export type AppLanguage =
  | "en"
  | "es"
  | "ru"
  | "pt"
  | "de"
  | "fr"
  | "zh"
  | "ko"
  | "ja";

export type TextDirection = "ltr" | "rtl";

export type AppLanguageMeta = {
  code: AppLanguage;
  /** BCP 47 tag for `document.documentElement.lang`. */
  locale: string;
  /** Native-script display name (always shown as-is). */
  nativeName: string;
  /** Short English label used as secondary text in pickers. */
  englishName: string;
  direction: TextDirection;
  /**
   * When true, show the translation-quality disclaimer and report action.
   * English is the source language and does not need this notice.
   */
  showTranslationDisclaimer: boolean;
};

export const APP_LANGUAGES: readonly AppLanguageMeta[] = [
  {
    code: "en",
    locale: "en",
    nativeName: "English",
    englishName: "English",
    direction: "ltr",
    showTranslationDisclaimer: false,
  },
  {
    code: "es",
    locale: "es",
    nativeName: "Español",
    englishName: "Spanish",
    direction: "ltr",
    showTranslationDisclaimer: true,
  },
  {
    code: "ru",
    locale: "ru",
    nativeName: "Русский",
    englishName: "Russian",
    direction: "ltr",
    showTranslationDisclaimer: true,
  },
  {
    code: "pt",
    locale: "pt",
    nativeName: "Português",
    englishName: "Portuguese",
    direction: "ltr",
    showTranslationDisclaimer: true,
  },
  {
    code: "de",
    locale: "de",
    nativeName: "Deutsch",
    englishName: "German",
    direction: "ltr",
    showTranslationDisclaimer: true,
  },
  {
    code: "fr",
    locale: "fr",
    nativeName: "Français",
    englishName: "French",
    direction: "ltr",
    showTranslationDisclaimer: true,
  },
  {
    code: "zh",
    locale: "zh-Hans",
    nativeName: "简体中文",
    englishName: "Chinese (Simplified)",
    direction: "ltr",
    showTranslationDisclaimer: true,
  },
  {
    code: "ko",
    locale: "ko",
    nativeName: "한국어",
    englishName: "Korean",
    direction: "ltr",
    showTranslationDisclaimer: true,
  },
  {
    code: "ja",
    locale: "ja",
    nativeName: "日本語",
    englishName: "Japanese",
    direction: "ltr",
    showTranslationDisclaimer: true,
  },
] as const;

export const DEFAULT_APP_LANGUAGE: AppLanguage = "en";

const LANGUAGE_BY_CODE = new Map(
  APP_LANGUAGES.map((entry) => [entry.code, entry] as const),
);

export function isAppLanguage(value: unknown): value is AppLanguage {
  return (
    value === "en" ||
    value === "es" ||
    value === "ru" ||
    value === "pt" ||
    value === "de" ||
    value === "fr" ||
    value === "zh" ||
    value === "ko" ||
    value === "ja"
  );
}

export function getLanguageMeta(code: AppLanguage): AppLanguageMeta {
  switch (code) {
    case "en":
    case "es":
    case "ru":
    case "pt":
    case "de":
    case "fr":
    case "zh":
    case "ko":
    case "ja": {
      const meta = LANGUAGE_BY_CODE.get(code);
      if (!meta) {
        throw new Error(`Missing language metadata for '${code}'`);
      }
      return meta;
    }
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

/**
 * Normalize a stored/raw language value to a supported `AppLanguage`.
 * Blank and unknown values migrate to English.
 */
export function normalizeAppLanguage(value: unknown): AppLanguage {
  if (typeof value !== "string") {
    return DEFAULT_APP_LANGUAGE;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return DEFAULT_APP_LANGUAGE;
  }
  // Accept bare codes and locale tags like "es-MX" / "ru_RU".
  const primary = trimmed.split(/[-_]/)[0] ?? trimmed;
  if (isAppLanguage(primary)) {
    return primary;
  }
  return DEFAULT_APP_LANGUAGE;
}

/**
 * Map browser/system preferred languages to a supported app language.
 * Anything outside the supported set falls back to English.
 */
export function detectSystemAppLanguage(
  languages: readonly string[] = typeof navigator !== "undefined"
    ? navigator.languages?.length
      ? navigator.languages
      : [navigator.language]
    : [],
): AppLanguage {
  for (const entry of languages) {
    if (typeof entry !== "string" || !entry.trim()) {
      continue;
    }
    const primary = entry.trim().toLowerCase().split(/[-_]/)[0];
    if (primary === DEFAULT_APP_LANGUAGE) {
      continue;
    }
    if (isAppLanguage(primary)) {
      return primary;
    }
  }
  return DEFAULT_APP_LANGUAGE;
}

/**
 * Resolve the language to use after loading settings.
 * Incomplete onboarding may adopt the system locale; completed onboarding
 * always honors the persisted (normalized) choice.
 */
export function resolveInitialAppLanguage(options: {
  persistedLanguage: unknown;
  onboardingComplete: boolean;
  systemLanguages?: readonly string[];
}): AppLanguage {
  const persisted = normalizeAppLanguage(options.persistedLanguage);
  if (options.onboardingComplete) {
    return persisted;
  }
  // Incomplete onboarding: prefer the system language when the stored value
  // is still the English default (first install / migration).
  if (persisted === DEFAULT_APP_LANGUAGE) {
    return detectSystemAppLanguage(options.systemLanguages);
  }
  return persisted;
}

export function languageNeedsTranslationDisclaimer(
  code: AppLanguage,
): boolean {
  return getLanguageMeta(code).showTranslationDisclaimer;
}
