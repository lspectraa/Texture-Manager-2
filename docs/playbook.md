# Playbook

Read this after the IDE plan is approved. Do not invent a second plan mode.

Confirm the plan is in scope, then keep [[definition-of-done]] open until the end. For Texture Manager 2 work, skim [[purpose-and-flows]] (and [[tools]] if touching a panel) plus [[run-test-lint]] before coding; for internals use [[overview]]. Cursor always-apply rule `.cursor/rules/agent-knowledge-base.mdc` and skill `agent-knowledge-base` point at this vault. Implement in small steps. Update docs when behavior changes ([[docs-and-mermaid]]). Split work with [[concurrent-subagents]] only when layers are independent. Before the human opens a PR, run [[pre-review-qa]]. Run [[compounding-knowledge]] only when the human asks or after meaningful feature work — not on every stop.

Do not open, merge, or approve pull requests. Do not invent passing tests that skip the real path. Do not put secrets in files or chat. Stop all servers, background processes, and application runs started during the session before claiming done. Do not say done while Definition of Done still has unchecked items you can satisfy. Prefer editing an existing note over creating a duplicate. ADRs under `adrs/` are optional background — do not block on writing new ones unless the human asks.
