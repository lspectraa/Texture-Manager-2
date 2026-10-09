# Report major changes

Before you finish a change that includes any of: schema or migration, API or env-shape change, new file/package/endpoint the human did not ask for, deleted public surface, deleted application logic, or behavior outside the stated task, report it.

Deleted logic is its own WARNING block even when the human asked for a cleanup. See `docs/rules/report-deleted-logic.md`.

Do not use editor-specific callouts. Use an H2 and a rule so this renders in any Markdown preview:

```markdown
## WARNING

---

What changed: …
Why it was needed: …
What else it can affect: …
What you should review: path, what to look at
```

The heading is always `## WARNING` in those exact capitals. One block per distinct change. If nothing applied, say so in one line. Do not print this on work that stayed in scope.
