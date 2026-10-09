# Playbook

Read this only when a subsystem is unfamiliar. Do not invent a second plan mode.

Do not pre-read playbook, DoD, or app maps by default. For targeted tasks, go straight to code. Consult [[architecture]] just-in-time when context is missing.

Implement in small steps. Update docs only when behavior or contracts change ([[docs-and-mermaid]]). Split work with [[concurrent-subagents]] when layers are independent. Console commands may run with searches, edits, and sub-agents when they do not share a file.

[[pre-review-qa]] only after a major change or when asked. No default git. [[compounding-knowledge]] only when asked or after meaningful feature work.

No PRs. No fake tests. No secrets. Stop processes you started. Do not print ceremonial review tables on routine replies. Prefer editing an existing note. ADRs are optional unless asked; when you write one, comment the affected code. Deleted logic is reported as `## WARNING` plus a `---` rule.
