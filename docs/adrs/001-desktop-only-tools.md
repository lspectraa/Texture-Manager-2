# ADR 001 — Desktop-only Upscaler and Convert

- Status: accepted
- Date: 2026-09-04
- Deciders: visible in code (`toolNavigation.ts`, App mobile gates)

## Context

Android shares most tools but cannot host Vulkan AI sidecars or reliably reach the desktop Geometry Dash `Resources` tree the same way. Upscaler will likely never come to android, converter will require additional resources, likely to be part of 0.5.0 update as part of planned automatic pack installation.

## Options

1. Ship all 11 tools on Android with degraded stubs.
2. Omit Upscaler and Convert to New Version from the mobile shell listing and block navigation.

## Decision

We chose option 2. `DESKTOP_ONLY_TOOLS` is `upscaler` and `convertToNewVersion`; mobile listing helpers omit them; App shows a desktop-only status string if reached.

## Consequences

- Good: honest capability surface (9 mobile tools).
- Bad / follow-up: feature parity work must touch nav helpers and App gates together.
- What the next agent should not redo: re-enable these on Android without sidecars / Resources access.
