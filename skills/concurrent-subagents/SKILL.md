---
name: concurrent-subagents
description: Default to parallel tool calls and launch sub-agents in the same turn for independent workstreams. Use when pieces do not share unfinished output. Do not use for a two-file bugfix, dependent steps, or shared mutable state.
---

# Concurrent sub-agents

Follow `docs/rules/parallel-operations.md`. Default to parallel. Launch sub-agents in the same turn for independent workstreams. Do not finish those streams serially inline.

## When to delegate

Launch sub-agents when two or more streams can finish without each other's unfinished output. Typical splits: API / UI / tests when the contract is known; separate packages; disjoint searches; documentation from evidence already found.

## When to stay inline

Do the work inline for a one- or two-file bugfix, when the design is not settled, or when a sub-agent would cost more than the change. Still batch independent reads, searches, and commands in one turn.

## Do not parallelize

Stay serial when a later step needs the earlier result, when steps share mutable state (one file, one config, one generated artifact, one migration), or when two edits would conflict. Two writes must not target the same file in one turn.

Merge results. No PR. If the combined work is large, run [[pre-review-qa]] before reporting done. No default git.
