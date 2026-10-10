# Report deleted logic

If this session removes application logic (a branch, handler, helper, type, route, schema field, or behavior someone could still depend on) tell the human before you finish. Unused imports and dead comments do not count. Refactors that move the same logic to a new file do not count if the behavior stays.

Do not use editor-specific callouts. Use an H2 and a rule so this renders in any Markdown preview:

```markdown
## WARNING

---

What was removed: …
Where: path, symbol or block
Why: …
What still might depend on it: …
How to restore: file + idea, or "re-add from git"
```

The heading is always `## WARNING` in those exact capitals. One block per distinct deletion. Do not bury it in a summary paragraph. Do not delete and stay silent because the tests still pass.
