# Mobile and Android

## Shell

`isMobileShell()` — Android WebView UA or `?shell=mobile`. CSS/dataset `shell=mobile`. Dock + drawer + history: [[frontend-shell]].

## Storage access

| Layer | Path |
| --- | --- |
| Rust | `src-tauri/src/android_storage.rs` |
| Kotlin | `gen/android/.../StorageAccessPlugin.kt` |
| TS | `tauriAndroidStorage.ts`, `useAndroidStorageAccess.ts` |
| UI | `AndroidStorageAccessPanel.tsx`, `AndroidGeodeAccessBanner.tsx` |

`ready` ≈ All-files granted **and** Geode readable. Canonical game path:

`/storage/emulated/0/Android/media/com.geode.launcher/game`

(UI placeholder often shows `…/game/geode`.)

Desktop stubs: storage “granted”; Android-only pickers error off-device.

## Pickers and sandbox FS

`tauriPicker.ts`: Android SAF (`android_pick_folder` / `android_pick_file` / save + `android_commit_save`); desktop dialog plugin. Rust needs absolute FS paths — never `content://`.

`core/mobile_fs.rs` / `tauriMobileFs.ts`:

| API | Behavior |
| --- | --- |
| `import_user_path` | Desktop pass-through; Android copy → `{game-files}/imports/{stamp}-{name}` |
| `allocate_output_dir` | `{game-files}/outputs/{toolId}/{stamp}` |
| `export_directory_as_zip` | Zip an output tree (report rail / tools) |

## Dev

`npm run android:dev` → `scripts/android-dev.ps1` (Windows-oriented; AVD, `adb reverse` 1420/1421, GPU workarounds). Prefer over bare `tauri android dev`. `android:init` if `gen/android` missing.

## Capability surface

- Tools: 9 of 11 (no Upscaler, no Convert) — [[tools]]
- Executor rejects those kinds even if invoked
- No upscaler `externalBin` in `tauri.android.conf.json`
- No desktop updater plugin — see [[updater]]

## Pitfalls

- Without All-files, Geode may exist but fail readability → “Geode not found” style errors.
- Convert / vanilla Resources workflows unavailable.
- `gen/android` is generated — do not treat as hand-edited product source.
