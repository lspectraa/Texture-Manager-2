---
name: living-adr
description: Write an architecture decision record in the same change as the work. Use when two real options existed, a constraint will surprise the next session, or an older ADR is being reversed.
---

# Living ADRs

Write one when two real options existed, when a constraint will surprise the next session, or when an older ADR is being reversed. Use `docs/templates/adr.md` and create `docs/adrs/NNN-short-slug.md`. Include the rejected option.

The ADR is not done until the code that implements it is annotated. Above each affected block — the function, type, route, or config that would be wrong if someone reversed the decision — add a one-line comment that names the file:

```
// ADR-012: sessions live in Redis, not cookies. See docs/adrs/012-session-store.md
```

Use the host language's comment syntax. One comment per decision site, not on every line. If the change spans several files, comment each site. List those paths under **Code anchors** in the ADR.

Do not write an ADR for a typo fix. Do not leave an ADR that has no code comment.
