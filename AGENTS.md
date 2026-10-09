# AGENTS.md — Texture Manager 2

Primary guide for every agent in this repo. Skills load from `skills/<name>/SKILL.md`. Do not pre-read the vault under `docs/`.

## Hard limits

1. No PR open, merge, or approve.
2. No fake tests. No secrets in files or chat.
3. Stop every server, watcher, or app this session started before finishing (`npm run dev`, `npm run tauri dev`, and anything else you started).
4. Reviews only after a major change or when asked. Do not print QA or DoD tables on routine work.
5. No default git checks. Use `git status` / `diff` / `log` only when comparing to an earlier version.
6. No pre-flight reading loops. For targeted work, go straight to code.
7. Docs are just-in-time. Read one specific note only when a subsystem is unfamiliar.
8. Independent tool calls run in parallel: searches, reads, edits, shell commands, and sub-agents, when files do not conflict.
9. An ADR is incomplete until every affected site has a short comment pointing at `docs/adrs/NNN-slug.md`.
10. If you delete application logic, report it before you finish as `## WARNING` plus a `---` rule. Do not silently remove branches, handlers, or helpers. See `docs/rules/report-deleted-logic.md`.

## Technology stack

- **Frontend**: React 18, TypeScript 5, Vite 6, Tailwind CSS (`.tm-*` token conventions), i18next, Lucide icons.
- **Native / Desktop**: Tauri 2, Rust (2021 edition), Win32/macOS/Linux desktop support located in `src-tauri/`.
- **Mobile**: Android shell support via Tauri mobile (`gen/android`).
- **Runtime & Environment**: Node.js >= 24 (`.nvmrc`), npm.

## Commands

Fill from `docs/app/run-test-lint.md` (the durable copy):

| Action | Command |
| --- | --- |
| Install | `npm install` |
| Test | `npm test` (Vitest, `src/**/*.test.ts`); `cargo test` in `src-tauri/` when Rust changed |
| Build / typecheck | `npm run build` |
| Dev / run | `npm run tauri dev` (desktop Tauri + Vite, `localhost:1420`) |

Also: `npm run fetch:upscaler-binaries`, `npm run check:env`.

## Workflow

1. Align on intent.
2. Consult docs on-demand only. Skip for familiar or targeted tasks. Unfamiliar subsystems: one note, usually `docs/app/architecture.md` (IPC: `docs/app/invoke-surface.md`).
3. Implement in small steps.
4. Update docs only if contracts or behavior changed.
5. Verify runtime or tests when the change needs it (`docs/app/verify.md`). Independent verify commands may run together.
6. Clean up processes you started.
7. Finish concisely. Major-change review only (`docs/processes/pre-review-qa.md`).

## Concurrency

Console commands may run with each other and with reads, searches, edits, and sub-agents when they do not share a file or depend on each other's artifacts. Example: `npm test` with `cargo test`. See `docs/rules/parallel-operations.md`.

## Skills

| Skill | Path |
|---|---|
| agent-knowledge-base | `skills/agent-knowledge-base/SKILL.md` |
| concurrent-subagents | `skills/concurrent-subagents/SKILL.md` |
| docs-and-mermaid | `skills/docs-and-mermaid/SKILL.md` |
| compounding-knowledge | `skills/compounding-knowledge/SKILL.md` |
| living-adr | `skills/living-adr/SKILL.md` |
| agent-playwright | `skills/agent-playwright/SKILL.md` |
| api-probe | `skills/api-probe/SKILL.md` |

## Vault

`docs/`. Map: `docs/index.md`. Systems: `docs/app/architecture.md`.

Texture Manager 2 notes with no canonical counterpart: `docs/app/purpose-and-flows.md`, `layout.md`, `tools.md`, `invoke-surface.md`, `config-env.md`, `publish.md`, `docs/screenshots/`. Pitfalls: `docs/lessons-learned.md`.
