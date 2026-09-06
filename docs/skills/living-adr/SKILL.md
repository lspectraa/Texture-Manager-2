---
name: living-adr
description: Write an architecture decision record in the same change as the work. Use when two real options existed, a constraint will surprise the next session, or an older ADR is being reversed.
---

# Living ADRs

The question "why did we choose X?" should hit a file, not folklore.

Write one when the human asks, or when two real options existed and they want it recorded. Use [[adr]] and create `adrs/NNN-short-slug.md` with the next free number. Include the rejected option. Set status to accepted if the decision is already in the code.

Do not write an ADR for a typo fix, do not block shipping on ADR polish, and do not leave Status as proposed after the code already shipped the choice.
