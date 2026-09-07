# Purpose and flows

**Texture Manager 2** (`com.spectra.texturemanager2`) is Geometry Dash texture tooling: edit icons, split/merge/port sheets, glow, Geode buttons, particles, pack install/library, randomize, convert, and (desktop) AI upscale.

Stack: Tauri 2 · React 19 · TypeScript · Vite · Rust. Version lives in root `package.json` (synced into Tauri/Cargo). Built by Spectra. GPL-3.0-or-later; upscaler third-party binaries keep their own licenses (`src-tauri/resources/upscaler/NOTICE`).

## Who uses it

- Creators editing GD / Geode texture assets on Windows, macOS, or Android.
- Devs: see [[run-test-lint]].

## Tools (11 desktop / 9 Android)

Nav source of truth: `src/config/toolNavigation.ts`.

| Section | Tools |
| --- | --- |
| Design | Icon Editor (featured), Glow Maker, Geode Buttons, Particle Editor |
| Sheets | Splitter, Merger, Porter, Upscaler |
| Batch | Randomizer, Convert to New Version, Texture Pack Installer |

Desktop-only (omitted on mobile shell): **Upscaler** (Vulkan sidecars), **Convert to New Version** (game `Resources`). See [[001-desktop-only-tools]].

## Core user flows

1. **First run** — language, theme, (Android) All files access, Geometry Dash / Geode path. Mobile requires onboarding version 2; desktop version 1 ([[005-mobile-onboarding-version]]).
2. **Home → tool** — desktop sidebar or mobile dock/grid; set folders; run.
3. **Self-contained tools** — Icon Editor, Particle Editor, Pack Installer use dedicated Tauri invokes (not the shared operation rail). Geode Buttons is hybrid: panel owns preview/index; generation still uses shared Run → `run_operation`.
4. **Batch operation** — App builds the request → `run_operation` → progress overlay → report rail (issues CSV; Android can zip-export output). Porter’s operation kind is `porterSplitter`, not `porter`.
5. **Settings / About** — theme, language, concurrency, GD path, backgrounds, updates. Desktop About is a copyright dialog; mobile About is a tool page (both use `AboutContent`).
6. **Updates** — desktop Tauri updater + `latest.json`; Android APK + `android-latest.json` ([[002-dual-updater-channels]]).

## Platform notes

- Desktop: Steam GD path recommended; Geode + texture-loader for Pack Installer drop-in.
- Android: Geode media folder (`Android/media/com.geode.launcher/game/geode`); grant storage when prompted.
- Browser preview: `?shell=mobile`; fake update with `?simulateUpdate=1` or `localStorage.tmSimulateUpdate=1`.

Screenshots: `docs/screenshots/01-home.png`, `02-icon-editor.png`, `03-glow-maker.png`, `04-settings.png` (captions in root README).

## How systems work

See the consolidated architecture and internal systems guide: [[architecture]].
