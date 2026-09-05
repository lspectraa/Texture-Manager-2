# Game files and settings

## Game files layout

Core: `src-tauri/src/core/game_files/` (`mod.rs`, `geode_user_data.rs`, `sync.rs`).  
DTO: `get_game_files_layout` (also used by Geode Buttons / Home shortcuts).

| Field | Meaning |
| --- | --- |
| `root` | App data: `~/TextureManager2/game-files` (Android: app files; override `TM_GAME_FILES_DIR`) |
| `geometry_dash_dir` | Steam GD install **or** Android Geode `game/` |
| `resources` / `current` | Vanilla `Resources` (macOS may nest under `.app`) |
| `geode_*` | `{GD}/geode/{resources,unzipped,config,mods}` |
| `texture_loader_packs` | `…/geode.texture-loader/packs` |
| `current_split` | `{root}/split-cache` |
| `legacy` | `{root}/legacy/{version}` gamesheets |
| `geometry_dash_save_dir` | User save tree (texture-loader `saved.json`) |

**Desktop “found”:** looks like a GD install (exe/dlls + Resources).  
**Android “found”:** readable Geode media tree (Resources often inaccessible).

Bootstrap soft-fails when GD is missing (`_unresolved_geometry_dash`). UI placeholders: `src/utils/platform.ts` → `geometryDashPathPlaceholder`.

`open_path_in_os` only allows paths under game-files root, GD install, Geode config/mods/packs, and GD save dir (`safe_fs`).

## Settings

| Piece | Path |
| --- | --- |
| Persist | `{game-files-root}/settings.json` via `core/settings.rs` |
| Frontend | `domain/settings.ts`, `tauriSettings.ts`, `SettingsToolPanel.tsx` |

Fields: `geometryDashDir`, `defaultSheetConcurrency` (1–64, default 5), `theme`, `language`, `appBackground`, `appBackgroundOpacity`, `onboardingVersion`.

Custom backgrounds: `{root}/custom-backgrounds/custom_*.png`. Commands: add/remove/list via settings + `app_background_png_data_url`.

Onboarding versions: desktop `1`, mobile `2` (`requiredOnboardingVersion`).

## Sprite index

`core/sprite_index.rs` → `{root}/sprite-index.json` (v3). Maps trimmed-sprite hashes to sheet/frame/tier for upscaler cache hits. Regenerate from Settings → `regenerate_sprite_index`.
