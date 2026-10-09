# ADR 002 — Waifu2x for gamesheets, Real-ESRGAN for icons

An earlier draft index called this ADR 004. The filename number is the id.

- Status: accepted
- Date: 2026-09-04
- Deciders: README Upscaler feature text + bundled `externalBin` pair

## Context

Gamesheets and icon sprites need different AI upscale characteristics; both run as ncnn-Vulkan sidecars. Waifu2x would produce feathered edges on black outlines on what should be a crisp edge. Adding AV3 would increase the package size by including its binary.

## Options

1. One model/binary for all assets.
2. Waifu2x for gamesheets; Real-ESRGAN for icons; optional sprite-index cache reuse.

## Decision

We chose option 2.

## Code anchors

- `src/domain/operations.ts` (`UpscalerModel`) — `ADR-002: Waifu2x for gamesheets, Real-ESRGAN for icons. See docs/adrs/002-upscaler-engine-split.md`
- `src-tauri/src/core/upscaler.rs` (`ai_model_for_sprite`) — `ADR-002: Waifu2x for gamesheets, Real-ESRGAN for icons. See docs/adrs/002-upscaler-engine-split.md`
- `src-tauri/src/core/upscaler_sidecar.rs` (`binary_base_name`) — `ADR-002: Waifu2x for gamesheets, Real-ESRGAN for icons. See docs/adrs/002-upscaler-engine-split.md`

## Consequences

- Good: quality matched to asset type; cache can skip repeat AI.
- Bad / follow-up: both binaries/models must be fetched (`fetch:upscaler-binaries`); NOTICE / About must keep third-party licenses distinct.
- What the next agent should not redo: collapse to a single engine without an explicit product decision.
