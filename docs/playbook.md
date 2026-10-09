# Playbook

Read this only when a subsystem is unfamiliar. Do not invent a second plan mode.

Do not pre-read playbook, DoD, or app maps by default. For targeted tasks, go straight to code. Consult [[architecture]] just-in-time when context is missing.

Implement in small steps. Update docs only when behavior or contracts change ([[docs-and-mermaid]]). Default to parallel work ([[parallel-operations]], [[concurrent-subagents]]). Launch sub-agents in the same turn for independent workstreams. Stay serial for dependent steps, shared mutable state, or conflicting edits.

After a large change, run [[pre-review-qa]] before you report done. Do not wait to be asked. Also run it when asked. Skip the table on a small edit. No default git. [[compounding-knowledge]] only when asked or after meaningful feature work.

No PRs. No fake tests. No secrets. Stop processes you started. Do not print ceremonial review tables on routine replies. Prefer editing an existing note. ADRs are optional unless asked; when you write one, comment the affected code. Deleted logic and hardcoded strings or mappings are each reported as `## WARNING` plus a `---` rule ([[report-deleted-logic]], [[report-hardcoded-strings]]).
