---
name: compounding-knowledge
description: Update the agent knowledge base after a session that produced a decision, a reusable prompt, or a pitfall. Use at the end of meaningful work, after a win, or when the human asks to distill the chat.
---

# Compounding knowledge

Write what this session learned into an existing note. Put system detail in `docs/app/architecture.md`, not a new micro-file.

Fix docs this work made wrong. Add an ADR if a decision was made ([[living-adr]]) and comment the affected code so it points at `docs/adrs/NNN-slug.md`. Report deleted logic as `## WARNING` plus a `---` rule ([[report-deleted-logic]]). Append one [[lessons-learned]] entry if the pitfall is not obvious.

Do not open a pull request. Do not print a review table.
