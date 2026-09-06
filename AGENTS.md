# AGENTS.md — Texture Manager 2

Welcome to Texture Manager 2. This repository maintains a living agent knowledge base under `docs/`. All AI agents operating in this repository must align with the knowledge base, adhere to repository hard limits, and follow the workflows defined below.

---

## 1. Knowledge Base Entry Points

The primary source of truth for repository structure, architecture, workflows, and rules is the `docs/` vault:

- **[Knowledge Base Index](docs/index.md)** (`docs/index.md`) — Main vault directory.
- **[Playbook](docs/playbook.md)** (`docs/playbook.md`) — **Read this after IDE plan approval.** Core execution workflow.
- **[Definition of Done](docs/processes/definition-of-done.md)** (`docs/processes/definition-of-done.md`) — **Keep open until session completion.** Verification checklist.
- **[Pre-Review QA](docs/processes/pre-review-qa.md)** (`docs/processes/pre-review-qa.md`) — Audit checklist before the human opens a pull request.
- **[Verification Guide](docs/app/verify.md)** (`docs/app/verify.md`) — Protocol for verifying UI and runtime changes against the running app.
- **[Run, Test, Lint](docs/app/run-test-lint.md)** (`docs/app/run-test-lint.md`) — Day-to-day commands, build instructions, and testing.

### Architecture & System Maps
- **[Systems Overview](docs/app/systems/overview.md)** (`docs/app/systems/overview.md`) — Core architecture and component map.
- **[Purpose & Flows](docs/app/purpose-and-flows.md)** (`docs/app/purpose-and-flows.md`) — App purpose, user journeys, and screens.
- **[Tools Catalog](docs/app/tools.md)** (`docs/app/tools.md`) — Breakdown of all built-in tools (Icon Editor, Glow Maker, Upscaler, etc.).
- **[Invoke Surface](docs/app/invoke-surface.md)** (`docs/app/invoke-surface.md`) — IPC contract between frontend and Rust/Tauri.
- **[Config & Environment](docs/app/config-env.md)** (`docs/app/config-env.md`) — Secrets and environment configuration.
- **[Publish & Release](docs/app/publish.md)** (`docs/app/publish.md`) — Release workflows and artifacts.
- **[Lessons Learned](docs/lessons-learned.md)** (`docs/lessons-learned.md`) — Past pitfalls, historical context, and tripwires.
- **[Known Gaps](docs/app/gaps.md)** (`docs/app/gaps.md`) — Known architectural gaps and nuances.

---

## 2. Hard Limits & Mandatory Rules

These rules are non-negotiable across all sessions:

1. **No PR Operations**: Do not open, merge, or approve pull requests. The human will review diffs and handle PRs.
2. **No Fake Tests**: Do not invent passing tests that skip the real path. Existing tests must pass, and new behavior must be covered when touching tested areas.
3. **No Secrets**: Never hardcode secrets, credentials, tokens, or environment-specific values in files or output them in chat.
4. **Stop All Processes Before Finishing**: Stop all servers, dev servers (`npm run dev`, `npm run tauri dev`), background processes, and application runs started during the session before claiming done.
5. **Satisfy Definition of Done**: Never declare a task complete while items in [Definition of Done](docs/processes/definition-of-done.md) that you can satisfy remain unchecked.
6. **Preserve Knowledge Base Quality**: Prefer editing existing notes over creating duplicate files. ADRs under `docs/adrs/` are optional background unless explicitly requested.

---

## 3. Technology Stack

- **Frontend**: React 18, TypeScript 5, Vite 6, Tailwind CSS (`.tm-*` token conventions), i18next, Lucide icons.
- **Native / Desktop**: Tauri 2, Rust (2021 edition), Win32/macOS/Linux desktop support located in `src-tauri/`.
- **Mobile**: Android shell support via Tauri mobile (`gen/android`).
- **Runtime & Environment**: Node.js >= 24 (`.nvmrc`), npm.

---

## 4. Key Commands Quick Reference

| Action | Command | Scope |
| --- | --- | --- |
| Install dependencies | `npm install` | Workspace root |
| Run frontend unit tests | `npm test` | Vitest (`src/**/*.test.ts`) |
| Run Rust unit tests | `cargo test` | Inside `src-tauri/` directory |
| Typecheck & production build | `npm run build` | `tsc` + Vite production bundle |
| Launch desktop app dev | `npm run tauri dev` | Desktop Tauri + Vite (`localhost:1420`) |
| Fetch upscaler sidecars | `npm run fetch:upscaler-binaries` | Sidecar executables for upscaler tools |
| Verify environment | `npm run check:env` | Check Node and system prerequisites |

---

## 5. Agent Workflow Sequence

1. **Align on Intent**: Confirm the task scope if there are ambiguities. If an IDE plan exists, wait for plan approval. Do not invent an unrequested secondary planning mode.
2. **Consult Knowledge Base**:
   - Skim [Playbook](docs/playbook.md).
   - Keep [Definition of Done](docs/processes/definition-of-done.md) open throughout the session.
   - For UI / panels: read [Purpose & Flows](docs/app/purpose-and-flows.md), [Tools](docs/app/tools.md), and [Layout](docs/app/layout.md).
   - For backend / commands: read [Systems Overview](docs/app/systems/overview.md) and [Invoke Surface](docs/app/invoke-surface.md).
3. **Implement**: Small, focused steps. Avoid drive-by refactorings.
4. **Update Documentation**: Update relevant notes in `docs/` when behavior, interfaces, or commands change (see `docs/skills/docs-and-mermaid/SKILL.md`).
5. **Verify Runtime**:
   - Follow [Verification Guide](docs/app/verify.md) — never rely on reading code alone.
   - Run tests (`npm test`, `cargo test` when Rust changed, `npm run build`).
6. **Clean Up Processes**: Kill and stop all background servers, dev watchers, and app instances launched during the session.
7. **Pre-Review QA**:
   - Run [Pre-Review QA](docs/processes/pre-review-qa.md) audit over the diff.
   - Report status against Definition of Done before concluding.
