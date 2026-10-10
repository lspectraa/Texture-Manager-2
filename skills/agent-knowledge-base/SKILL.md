---
name: agent-knowledge-base
description: How to use this repo's docs vault without wasting tokens. Use when indexing an app, updating architecture or ADRs, or when unsure which note to open.
---

# Agent knowledge base

`AGENTS.md` is the always-on guide. This skill is for vault work only.

Do not open playbook, DoD, architecture, or pre-review QA before a targeted coding task. When a subsystem is unfamiliar, read one note — usually `docs/app/architecture.md`. After a large feature, run `docs/processes/pre-review-qa.md` before reporting done.

Skills live in `skills/` at the repo root. Do not duplicate them under `docs/skills/` or `.cursor/skills/`.

[[compounding-knowledge]] only when asked or after meaningful feature work. [[living-adr]] only if asked or a real decision was made.

Texture Manager 2 keeps extra notes beside the single architecture file. Open one only when that surface is the unfamiliar part: `docs/app/purpose-and-flows.md`, `layout.md`, `tools.md`, `invoke-surface.md`, `config-env.md`, `publish.md`. Commands: `docs/app/run-test-lint.md`. UI check: `docs/app/verify.md`.
