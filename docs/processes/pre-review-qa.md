# Pre-review QA

Last pass before the human opens a pull request. You do not open the PR.

Load [[definition-of-done]] and this note. Audit the current diff. For each item report PASS, FAIL, or N/A with one line of reason. List the exact files the human should read. Stop.

- [ ] Best practices for this language and framework in the touched files
- [ ] No leftover debug logs, agent breadcrumbs, or commented-out experiments
- [ ] No hardcoded secrets or environment URLs that belong in config
- [ ] Tests exist for new behavior and were run
- [ ] Docs or diagrams updated if behavior changed
- [ ] Diff is scoped to the stated task
- [ ] Definition of Done is green, or gaps are listed for the human

```
QA
- best practices — PASS|FAIL|N/A — reason
- secrets / config — …
- tests — …
- docs — …
- scope — …
- DoD — …

Files to review
- path — why

Blockers
- none | …
```
