# Adding localization keys and languages

Texture Manager 2 uses `i18next` + `react-i18next` with typed catalogs under `src/i18n/`.

## Supported languages

Registered in [`languages.ts`](./languages.ts) as `AppLanguage = "en" | "es" | "ru" | "pt" | "de" | "fr" | "zh" | "ko" | "ja"`.

Each language entry includes:

- `nativeName` — always shown in the language picker (do not translate)
- `locale` / `direction` — applied to `document.documentElement`
- `showTranslationDisclaimer` — when `true`, Home and Settings show the quality notice automatically

Rust allowlist in `src-tauri/src/core/settings.rs` must stay in sync.

## Add or change a string

1. Add the key to the matching English namespace file under `src/i18n/locales/en/` (`common`, `navigation`, `onboarding`, `settings`, `tools`, `iconEditor`, `reports`, `errors`).
2. Copy the same key into every other locale directory under `src/i18n/locales/` with translated text.
3. TypeScript enforces that each non-English locale matches the English key shape via `AppLocaleResources`.
4. In components, use `useTranslation("namespace")` and `t("key", { var })`. Prefer plural keys (`key_one` / `key_other`) over string concatenation.

Leave product names, paths, filenames, operation IDs, plist/frame identifiers, version strings, and backend diagnostic bodies untranslated.

## Add a new language

1. Extend `AppLanguage` and `APP_LANGUAGES` in `languages.ts` (set `showTranslationDisclaimer: true` for non-English).
2. Add `src/i18n/locales/<code>/` catalogs typed as `AppLocaleResources`.
3. Register the locale in `src/i18n/index.ts` `resources`.
4. Add the code to Rust `SUPPORTED_LANGUAGES` and tests in `settings.rs`.
5. The onboarding/settings pickers and disclaimers pick up the registry automatically.
