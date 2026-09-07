# Tools catalog

Nav IDs from `src/config/toolNavigation.ts`. Panels under `src/components/tools/`. Architecture & system details: [[architecture]].

| Tool id | Panel | Run path | Architecture section |
| --- | --- | --- | --- |
| `iconEditor` | `IconEditorToolPanel.tsx` | Dedicated (`tauriIconEditor`, glow via `tauriIconGlow`) | [[architecture]] |
| `glowMaker` | `GlowMakerToolPanel.tsx` | Preview dedicated; **Run** → `glowMaker` | [[architecture]] |
| `geodeButtons` | `GeodeButtonsToolPanel.tsx` | Preview dedicated; **Run** → `geodeButtons` | [[architecture]] |
| `particleEditor` | `ParticleEditorToolPanel.tsx` | Dedicated (`tauriParticleEditor`) | [[architecture]] |
| `splitter` | `SplitterToolPanel.tsx` | Batch `splitter` | [[architecture]] |
| `merger` | `MergerToolPanel.tsx` | Batch `merger` | [[architecture]] |
| `porter` | `PorterToolPanel.tsx` | Batch **`porterSplitter`** | [[architecture]] |
| `upscaler` | `UpscalerToolPanel.tsx` | Batch `upscaler` (desktop-only) | [[architecture]] |
| `randomizer` | `RandomizerToolPanel.tsx` | Batch `randomizer` | [[architecture]] |
| `convertToNewVersion` | `ConvertToNewVersionToolPanel.tsx` | Batch `convertToNewVersion` (desktop-only) | [[architecture]] |
| `texturePackInstaller` | `TexturePackInstallerToolPanel.tsx` | Dedicated + `pack-install-progress` | [[architecture]] |

Non-tool surfaces: `home`, `settings`, `about` (mobile About page; desktop copyright dialog). Shell wiring: [[architecture]].
