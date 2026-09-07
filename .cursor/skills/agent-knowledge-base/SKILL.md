---
name: agent-knowledge-base
description: Loads and follows the Texture Manager 2 agent vault under docs/ (playbook, app map, processes, lessons). Use after IDE plan approval, when starting product work in this repo, or when the user mentions the playbook, knowledge base, or vault.
---

# Agent knowledge base

Source of truth: `docs/` in this repo. Cursor discovery copies of vault skills live under `.cursor/skills/`; bodies that say “read docs/skills/…” point at the vault.

## Sequence

1. Read `docs/playbook.md`.
2. Keep `docs/processes/definition-of-done.md` until the end.
3. Skim app map as needed:
   - `docs/app/purpose-and-flows.md`
   - `docs/app/layout.md` / `docs/app/tools.md`
   - `docs/app/systems/overview.md` (and linked system notes)
   - `docs/app/invoke-surface.md`
   - `docs/app/run-test-lint.md` / `docs/app/config-env.md` / `docs/app/publish.md`
   - `docs/app/verify.md` before claiming runtime work done
   - `docs/app/gaps.md` / `docs/lessons-learned.md` for tripwires
4. Match a vault skill when the task fits — read the file under `docs/skills/<name>/SKILL.md`:
   - `docs-and-mermaid` — behavior/docs changed
   - `concurrent-subagents` — independent parallel layers
   - `compounding-knowledge` — only when the human asks or after meaningful feature work
   - `living-adr` — only if the human asks for an ADR
5. Major changes only (before human opens PR): `docs/processes/pre-review-qa.md` (skip for minor/routine tasks).

## Hard limits (from playbook)

- No opening/merging/approving PRs
- No fake tests; no secrets in files or chat
- Stop all servers, background processes, and app runs started by the agent before being done
- Prefer editing existing notes; ADRs optional unless asked
- Reviews only at the end of major changes; git checks only when reviewing earlier versions (not by default)
- Stop when DoD items you can satisfy are still unchecked
