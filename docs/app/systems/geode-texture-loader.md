# Geode and texture-loader

Integration points used by Pack Installer, Home shortcuts, and Geode Buttons.

## Paths on disk

| Concern | Where |
| --- | --- |
| Packs root | `{GD}/geode/config/geode.texture-loader/packs` via `GameFilesLayout::texture_loader_packs()` |
| Mods | `{GD}/geode/mods` |
| Geode config | `{GD}/geode/config` |
| Applied order | Save dir `…/geode/mods/geode.texture-loader/saved.json` — see [[pack-installer]] |
| Android game media | `…/Android/media/com.geode.launcher/game` |
| Android save | `…/Android/media/com.geode.launcher/save` |

Game install ≠ save dir. Installing packs does not by itself update applied order; the Pack Installer applied rail writes `saved.json`.

## Detection

- Desktop: Steam / registry-style walk (`game_files`)
- Android: `detect_android_geometry_dash_dir` / `probe_android_geode_paths` after All-files access

Soft launch without GD: layout still boots; tools that need Geode fail until path is set.

## Geode Buttons

Uses layout + Resources / Geode media for BlankSheet templates. Split-cache helps desktop; Android reads media directly. Details: [[editors]].

## Texture-loader install rules

When discovering Geode config mirrors, the installer **does not** install the `geode.texture-loader` config directory as a unit — only packs under it. Mods are separate `.geode` files.
