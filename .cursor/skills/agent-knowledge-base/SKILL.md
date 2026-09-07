---
name: agent-knowledge-base
description: Loads and follows the Texture Manager 2 agent vault under docs/ (playbook, app map, processes, lessons). Use after IDE plan approval, when starting product work in this repo, or when the user mentions the playbook, knowledge base, or vault.
---

# Agent knowledge base

Source of truth: `docs/` in this repo; custom Cursor skills live directly under `.cursor/skills/`.

## Sequence

1. Consult docs strictly on-demand. Do NOT run pre-flight reading loops for targeted or familiar tasks.
2. For unfamiliar subsystems or complex architectures, consult relevant notes just-in-time:
   - `docs/app/purpose-and-flows.md` / `docs/app/layout.md` / `docs/app/tools.md`
   - `docs/app/architecture.md` (internals and systems)
   - `docs/app/invoke-surface.md`
   - `docs/app/run-test-lint.md` / `docs/app/config-env.md` / `docs/app/publish.md`
   - `docs/app/verify.md` when verifying runtime behavior
3. Match a vault skill when the task fits — read the file under `.cursor/skills/<name>/SKILL.md`:
   - `docs-and-mermaid` — behavior/docs changed
   - `concurrent-subagents` — independent parallel layers
   - `compounding-knowledge` — only when the human asks or after meaningful feature work
   - `living-adr` — only if the human asks for an ADR
4. Major changes only (before human opens PR): `docs/processes/pre-review-qa.md` (skip for minor/routine tasks).

## Hard limits (from playbook)

- No opening/merging/approving PRs
- No fake tests; no secrets in files or chat
- Stop all servers, background processes, and app runs started by the agent before being done
- Prefer editing existing notes; ADRs optional unless asked
- Reviews only at the end of major changes; git checks only when reviewing earlier versions (not by default)
- No pre-flight reading loops; answer concisely without boilerplate checklists
- Stop when DoD items you can satisfy are still unchecked
