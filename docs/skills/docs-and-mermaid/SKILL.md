---
name: docs-and-mermaid
description: Write Markdown docs and Mermaid diagrams in the same change as the code. Use when behavior, public API, data flow, env vars, or commands change, or when the human asks for README or diagram updates.
---

# Docs and Mermaid

Documentation is part of the change. Do not leave the next session to discover a stale README.

Update the existing user-facing doc if one exists. Put diagrams in Markdown so they live in git. Prefer sequenceDiagram or flowchart LR, and name nodes after real modules or services in this repo.

If a design decision was made and the human wants it recorded, also write an ADR ([[living-adr]]). If the default agent sequence changed, update [[playbook]].
