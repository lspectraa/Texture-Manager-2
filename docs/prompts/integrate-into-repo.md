# Integrate this kit into a live repo

Works with Cursor, Claude Code, Copilot, Windsurf, Cline, Codex, Aider, and anything else that will read `AGENTS.md`. Do not assume Cursor is present.

Do not rewrite application code. Prefer merging over clobbering.

## Canonical targets (required)

Install at the **repository root**:

| Path | Role |
|---|---|
| `AGENTS.md` | Always-on guide for every agent |
| `skills/<name>/SKILL.md` | Skills |
| `docs/` | Living notes |

## Adapters (optional)

Write only if that tool is already in the repo, or the file is missing and cheap:

| Path | Tool |
|---|---|
| `CLAUDE.md` | Claude Code — pointer at `AGENTS.md` |
| `.github/copilot-instructions.md` | GitHub Copilot — same |
| `.cursor/rules/agent-knowledge-base.mdc` | Cursor always-on rule, short |
| `.cursor/hooks/session-start.cjs` | Cursor only; env vars, no essay |
| `.agents/skills/` | Only if the running tool scans this folder — copy from `skills/` |

Do not put skill bodies in two places.

## Detect what already exists

In parallel, check for: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/`, `.github/copilot-instructions.md`, `.github/instructions/`, `.windsurf/`, `.clinerules`, `.agents/`, `skills/`, `docs/`, `docs/agent/`, `docs/skills/`.

Report the map in a few lines, then proceed.

## Copy rules

1. Missing canonical file → copy from the kit.
2. Existing project-specific `AGENTS.md` or architecture note → append hard limits and workflow; do not replace with the blank template.
3. Skills live only in `skills/`. Delete `docs/skills/` duplicates. If `.cursor/skills/` has unique bodies, move them to `skills/` and leave a pointer README.
4. Session hooks stay env-only. Skip Cursor hooks when the repo has no `.cursor/` and the user did not ask for Cursor files.
5. Heavy tool rules scoped or off by default, in whatever format that IDE uses.
6. One `docs/app/architecture.md`. Fold micro-notes only after the human confirms.
7. Old `docs/agent/` vault: promote to `docs/` or leave one pointer. Do not keep two playbooks.
8. No default git. No PR. Stop processes you started.

## After install

Reply with paths created, merged, left alone, and adapters written. Next step is index or a normal coding task — no vault tour.

## Prompt to paste

```
Integrate the agent knowledge-base kit into this repo.

Source: the agent-kb-starter folder.
Target: this repository root.

Canonical files: AGENTS.md, skills/<name>/SKILL.md, docs/.
Also write thin adapters only for tools this repo already uses (CLAUDE.md, .github/copilot-instructions.md, .cursor/rules, .agents/skills). Do not lock the vault to Cursor.

Do not overwrite project-specific AGENTS.md or architecture notes; append hard limits instead. One skill tree under skills/. Session hooks env-only. One architecture.md. No PR. No pre-flight vault read after install.
```
