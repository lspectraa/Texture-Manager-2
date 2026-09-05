# Config and environment

Names only — never put secret values in vault notes.

## App identity

| Field | Value |
| --- | --- |
| productName / window title | Texture Manager 2 |
| identifier | `com.spectra.texturemanager2` |
| version SoT | `package.json` → synced into Tauri/Cargo |
| Dev URL | `http://localhost:1420` |

## Config files

`package.json`, `.nvmrc`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `src-tauri/tauri.conf.json`, `src-tauri/tauri.android.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/{default,desktop,mobile}.json`.

No committed `.env.example`. `.gitignore` ignores `.env`, `.env.*`, `*.key`, keystores.

## Env var names

| Name | Context |
| --- | --- |
| `TAURI_ENV_PLATFORM`, `TAURI_ENV_DEBUG`, `TAURI_DEV_HOST` | Vite / Tauri |
| `VITE_*` | Vite `envPrefix` (no committed app usages found) |
| `TAURI_SIGNING_PRIVATE_KEY` | Local + GitHub secret (desktop updater) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Local docs; empty password — do not store empty value as a GitHub secret |
| `ANDROID_HOME`, `NDK_HOME`, `ANDROID_NDK_HOME` | Android / CI |
| `ANDROID_AVD`, `ANDROID_EMULATOR_GPU` | `android-dev.ps1` |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD` | Tagged Android publish |
| `GITHUB_TOKEN` | Actions built-in |
| `CI` | Android build / Actions environment |

## Updater endpoints

- Desktop: Tauri updater plugin + release `latest.json`.
- Android: in-app APK updates via `android-latest.json` (version, APK URL, SHA-256).

## Bundled sidecars / resources

`externalBin`: `waifu2x-ncnn-vulkan`, `realesrgan-ncnn-vulkan`. Resources: `resources/upscaler/**/*`, `resources/preview-icons/**/*`. Android conf clears `externalBin` and skips updater artifacts.

## i18n

Languages: en, es, ru, pt, de, fr, zh, ko, ja, vi. TS catalogs under `src/i18n/`; Rust allowlist in `src-tauri/src/core/settings.rs` must match. Contributor steps: `src/i18n/CONTRIBUTING.md`.
