# Parallel operations

Default to parallel. Do not walk independent work one call at a time. Do not do independent workstreams serially inline when a sub-agent can take one.

Independent tool calls run in the same turn: file reads, searches, edits, shell commands, and sub-agents. Console commands may run with each other and with those calls when they do not share a file or depend on each other's artifacts.

Do not run git by default. Use it only when you must compare to an earlier version.

## Sub-agents vs inline

Launch sub-agents in the same turn when the work splits into two or more streams that can finish without each other's unfinished output. Typical splits: API / UI / tests once the contract is known; separate packages; disjoint searches; documentation from evidence already found.

Do the work inline when:

- It is a one- or two-file bugfix
- The design is not settled, so a second stream would guess
- A sub-agent would cost more than the change

Inline work still batches independent reads, searches, and commands in one turn.

## Do not parallelize

Stay serial when:

- A later step needs the earlier result
- The steps share mutable state (one file, one config, one generated artifact, one migration, one dev server)
- Two edits would conflict on the same file

Two writes must not target the same file in one turn. Merge sub-agent results yourself. If the combined work is large, run [[pre-review-qa]] before reporting done.
