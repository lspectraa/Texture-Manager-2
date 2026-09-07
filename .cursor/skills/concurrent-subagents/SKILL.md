---
name: concurrent-subagents
description: Split independent work across parallel sub-agents, including implementation, repo search, and documentation. Console commands and operations can also run concurrently. Use when API, UI, and tests can move without sharing an unwritten contract, when exploring several areas at once, or when docs can be written beside the search. Do not use for a two-file bugfix.
---

# Concurrent sub-agents

Use when the pieces do not need each other's unfinished output. That includes implementation across packages, searching the repo in parallel, and writing docs while search is still running.

Do not split a two-file bugfix or a change where step two depends on step one's types or schema. Do not have two agents edit the same file.

## Concurrent console commands and operations

Concurrency also applies to console commands and tool actions:

- **Parallel commands**: Independent console commands (e.g. running `npm test` and `cargo test` concurrently, or verifying env while building) can execute at the same time.
- **Concurrent with other operations**: Console commands can run concurrently alongside other operations (e.g. searching the repo, inspecting code, drafting docs, or coordinating sub-agents) rather than waiting sequentially.
- **Guardrails**: Avoid concurrency when two operations/commands write to the same files, mutate shared configuration, or when one depends on the other's exit code or artifacts.

Typical splits

- API / UI / tests, when the contract is already known
- Search — one agent traces call sites, another reads configs, another checks tests
- Document — one agent drafts the README or diagram from what search already found, while another keeps searching a different area

State what each sub-agent owns. Give each the hard limits from [[playbook]]. Merge results and report conflicts. Searches should come back as paths and evidence, not a second copy of the repo. Docs follow [[docs-and-mermaid]] and must match what was actually found. For major changes, run [[pre-review-qa]] (skip review audits on minor tasks); git checks are only run if reviewing earlier versions is needed, not by default. Do not open a pull request.
