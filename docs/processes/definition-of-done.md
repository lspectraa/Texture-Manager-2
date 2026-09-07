# Definition of Done

Do not claim the task is done until every applicable item is checked. The human confirms the list.

- [ ] IDE plan was approved, or the human explicitly skipped planning
- [ ] Change is scoped to the requested task — no drive-by refactors
- [ ] No hardcoded secrets, tokens, or environment-specific credentials
- [ ] Magic numbers and unexplained constants are named or documented
- [ ] Existing tests still pass (`npm test`; `cargo test` in `src-tauri/` when Rust changed); new behavior has coverage if this area is already tested
- [ ] Docs this change made wrong were updated
- [ ] All servers, background processes, and application runs started by the agent have been stopped
- [ ] Human has seen the diff and will open the PR themselves

If the UI changed, verify the user-visible path against the running app ([[verify]]) — Vitest for logic that already has unit tests. If this vault was touched, notes stay human-readable and [[playbook]] still points at the right files.

Opening, merging, and deploying stay human. Formal reviews (such as [[pre-review-qa]]) are conducted only at the end of major changes, not on minor tasks or routine updates. Git checks are only done if it needs to review earlier versions, not by default.
