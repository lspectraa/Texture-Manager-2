# Run, test, lint

Node **>= 24** (`.nvmrc` / `package.json` engines). Package manager: **npm**. Check: `npm run check:env`.

## Day-to-day

| Command | Purpose |
| --- | --- |
| `npm install` | Deps |
| `npm run fetch:upscaler-binaries` | Waifu2x / Real-ESRGAN sidecars (also via `npm run tauri` `--if-missing`) |
| `npm run tauri dev` | Desktop Tauri + Vite (`localhost:1420`) |
| `npm run android:init` | Once if `gen/android` missing |
| `npm run android:dev` | Android helper (`scripts/android-dev.ps1`; Windows-oriented) |
| `npm run build` | `tsc` + Vite production build |
| `npm test` / `npm run test:watch` | Vitest (`src/**/*.test.ts`) |
| `npm run sync:version` | `package.json` → Cargo / Tauri |
| `npm run tauri build` | Desktop installers (+ updater artifacts if signing env set) |
| `npm run phase0:verify` | `check:env` + `build` |
| `npm run setup:updater-signing` | Local updater key helper |

Also: `npm run dev` / `preview` (Vite only). VS Code / Cursor: **Tauri: Dev (Desktop)** in `.vscode/launch.json`.

Rust unit tests: `cargo test` from `src-tauri/` (many `#[cfg(test)]` modules). Not wired into npm or CI.

## Concurrent execution

Independent commands may run in the same turn as each other and as reads, searches, edits, or sub-agents, as long as they do not write the same file or share a mutating cwd. Examples: `npm test` with `cargo test` in `src-tauri/`; `npm run check:env` with `npm run build`. Full rule: [[parallel-operations]].

Stay serial when the next command needs the previous result (install before test, build before run). Do not overlap `npm install` with edits to `package.json`.

## Lint / format

No ESLint, Prettier, Clippy, or rustfmt scripts in this repo. Typecheck is `tsc` via `npm run build`.

## Release / CI

See [[publish]]. Env secret **names**: [[config-env]].
