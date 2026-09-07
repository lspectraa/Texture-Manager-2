# Lessons learned

Newest entry at the top. Written after a session via [[compounding-knowledge]].

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

### YYYY-MM-DD — short title

- Context: when this applies
- Mistake or surprise
- What to do next time
- Files involved
