# ADR 004 — Waifu2x for gamesheets, Real-ESRGAN for icons

- Status: accepted
- Date: 2026-09-04
- Deciders: README Upscaler feature text + bundled `externalBin` pair

## Context

Gamesheets and icon sprites need different AI upscale characteristics; both run as ncnn-Vulkan sidecars.

## Options

1. One model/binary for all assets.
2. Waifu2x for gamesheets; Real-ESRGAN for icons; optional sprite-index cache reuse.

## Decision

We chose option 2.

## Consequences

- Good: quality matched to asset type; cache can skip repeat AI.
- Bad / follow-up: both binaries/models must be fetched (`fetch:upscaler-binaries`); NOTICE / About must keep third-party licenses distinct.
- What the next agent should not redo: collapse to a single engine without an explicit product decision.
