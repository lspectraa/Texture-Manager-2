# Layout

Single app (not a monorepo). One npm package + one Rust crate. No `packages/`, `apps/`, or workspace tooling.

## Repo tree

```text
src/                 React UI, tools, i18n, services, mobile shell
src-tauri/           Rust backend, Tauri config, capabilities, upscaler resources, gen/android
scripts/             Prerequisites, version sync, Android helpers, updater key helper
public/              Static assets (icon-editor backgrounds, icons)
.github/workflows/   Publish / release only ([[publish]])
docs/                Agent vault + README screenshots
branding/            Product icon SVG
.vscode/             launch.json / tasks.json
```

## Frontend (`src/`)

| Path | Owns |
| --- | --- |
| `main.tsx` | Theme, settings hydrate, i18n, shell dataset, mount `App` |
| `App.tsx` | Shell state: tool selection, batch `runOperation`, progress/report, onboarding, mobile history |
| `components/` | Home, sidebar, onboarding, About, update banner, tool panels, mobile dock/drawer |
| `components/tools/` | One panel per tool + Pack Installer subpanels |
| `config/` | `toolNavigation`, `appMeta`, backgrounds, convert version map |
| `domain/` | TS contracts: operations, settings, pack installer, particles |
| `services/` | Tauri `invoke` wrappers + in-memory editor history |
| `hooks/` | Shell transition, swipe, Android storage, icon glow, pack drag, pinch zoom |
| `utils/` | Platform/shell, theme, path redaction, splash, report CSV |
| `i18n/` | i18next setup + locale catalogs (`src/i18n/CONTRIBUTING.md`) |

## Backend (`src-tauri/`)

- Commands registered in `src/lib.rs` (`generate_handler!`).
- Core modules under `src/core/` (operations, executor, settings, pack installer, icon/particle/glow, upscaler, mobile_fs, …).
- Config: `tauri.conf.json`, `tauri.android.conf.json`, `capabilities/{default,desktop,mobile}.json`.

## Shell modes

- **Desktop** — `AppSidebar` + main panel + optional right rail.
- **Mobile** — `MobileBottomDock` + drawer; `isMobileShell()` from Android UA or `?shell=mobile` (`src/utils/platform.ts`).

Local UI keys: `texture-manager-2.nav-collapsed`, `texture-manager-2.report-collapsed`.

Entrypoints: `src/main.tsx` → `src/App.tsx`; tool list `src/config/toolNavigation.ts`; invoke registry `src-tauri/src/lib.rs`; batch dispatch `src-tauri/src/core/executor.rs`.

Invoke mapping: [[invoke-surface]]. How systems work: [[overview]]. Shell behavior: [[frontend-shell]].
