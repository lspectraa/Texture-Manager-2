# Pre-review QA

Run this at the end of a large change, before you report done. Do not wait to be asked. Also run it when the human asks. Skip for a small edit. No default git. Do not print this table on routine work. You do not open the PR.

Large and major are the same bar. A change is large when any of these is true:

- It adds a subsystem, package, or module
- It adds or changes a public API, endpoint, or env shape
- It changes a schema or migration
- It implements a feature past a localized fix (a one- or two-file bugfix is small)

This kit has no agent-stop hook. When `.cursor/hooks/` is present it is session-start and env-only ([[lessons-learned]]). The always-on requirement is in `AGENTS.md`.

Audit the change. One line per item: PASS, FAIL, or N/A. List files the human should read. Stop.

- Best practices in touched files
- No debug leftovers
- No secrets in source
- Tests for new behavior were run when they exist
- Processes this session started have been stopped
- Docs updated if contracts changed
- Scope matches the task
- Hardcoded user-facing strings, magic values, and inline mappings reported ([[report-hardcoded-strings]])
