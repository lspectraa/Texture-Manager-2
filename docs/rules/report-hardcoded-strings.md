# Report hardcoded strings and mappings

Prefer a constant, config, localization entry, or an existing enum. If this session adds any of the following inline instead, tell the human before you finish:

- A user-facing string (UI copy, API error text, notification text)
- A magic string or number whose meaning is not obvious at the use site
- A hardcoded mapping or lookup (id to name, status to label, code to message)

A test title, a test fixture, or a value that already uses a named constant, config key, locale key, or enum member from this change does not count.

This is a variant of the same `## WARNING` block as [[report-deleted-logic]] and [[report-major-changes]]. Do not use editor-specific callouts. Use an H2 and a rule so this renders in any Markdown preview:

```markdown
## WARNING

---

What: …
Where: path, symbol or block
Why: …
What might depend: …
How to fix: constant, config, localization, or existing enum — name the target
```

The heading is always `## WARNING` in those exact capitals. One block per distinct string or one block per lookup table. Do not bury it in a summary paragraph. Do not skip the block because the tests pass. If you added none of the items above, say nothing.
