# Gaps

Remaining tripwires (keep this short; promote fixed items into lessons or delete them).

## Product / code

- No lint/format tooling and no test CI (publish-only workflow).
- Rust tests exist but are not in npm scripts / README common scripts table.
- Dual About surfaces (desktop dialog vs mobile tool page); `PrimaryTool` extends `AppToolId` with `home` / `settings` / `about`.
- Dual execution paths (shared `run_operation` vs dedicated invokes); Pack Installer progress is separate events — see [[invoke-surface]].
- Porter UI id `porter` vs operation kind `porterSplitter`.
- `App.tsx` holds most batch tool state and `executeSelectedOperation` — large shell file.
- About i18n still says “desktop app” while README documents Android.
- `services/particleConfig.ts` is a legacy re-export of `domain/particleConfig`.
- Android `android:dev` is PowerShell-oriented; `gen/android` is generated noise.
- Upscaler needs fetched sidecars; Android CI intentionally skips the npm `tauri` fetch wrapper.

## Vault

- ADRs under `adrs/` are draft background from the indexing pass — human will review later; do not treat them as blocking.
- No root `AGENTS.md` (agent entry is [[index]] / [[playbook]], plus `.cursor/rules/agent-knowledge-base.mdc`).
- Cursor hooks: `sessionStart` under `.cursor/hooks.json` only. Prefer the always-apply rule if `sessionStart` context seems missing (known IDE race on `additional_context`). Compounding is explicit — not hooked on `stop`.
