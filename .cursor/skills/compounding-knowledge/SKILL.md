---
name: compounding-knowledge
description: Update the agent knowledge base after meaningful feature work, or when the human asks to distill the chat. Do not run automatically on every agent stop.
---

# Compounding knowledge

Write what this session learned back into the vault so the next session can load it.

Run only when the human asks, or at the end of meaningful feature work — not on every trivial chat.

Fix docs this work made wrong. Append one [[lessons-learned]] entry if the pitfall is not obvious. Add an ADR only if the human asked ([[living-adr]]). If a prompt should be reused, draft it from [[super-prompt]]. Suggest exactly one playbook or tooling improvement and do not apply it unless the human says yes.

Prefer a paragraph in an existing note over a new file with a vague title. List vault files changed and why. Do not open a pull request.
