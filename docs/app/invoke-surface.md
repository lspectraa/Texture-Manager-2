# Invoke surface

Frontend wrappers: `src/services/`. Commands: `src-tauri/src/lib.rs`. Systems: [[overview]].

## Batch path

`tauriOperations.ts` → `get_phase_defaults` / `run_operation` / `cancel_operation` → [[batch-pipeline]].

Used by: Splitter, Merger, Porter (`porterSplitter`), Randomizer, Convert, Upscaler, Glow Maker (run), Geode Buttons (run).

## Dedicated paths

| Service | Role | Deep dive |
| --- | --- | --- |
| `tauriSettings.ts` | Settings, GD dir, backgrounds, sprite index, `open_path_in_os` | [[game-files-and-settings]] |
| `tauriPackInstaller.ts` | Discover/install, library, applied order, pack ops | [[pack-installer]] |
| `tauriIconEditor.ts` | Icon sheet edit | [[editors]] |
| `tauriIconGlow.ts` / `tauriGlowMaker.ts` | Glow previews | [[editors]] |
| `tauriGeodeButtons.ts` | Template index/preview + `get_game_files_layout` | [[editors]], [[geode-texture-loader]] |
| `tauriParticleEditor.ts` | Particle open/save/texture/preview | [[editors]] |
| `tauriPicker.ts` | Android SAF / desktop dialogs | [[mobile-android]] |
| `tauriMobileFs.ts` | Import, allocate output, zip export | [[mobile-android]] |
| `tauriAndroidStorage.ts` | All-files / Geode probe | [[mobile-android]] |
| `tauriUpdater.ts` | Desktop plugin / Android APK | [[updater]] |
| `appBackgroundImages.ts` | Background PNG data URLs | [[game-files-and-settings]] |
| `iconEditorHistory.ts` / `particleEditorHistory.ts` | In-memory undo | [[editors]] |
| `particleConfig.ts` | Legacy re-export — prefer `domain/particleConfig` | [[editors]] |

## Domain contracts

`src/domain/operations.ts`, `settings.ts`, `packInstaller.ts`, `packMetadataValidation.ts`, `particleConfig.ts`, `gdParticleEffects.ts`.

## Events

| Event | Listeners |
| --- | --- |
| `operation-progress` | Batch overlay in App |
| `pack-install-progress` | Pack Installer |
| `android-update-download-progress` | Android updater |
