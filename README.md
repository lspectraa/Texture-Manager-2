<p align="center">
  <img src="branding/tpm2%20icon.svg" alt="Texture Manager 2" width="128" />
</p>

# Texture Manager 2

**Geometry Dash texture tooling** — edit icons, split and merge sheets, add glow, build Geode-style buttons, tweak particles, convert and install packs, upscale textures, and more.

Built by [Spectra](https://www.youtube.com/c/spectraa) · [Discord](https://discord.gg/YFXhJZJCv6) · [GitHub](https://github.com/lspectraa/Texture-Manager-2)

Open beta started at **v0.1.0** (Windows, with a first macOS build). The app now also ships **Android**, a full **Texture Pack Installer** (library + applied-pack order), an AI **Upscaler**, Geometry Dash **2.0** conversion, and a much deeper Icon / Particle / Glow workflow.

---

<p align="center">
  <img src="docs/screenshots/01-home.png" alt="Texture Manager 2 home screen" width="900" />
</p>

<p align="center">
  <img src="docs/screenshots/02-icon-editor.png" alt="Icon Editor workspace" width="900" />
</p>

---

## Features

| Area | Tools |
| --- | --- |
| **Design & Effects** | Icon Editor · Glow Maker · Geode Buttons · Particle Editor |
| **Gamesheets** | Splitter · Merger · Porter · Upscaler *(desktop)* |
| **Pack tools** | Randomizer · Convert to New Version *(desktop)* · Texture Pack Installer |

**11 tools** on desktop. Android includes 9 of them — Upscaler and Convert to New Version stay desktop-only (Vulkan sidecars and the game `Resources` folder).

### Design & Effects

- **Icon Editor** — Swap parts, colors, and placement on an icon sheet. Start a new sheet from imported sprites, generate glow from a component (instead of the sheet’s glow sprite), save a copy anywhere, and download a PNG preview.
- **Glow Maker** — Outline glow with thickness and alpha controls, optional rainbow / composite layers, and a live preview (random game icon or a custom sheet).
- **Create Geode Buttons** — Build the Geode menu-button gamesheet from BlankSheet (or your own), with per-family colors and HSV shifts.
- **Particle Editor** — Open Geometry Dash `.plist` effects, copy a built-in GD effect, and edit emitter / motion / look / texture with a live preview (play, pause, icon path, custom icon).

### Gamesheets

- **Splitter** — Cut a gamesheet into individual sprites. Optionally skip the icons folder.
- **Merger** — Pack sprites back into a gamesheet. Can include images that are not listed in the plist.
- **Porter** — Make HD, UHD, or low-graphics versions of a sheet.
- **Upscaler** *(desktop)* — Sharpen and enlarge to HD or UHD. Gamesheets use **Waifu2x**; icons use **Real-ESRGAN**. Optionally copy missing sprites from the newest game afterward. Repeated sprites can be reused from a sprite index instead of running AI again.

### Pack tools

- **Randomizer** — Shuffle icons. Save the shuffle code to get the same mix later.
- **Convert to New Version** *(desktop)* — Add missing sprites so a pack works on the newest game. Supports converting from **2.0**, **2.11**, and **2.2**.
- **Texture Pack Installer** — Install packs from a folder or zip (plus Geode configs and `.geode` mods), create a new pack, and manage a **pack library**: edit `pack.json` / `pack.png`, convert / port / split an installed pack, and reorder **applied packs** in-game.

### App-wide

- First-run onboarding for language, light/dark theme, and Geometry Dash path (Android also asks for All files access)
- Optional Geometry Dash background art, plus custom backgrounds (stored as grayscale)
- UI in English, Spanish, Russian, Portuguese, German, French, Simplified Chinese, Korean, Japanese, and Vietnamese
- Progress reporting with warnings and errors you can export
- Automatic updates from GitHub Releases
- Mobile-friendly shell on Android

<p align="center">
  <img src="docs/screenshots/03-glow-maker.png" alt="Glow Maker tool" width="900" />
</p>

<p align="center">
  <img src="docs/screenshots/04-settings.png" alt="Settings panel" width="900" />
</p>

---

## Get started (app users)

### Platforms

| Platform | Package | Notes |
| --- | --- | --- |
| **Windows** x64 | `.msi` | Primary desktop install |
| **macOS** Apple Silicon / Intel | `.dmg` | Separate builds per architecture |
| **Android** | `.apk` (arm64) | Sideload from Releases; mobile shell. Tagged CI publishes require Play/release signing secrets. |

### Requirements

- **Geometry Dash** installed via Steam (recommended on desktop for auto-detect and game file tools)
- **Geode** + **texture-loader** if you want the Pack Installer to drop packs into the game
- On Android, grant storage / All files access when prompted so pack and sheet tools can reach Geode’s folder (`Android/media/com.geode.launcher/game/geode`)

### Install (desktop)

1. Open the latest [GitHub Release](https://github.com/lspectraa/Texture-Manager-2/releases/latest).
2. Download the installer for your OS (Windows **`.msi`**, macOS **`.dmg`**, or Android **`.apk`** — not the `.sig`, desktop `latest.json`, or `android-latest.json`).
3. Install and launch **Texture Manager 2** (on Android, enable install from unknown sources / the browser if prompted).
4. Complete onboarding:
   - Choose language
   - Pick light or dark theme
   - On Android, grant All files access
   - Confirm or browse to your Geometry Dash folder (desktop) or Geode media folder (Android)

After that, use **Home** (or the mobile dock) to open a tool, set input/output folders, and run the operation.

### Updates

Installed desktop copies can check for updates from Settings (**Check for updates**) or via the update banner when a newer release is published (Tauri updater plugin + release `latest.json`). Finish any running operation before installing an update — the app must restart to apply it.

On Android, in-app APK updates (once installed) use release `android-latest.json` rather than the desktop updater plugin.

---

## Get started (developers)

Stack: **Tauri 2** · **React 19** · **TypeScript** · **Vite 7** · **Rust**

### Prerequisites

| Tool | Notes |
| --- | --- |
| **Node.js 24+** | See `.nvmrc` |
| **npm** | Comes with Node |
| **Rust** (rustup) | Stable toolchain |
| **Windows / macOS** | Desktop bundles (MSI / DMG) |
| **Android SDK** (optional) | For `npm run android:dev` |

Check what’s installed:

```bash
npm run check:env
```

### Setup

```bash
git clone https://github.com/lspectraa/Texture-Manager-2.git
cd Texture-Manager-2
npm install
npm run fetch:upscaler-binaries   # Waifu2x / Real-ESRGAN sidecars for Upscaler
```

On macOS you also need **Xcode Command Line Tools** (`xcode-select --install`). Full Xcode is only required for signed App Store / notarized release builds.

### Develop (desktop)

```bash
npm run tauri dev
```

This starts the Vite frontend and opens the native Tauri window.

### Develop (Android)

```bash
npm run android:init   # once, if gen/android is missing
npm run android:dev    # currently Windows-oriented helper script; needs Android SDK + PowerShell Core on macOS
```

Use `?shell=mobile` in the browser when iterating on the mobile UI without a device. Add `&simulateUpdate=1` (or set `localStorage.tmSimulateUpdate = "1"`) to fake an available update banner — install only runs a fake download.

### Common scripts

| Command | Purpose |
| --- | --- |
| `npm run tauri dev` | Run the desktop app in development |
| `npm run android:dev` | Run on Android (device/emulator) |
| `npm run build` | Typecheck + Vite production build |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright e2e tests |
| `npm run sync:version` | Copy `package.json` version → Cargo / Tauri config |
| `npm run tauri build` | Release desktop installers (+ updater signature if signing env is set) |
| `npm run fetch:upscaler-binaries` | Download Waifu2x / Real-ESRGAN ncnn sidecars and models |

### Versioning

**Single source of truth:** `package.json` → `"version"`.

Bump that field, then run `npm run sync:version` (also runs automatically on Tauri build).

### Release builds (local)

Updater artifacts need your private signing key:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content "$env:USERPROFILE\.tauri\texture-manager-2.key" -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run tauri build
```

CI publishes draft desktop + Android releases via `.github/workflows/publish.yml` when you push a `v*` tag or run the workflow manually (Windows MSI, macOS DMG for arm64 and x64, Android arm64 APK). Desktop uploads include updater `latest.json`; Android also uploads `android-latest.json` (version, APK URL, SHA-256) for in-app APK updates.

Tagged Android publishes **require** the signing secrets below (the job fails without them). Manual `workflow_dispatch` runs may omit them and fall back to a debug-signed APK for sideload testing:

| Secret | Purpose |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.jks` / `.keystore` |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEYSTORE_PASSWORD` | Store + key password (same value in CI) |

### Project layout

```text
src/                 React UI, tools, i18n, services, mobile shell
src-tauri/           Rust backend, Tauri config, capabilities, upscaler resources
scripts/             Prerequisites, version sync, Android helpers, updater key helper
.github/workflows/   Publish / release pipeline
docs/screenshots/    README screenshots
```

---

## Community

- [YouTube — Spectra](https://www.youtube.com/c/spectraa)
- [Discord](https://discord.gg/YFXhJZJCv6)
- [Issues](https://github.com/lspectraa/Texture-Manager-2/issues)

---

## License

This project is licensed under the [GNU General Public License v3.0 or later](LICENSE).

You can redistribute it and/or modify it under the terms of the GPL. See `LICENSE` for the full text.

The AI upscaler bundles third-party inference binaries and model weights. Those stay under their own licenses; Texture Manager 2 does not relicense them. Full copyright notices and license texts ship with the app in `src-tauri/resources/upscaler/NOTICE` (also linked from About):

- **Waifu2x** (nagadomi) and **waifu2x-ncnn-vulkan** (nihui) — MIT
- **Real-ESRGAN** / `realesr-animevideov3` (Xintao Wang) — BSD-3-Clause
- **Real-ESRGAN ncnn Vulkan** (Xintao Wang / nihui) — MIT
- **ncnn** (Tencent) — BSD-3-Clause

© Spectra 2026
