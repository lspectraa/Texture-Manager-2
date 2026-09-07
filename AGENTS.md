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
- **[Architecture & Systems](docs/app/architecture.md)** (`docs/app/architecture.md`) — Consolidated architecture, systems, and component guide.
- **[Purpose & Flows](docs/app/purpose-and-flows.md)** (`docs/app/purpose-and-flows.md`) — App purpose, user journeys, and screens.
- **[Tools Catalog](docs/app/tools.md)** (`docs/app/tools.md`) — Breakdown of all built-in tools (Icon Editor, Glow Maker, Upscaler, etc.).
- **[Invoke Surface](docs/app/invoke-surface.md)** (`docs/app/invoke-surface.md`) — IPC contract between frontend and Rust/Tauri.
- **[Config & Environment](docs/app/config-env.md)** (`docs/app/config-env.md`) — Secrets and environment configuration.
- **[Publish & Release](docs/app/publish.md)** (`docs/app/publish.md`) — Release workflows and artifacts.
- **[Lessons Learned](docs/lessons-learned.md)** (`docs/lessons-learned.md`) — Past pitfalls, historical context, and tripwires.

---

## 2. Hard Limits & Mandatory Rules

These rules are non-negotiable across all sessions:

1. **No PR Operations**: Do not open, merge, or approve pull requests. The human will review diffs and handle PRs.
2. **No Fake Tests**: Do not invent passing tests that skip the real path. Existing tests must pass, and new behavior must be covered when touching tested areas.
3. **No Secrets**: Never hardcode secrets, credentials, tokens, or environment-specific values in files or output them in chat.
4. **Stop All Processes Before Finishing**: Stop all servers, dev servers (`npm run dev`, `npm run tauri dev`), background processes, and application runs started during the session before claiming done.
5. **Satisfy Definition of Done**: Never declare a task complete while items in [Definition of Done](docs/processes/definition-of-done.md) that you can satisfy remain unchecked.
6. **Preserve Knowledge Base Quality**: Prefer editing existing notes over creating duplicate files. ADRs under `docs/adrs/` are optional background unless explicitly requested.
7. **Reviews Only on Major Changes**: Formal reviews (such as Pre-Review QA audits) must only be performed at the end of major changes or when explicitly requested. Do not run review audits on minor tasks, routine edits, or small fixes.
8. **Git Checks Not Default**: Git checks (e.g. `git status`, `git diff`, `git log`) must only be performed if there is a specific need to review earlier versions or history. Do not run git checks by default.
9. **No Pre-Flight Reading Loops**: Do NOT read documentation files (such as `playbook.md`, `definition-of-done.md`, or architecture guides) as a mandatory pre-flight routine. For targeted tasks (e.g. bug fixes, component edits, configuration updates), proceed directly to the relevant files.
10. **No Output Boilerplate**: Answer concisely and directly. Do not generate unrequested markdown review tables, checklists, or Definition of Done tables in regular responses.

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

> **Concurrency note**: Independent console commands can be executed concurrently (e.g. running `npm test` alongside `cargo test`), and console commands can also run concurrently with other operations (such as file reads, searches, edits, or sub-agents).

---

## 5. Agent Workflow Sequence

1. **Align on Intent**: Confirm the task scope if there are ambiguities. If an IDE plan exists, wait for plan approval. Do not invent an unrequested secondary planning mode.
2. **Consult Docs On-Demand Only**:
   - Skip reading documentation for targeted, well-defined tasks (e.g., editing known files, fixing a bug, updating config, running tests). Proceed directly to the task.
   - Consult specific docs (e.g. `docs/app/architecture.md`, `docs/app/invoke-surface.md`) strictly just-in-time when working on an unfamiliar subsystem.
3. **Implement**: Small, focused steps. Avoid drive-by refactorings.
4. **Update Documentation**: Update relevant notes in `docs/` only when behavior, public contracts, or interfaces change.
5. **Verify Runtime**:
   - Follow [Verification Guide](docs/app/verify.md) when verifying UI or runtime behavior.
   - Run tests (`npm test`, `cargo test` when Rust changed, `npm run build` — independent verification commands can run concurrently).
6. **Clean Up Processes**: Kill and stop all background servers, dev watchers, and app instances launched during the session.
7. **Complete Concisely**:
   - Answer directly and concisely without outputting boilerplate review checklists.
   - Perform a formal Pre-Review QA audit only at the end of major changes or upon explicit human request.
   - Run git checks only if needed to review earlier versions, not by default.

---

## 6. Concurrency & Parallel Execution

- **Concurrent Console Commands**: Console commands (e.g., test suites, build checks, and environment validations) can be executed concurrently whenever they do not depend on each other's outputs or conflict over shared resources (such as running `npm test` and `cargo test` in parallel).
- **Concurrency Across Operations**: Console commands can also be made concurrent with other operations — including file inspections, file modifications, codebase searches, documentation updates, and sub-agent executions — provided there are no overlapping file mutations or unresolved dependencies between them.
