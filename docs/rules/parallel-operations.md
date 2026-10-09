# Parallel operations

Independent tool calls run in the same turn. That includes shell commands alongside reads, searches, edits, and sub-agents when they do not share a file.

Do not run git by default. Use it only when you must compare to an earlier version.

Stay serial when a later call needs the earlier result. Two writes must not target the same file in one turn.
