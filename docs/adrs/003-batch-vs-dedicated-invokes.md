# ADR 006 — Batch `run_operation` vs dedicated invokes

- Status: accepted
- Date: 2026-09-04
- Deciders: visible in `App.tsx` + `src/services/*` + `src-tauri/src/lib.rs`

## Context

Some tools are folder-in/folder-out batch jobs with a shared progress/report rail. Others are interactive editors or installers with their own UX and events.

## Options

1. Route every tool through one `run_operation` pipeline.
2. Keep a shared batch pipeline for sheet/pack transform tools, and dedicated Tauri commands for Icon Editor, Particle Editor, Pack Installer (and previews).

## Decision

We chose option 2. Batch tools go through `tauriOperations` / `executor`. Interactive tools use dedicated wrappers. Geode Buttons is hybrid (preview dedicated; generate via batch Run).

## Consequences

- Good: progress/report UI stays simple for batch jobs; editors are not forced into the operation rail.
- Bad / follow-up: agents must check which path a tool uses before wiring progress or cancel.
- What the next agent should not redo: move Pack Installer or Icon Editor onto the shared report rail without an explicit UX decision.
