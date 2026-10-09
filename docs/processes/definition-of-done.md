# Definition of Done

Use this list on a large change or when the human asks. Large and major are the same bar ([[pre-review-qa]]). Do not paste it into routine replies. No default git.

- Change is scoped to the requested task
- No secrets or environment-specific credentials in source
- Tests still pass where this area is already tested (`npm test`; `cargo test` in `src-tauri/` when Rust changed — [[run-test-lint]])
- Docs updated only if contracts or behavior changed
- High-impact unspecified changes reported as `## WARNING` plus a `---` rule ([[report-major-changes]])
- Hardcoded user-facing strings, magic values, and inline mappings reported as the `## WARNING` variant ([[report-hardcoded-strings]])
- Processes this session started have been stopped ([[stop-what-you-start]])

The human opens the PR. After a large change, run [[pre-review-qa]] before reporting done. Do not wait to be asked. Also run it when asked. Skip it on a small edit. If the UI changed, check the running app once ([[verify]]).
