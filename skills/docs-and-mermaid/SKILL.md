---
name: docs-and-mermaid
description: Write Markdown docs and Mermaid diagrams in the same change as the code. Use when behavior, public API, or data flow changes, or when indexing an existing app into docs/app/architecture.md.
---

# Docs and Mermaid

Documentation is part of the change only when contracts or behavior changed.

Put system detail in `docs/app/architecture.md`. Do not create micro-notes under `docs/app/systems/`. Prefer sequenceDiagram or flowchart LR with real module names.

If a design decision was made, write an ADR ([[living-adr]]).
