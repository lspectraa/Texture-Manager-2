# Pre-review QA

Last pass before the human opens a pull request on major changes. Do not run review audits on minor tasks or routine updates. You do not open the PR.

Git checks (e.g. `git status`, `git diff`, `git log`) are only done if there is a specific need to review earlier versions or history, and must not be done by default.

Load [[definition-of-done]] and this note. Audit the changes. For each item report PASS, FAIL, or N/A with one line of reason. List the exact files the human should read. Stop.

- [ ] Best practices for this language and framework in the touched files
- [ ] No leftover debug logs, agent breadcrumbs, or commented-out experiments
- [ ] No hardcoded secrets or environment URLs that belong in config
- [ ] Tests exist for new behavior and were run
- [ ] All servers, background processes, and application runs started by the agent have been stopped
- [ ] Docs or diagrams updated if behavior changed
- [ ] Diff is scoped to the stated task
- [ ] Definition of Done is green, or gaps are listed for the human

```
QA
- best practices — PASS|FAIL|N/A — reason
- secrets / config — …
- tests — …
- servers / cleanup — PASS|FAIL|N/A — reason
- docs — …
- scope — …
- DoD — …

Files to review
- path — why

Blockers
- none | …
```
