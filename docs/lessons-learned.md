# Lessons learned

Newest entry at the top. Written after a session via [[compounding-knowledge]].

### 2026-09-06 — Never place standalone helper binaries in `src-tauri/src/bin/`

- Context: adding utility / developer tooling binaries to a Tauri v2 project
- Mistake or surprise: Tauri CLI automatically scans `src-tauri/src/bin/` for binaries and bundles every discovered binary into desktop release packages (MSI, DMG, etc.). Without an explicit `default-run` in `Cargo.toml`, alphabetical ordering can cause a helper binary to hijack the primary application executable (`File Id="Path"` in WiX/MSI), completely omitting the real app and causing installed shortcuts to fail or crash on startup.
- What to do next time: keep dev-tools/scripts outside `src-tauri/src/bin/` (e.g. in `src-tauri/dev-tools/`), always specify `default-run = "texture-manager-2"` under `[package]` in `Cargo.toml`, gate helper binaries behind optional Cargo features with `required-features`, and explicitly set `mainBinaryName: "texture-manager-2"` in `tauri.conf.json`.
- Files involved: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/dev-tools/generate_android_icons.rs`, `package.json`

### 2026-09-06 — Knowledge base efficiency: strict on-demand consultation and single source of truth

- Context: agent latency, token bloat, and file read loops caused by vault fragmentation and mandatory pre-flight checklists
- Mistake or surprise: prompting agents to pre-read multiple vault files before starting work added 15k–25k tokens of context and 15–30s of turn latency on every task; redundant alwaysApply rules and duplicate skill trees compounded the problem
- What to do next time: enforce strict just-in-time doc lookups; keep rules concise and non-redundant; scope browser/node rules to UI globs; consolidate micro-notes into unified architecture guides; maintain skills directly in `.cursor/skills/`
- Files involved: `AGENTS.md`, `.cursor/rules/agent-knowledge-base.mdc`, `.cursor/rules/ironbee-devtools-use.mdc`, `.cursor/hooks/session-start.cjs`, `docs/app/architecture.md`, `.cursor/skills/`

### 2026-09-06 — Reviews only on major changes; no git checks by default

- Context: finishing agent tasks and pre-review workflows
- Mistake or surprise: running review checklists (e.g. Pre-Review QA) and git commands (`git status`, `git diff`) by default on minor or routine tasks adds unnecessary overhead and friction
- What to do next time: reserve review audits for the end of major changes only; execute git checks only if there is a specific need to inspect earlier versions or history, never by default
- Files involved: `AGENTS.md`, `docs/playbook.md`, `docs/processes/pre-review-qa.md`, `docs/processes/definition-of-done.md`, `.cursor/rules/agent-knowledge-base.mdc`

### 2026-09-04 — Project hooks need `.cjs`; do not trust sessionStart context alone

- Context: adding Cursor `sessionStart` hooks in a repo whose `package.json` has `"type": "module"`
- Mistake or surprise: plain `.js` hook scripts fail with `require is not defined`; even when hooks return valid JSON, `sessionStart` `additional_context` can be dropped by a Cursor IDE race. An automatic `stop` vault nudge also fired on trivial chats.
- What to do next time: use `node .cursor/hooks/*.cjs`; put durable guidance in `.cursor/rules/agent-knowledge-base.mdc` (alwaysApply); keep hooks to `sessionStart` env only; run [[compounding-knowledge]] only when the human asks or after meaningful feature work
- Files involved: `.cursor/hooks.json`, `.cursor/hooks/session-start.cjs`, `.cursor/rules/agent-knowledge-base.mdc`

### 2026-09-04 — Porter kind is `porterSplitter`

- Context: building or matching operation requests for Porter
- Mistake or surprise: UI tool id is `porter`, but `OperationKind` / request `type` is `porterSplitter`
- What to do next time: search `porterSplitter` in `domain/operations.ts` and App request builders before inventing a `porter` kind
- Files involved: `src/domain/operations.ts`, `src/App.tsx`, `src/domain/packInstaller.ts`

### 2026-09-04 — Mobile history: replaceState when leaving tool grid

- Context: Android back button / `popstate` while mobile shell grid is open
- Mistake or surprise: pushing a new tool history entry from an open grid makes Back reopen the grid
- What to do next time: when navigating from an open grid, `history.replaceState` the tool entry (see `navigateTool` in `App.tsx`)
- Files involved: `src/App.tsx`

### 2026-09-04 — Background opacity: debounce and skip applyResult

- Context: Settings background opacity slider fires many times per drag
- Mistake or surprise: applying every save response snaps the slider backward when responses reorder
- What to do next time: debounce (~180ms), keep optimistic opacity in a ref, call `runSettingsAction` with `applyResult: false`
- Files involved: `src/App.tsx`

### 2026-09-04 — `npm run tauri` fetches missing upscaler binaries

- Context: first desktop run / Upscaler work without prior fetch
- Mistake or surprise: Upscaler sidecars are not npm packages; builds need the fetch script
- What to do next time: rely on `tauri` script’s `--if-missing` fetch, or run `npm run fetch:upscaler-binaries` explicitly
- Files involved: `package.json`, `scripts/fetch-upscaler-binaries.mjs`

### 2026-09-04 — Release assets that are not installers

- Context: users grabbing GitHub Release files
- Mistake or surprise: `.sig`, desktop `latest.json`, and `android-latest.json` are updater metadata, not the app
- What to do next time: install `.msi` / `.dmg` / `.apk` only; point support answers at README Get started
- Files involved: `README.md`

### 2026-09-04 — Android path is Geode media, not Steam GD

- Context: onboarding / Settings path on Android
- Mistake or surprise: desktop Steam Geometry Dash path does not apply; tools need Geode’s media folder
- What to do next time: use / document `Android/media/com.geode.launcher/game/geode` and All files access
- Files involved: `README.md`, `src/utils/platform.ts`

### 2026-09-04 — android:dev is a PowerShell helper

- Context: running on device/emulator from non-Windows hosts
- Mistake or surprise: `npm run android:dev` invokes `scripts/android-dev.ps1` (Windows-oriented; needs PowerShell Core on macOS)
- What to do next time: do not assume a cross-platform npm android script; check the ps1 and adb reverse for ports 1420/1421
- Files involved: `package.json`, `scripts/android-dev.ps1`, `README.md`

### 2026-09-04 — i18n TS shape and Rust allowlist must both change

- Context: adding a language or settings language value
- Mistake or surprise: frontend catalogs alone are not enough; Rust `SUPPORTED_LANGUAGES` must stay in sync
- What to do next time: follow `src/i18n/CONTRIBUTING.md` end-to-end including `settings.rs` tests
- Files involved: `src/i18n/CONTRIBUTING.md`, `src-tauri/src/core/settings.rs`

### 2026-09-06 — Android reqwest TLS requires webpki roots or rustls-platform-verifier panics

- Context: Android in-app update checking and APK downloading
- Mistake or surprise: `reqwest` 0.13 with `rustls` uses `rustls-platform-verifier` by default, which panics on Android if not initialized with JVM/JNI handles. An unhandled panic in a Tauri async command aborts the Tokio task and drops the IPC response channel, leaving the frontend `invoke()` promise permanently hung.
- What to do next time: configure `reqwest::ClientBuilder` with `webpki-root-certs` via `tls_certs_only` and explicit timeouts, catch panics in command handlers, and add timeout safeguards to frontend updater calls.
- Files involved: `src-tauri/Cargo.toml`, `src-tauri/src/android_apk_update.rs`, `src/services/tauriUpdater.ts`, `src/App.tsx`

### YYYY-MM-DD — short title

- Context: when this applies
- Mistake or surprise
- What to do next time
- Files involved
