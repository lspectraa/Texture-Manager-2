# Agent Knowledge Base

Living Markdown vault for a coding agent. Humans and agents both edit these files. Git keeps history.

In this repo the vault lives at `docs/` (not `docs/agent/`). Product screenshots sit in `docs/screenshots/`. The app map is under `docs/app/`.

Cursor discovery (committed under `.cursor/`):

- Rule: `.cursor/rules/agent-knowledge-base.mdc` (always apply)
- Skills: `.cursor/skills/*` (thin wrappers; bodies in `docs/skills/*/SKILL.md` are source of truth)
- Hooks: `.cursor/hooks.json` — `sessionStart` via `node .cursor/hooks/session-start.cjs` (sets `TM2_AGENT_*` env). No automatic `stop` vault nudge — run [[compounding-knowledge]] only when the human asks or at the end of meaningful feature work.

The IDE already has plan mode. There is no plan-mode skill here. Align in the planner, then use [[playbook]].

Notes use Obsidian-style `[[wikilinks]]` only when the next file actually needs to be opened. Do not add a Related section to new notes.

```
docs/
  index.md
  playbook.md
  lessons-learned.md
  adrs.md
  app/                 # product map + app/systems/ how-it-works
  processes/
  skills/<name>/SKILL.md
  templates/
  prompts/session-start.md
  adrs/                # optional; human reviews
  screenshots/

.cursor/
  rules/agent-knowledge-base.mdc
  skills/              # Cursor discovery wrappers → docs/skills
  hooks.json
  hooks/
```

Plan a small real task in the IDE, then tell the agent to load [[playbook]] (or skill `agent-knowledge-base`). When the work is good, run [[compounding-knowledge]]. You review the vault diff and open the PR.
