# Invoke surface

Frontend wrappers: `src/services/`. Commands: `src-tauri/src/lib.rs`. Architecture: [[architecture]].

## Batch path

`tauriOperations.ts` → `get_phase_defaults` / `run_operation` / `cancel_operation` (see [[architecture]] section 3).

Used by: Splitter, Merger, Porter (`porterSplitter`), Randomizer, Convert, Upscaler, Glow Maker (run), Geode Buttons (run).

## Dedicated paths

| Service | Role | Architecture Reference |
| --- | --- | --- |
| `tauriSettings.ts` | Settings, GD dir, backgrounds, sprite index, `open_path_in_os` | [[architecture]] |
| `tauriPackInstaller.ts` | Discover/install, library, applied order, pack ops | [[architecture]] |
| `tauriIconEditor.ts` | Icon sheet edit | [[architecture]] |
| `tauriIconGlow.ts` / `tauriGlowMaker.ts` | Glow previews | [[architecture]] |
| `tauriGeodeButtons.ts` | Template index/preview + `get_game_files_layout` | [[architecture]] |
| `tauriParticleEditor.ts` | Particle open/save/texture/preview | [[architecture]] |
| `tauriPicker.ts` | Android SAF / desktop dialogs | [[architecture]] |
| `tauriMobileFs.ts` | Import, allocate output, zip export | [[architecture]] |
| `tauriAndroidStorage.ts` | All-files / Geode probe | [[architecture]] |
| `tauriUpdater.ts` | Desktop plugin / Android APK | [[architecture]] |
| `appBackgroundImages.ts` | Background PNG data URLs | [[architecture]] |
| `iconEditorHistory.ts` / `particleEditorHistory.ts` | In-memory undo | [[architecture]] |
| `particleConfig.ts` | Legacy re-export — prefer `domain/particleConfig` | [[architecture]] |

## Domain contracts

`src/domain/operations.ts`, `settings.ts`, `packInstaller.ts`, `packMetadataValidation.ts`, `particleConfig.ts`, `gdParticleEffects.ts`.

## Events

| Event | Listeners |
| --- | --- |
| `operation-progress` | Batch overlay in App |
| `pack-install-progress` | Pack Installer |
| `android-update-download-progress` | Android updater |
