# Editors — Icon, Particle, Glow, Geode Buttons

Interactive tools that are not (only) the shared batch rail. Catalog: [[tools]].

## Icon Editor

| Layer | Path |
| --- | --- |
| Panel | `src/components/tools/IconEditorToolPanel.tsx` |
| Service | `src/services/tauriIconEditor.ts` |
| Glow hook | `src/hooks/useIconEditorGeneratedGlow.ts` → `tauriIconGlow.ts` |
| Undo | `src/services/iconEditorHistory.ts` (in-memory) |
| Core | `src-tauri/src/core/icon_editor.rs` |

Commands (absolute plist/png paths): sheet info, create/copy/save, import/add/rotate frames, extract frames, rename / swap-rename stems, PNG ↔ data URL.

Generated glow uses `generate_icon_glow_cmd` (`glow_preview`) rather than AI upscale.

## Glow Maker

| Concern | Path |
| --- | --- |
| Panel | `GlowMakerToolPanel.tsx` |
| Live preview | `glow_maker_preview_cmd` / `tauriGlowMaker.ts` |
| Batch Run | App → `run_operation` kind `glowMaker` → `glow_maker::execute_glow_maker` |

Full pipeline (tier-scaled thickness, composite layers, outside-stroke render, `GeneratedGlow/`): [[glow-maker]].

Rust stack: `glow` (render), `glow_composite` (layer stack), `glow_maker` (batch), `glow_preview` (UI previews).

## Geode Buttons (hybrid)

| Concern | Path |
| --- | --- |
| Panel | `GeodeButtonsToolPanel.tsx` |
| Index / preview / defaults | `tauriGeodeButtons.ts` → `geode_buttons_*_cmd` |
| Generate | Batch Run → kind `geodeButtons` |

Resolves BlankSheet-style templates from Resources / Geode media. Applies HSV family rules. On Android, prefers Geode media over unreliable split-cache (see comments in `geode_buttons.rs`).

App hides the shared operation report rail for this tool (`showOperationAndReport` excludes geode); generate still uses `run_operation`.

## Particle Editor

| Layer | Path |
| --- | --- |
| Panel | `ParticleEditorToolPanel.tsx` |
| Simulator | `components/tools/particleEditor/` (canvas preview in JS) |
| Domain | `domain/particleConfig.ts`, `gdParticleEffects.ts` |
| Service | `tauriParticleEditor.ts` |
| Undo | `particleEditorHistory.ts` |
| Core | `particle_editor.rs`, `particle_sprites.rs` |

Open/save Cocos particle `.plist`; load texture; preview icon / sheet frame from Rust. Stock GD effects catalog lives in `gdParticleEffects.ts`. Prefer `domain/particleConfig` over legacy `services/particleConfig` re-export.
