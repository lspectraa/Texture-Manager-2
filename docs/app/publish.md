# Publish and release

Source of truth: `.github/workflows/publish.yml`. Triggers: push tag `v*`, or `workflow_dispatch`.

## Jobs

| Job | Runner | Output |
| --- | --- | --- |
| `publish-tauri` | Windows + macOS matrix | MSI; DMG arm64; DMG x64; draft GitHub release; desktop updater JSON |
| `publish-android` | Ubuntu | arm64 APK + `android-latest.json` |

Desktop job runs `npm ci` → `sync:version` → `fetch-upscaler-binaries` → `tauri-apps/tauri-action` with `includeUpdaterJson: true`.

Android job builds with `npx tauri android build` (skips the npm `tauri` wrapper that auto-fetches upscaler binaries — intentional; Android has no upscaler sidecars).

## Version bump local sequence

1. Bump `"version"` in root `package.json`.
2. `npm run sync:version` (also runs on Tauri build).
3. Tag `vX.Y.Z` and push, or run the workflow manually.
4. Human publishes the draft release after checking artifacts.

## Signing notes (names only)

- Desktop updater: `TAURI_SIGNING_PRIVATE_KEY`. Do **not** set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub — empty secrets are rejected, and a non-empty password breaks a passwordless key.
- Tagged Android publish requires `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEYSTORE_PASSWORD`. Manual dispatch may fall back to debug-signed APK when those are absent.

## User-facing installers

Ship `.msi` / `.dmg` / `.apk`. Do not tell users to install `.sig`, `latest.json`, or `android-latest.json`.
