# Optimize an existing vault

```
Optimize this repo’s agent knowledge base for token/latency efficiency using the Texture Manager 2 pattern:

1. Prohibit pre-flight doc reading loops; docs are just-in-time only.
2. Trim always-apply rules; keep AGENTS.md as the detailed guide.
3. Scope heavy alwaysApply rules (browser/devtools) to relevant globs or make them non-always.
4. Session-start hook: env vars only, no additional_context essay.
5. Consolidate fragmented systems notes into one architecture.md; fix links; delete micro-notes.
6. Skills: single source in skills/; remove docs/skills duplicates.
7. Reviews only for major changes; no default git checks; no ceremonial QA/DoD output on routine tasks.
8. Document that console commands can run concurrently with each other and with other operations.
9. Append a lessons-learned entry explaining why this was done.
Do not invent new process bureaucracy. Prefer editing existing notes over creating more files.
```
