---
name: concurrent-subagents
description: Split independent work across parallel sub-agents and tool calls, including console commands, searches, edits, and documentation. Use when pieces do not share unfinished output. Do not use for a two-file bugfix.
---

# Concurrent sub-agents

Use when the pieces do not need each other's unfinished output.

## Console and other ops

- Independent console commands may run at the same time (example: unit tests in two packages).
- Commands may run alongside searches, reads, edits, and sub-agents.
- Do not overlap writers on the same file, shared config, or a command that needs the previous artifact.

Typical splits: API / UI / tests when the contract is known; parallel search; document from evidence already found.

Do not split a two-file bugfix. Merge results. No PR. Review table only if the combined work was major. No default git.
