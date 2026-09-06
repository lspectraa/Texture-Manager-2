# Tools catalog

Nav IDs from `src/config/toolNavigation.ts`. Panels under `src/components/tools/`. Systems deep-dives: [[overview]].

| Tool id | Panel | Run path | Deep dive |
| --- | --- | --- | --- |
| `iconEditor` | `IconEditorToolPanel.tsx` | Dedicated (`tauriIconEditor`, glow via `tauriIconGlow`) | [[editors]] |
| `glowMaker` | `GlowMakerToolPanel.tsx` | Preview dedicated; **Run** → `glowMaker` | [[glow-maker]], [[batch-pipeline]] |
| `geodeButtons` | `GeodeButtonsToolPanel.tsx` | Preview dedicated; **Run** → `geodeButtons` | [[editors]], [[geode-texture-loader]] |
| `particleEditor` | `ParticleEditorToolPanel.tsx` | Dedicated (`tauriParticleEditor`) | [[editors]] |
| `splitter` | `SplitterToolPanel.tsx` | Batch `splitter` | [[batch-pipeline]] |
| `merger` | `MergerToolPanel.tsx` | Batch `merger` | [[batch-pipeline]] |
| `porter` | `PorterToolPanel.tsx` | Batch **`porterSplitter`** | [[batch-pipeline]] |
| `upscaler` | `UpscalerToolPanel.tsx` | Batch `upscaler` (desktop-only) | [[upscaler]] |
| `randomizer` | `RandomizerToolPanel.tsx` | Batch `randomizer` | [[batch-pipeline]] |
| `convertToNewVersion` | `ConvertToNewVersionToolPanel.tsx` | Batch `convertToNewVersion` (desktop-only) | [[batch-pipeline]] |
| `texturePackInstaller` | `TexturePackInstallerToolPanel.tsx` | Dedicated + `pack-install-progress` | [[pack-installer]] |

Non-tool surfaces: `home`, `settings`, `about` (mobile About page; desktop copyright dialog). Shell wiring: [[frontend-shell]].
