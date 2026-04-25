import { FolderOpen, WandSparkles } from "lucide-react";
import { GlassNumberInput } from "../inputs/GlassNumberInput";
import { PickFolderFn } from "./types";

type GlowMakerToolPanelProps = {
  inputDir: string;
  outputDir: string;
  thickness: number;
  tolerance: number;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onThicknessChange: (value: number) => void;
  onToleranceChange: (value: number) => void;
  pickFolder: PickFolderFn;
};

export function GlowMakerToolPanel({
  inputDir,
  outputDir,
  thickness,
  tolerance,
  onInputDirChange,
  onOutputDirChange,
  onThicknessChange,
  onToleranceChange,
  pickFolder,
}: GlowMakerToolPanelProps) {
  return (
    <>
      <h2 className="tm-tool-title">
        <WandSparkles size={19} />
        Glow Maker
      </h2>
      <p className="desc tm-explainer">
        Generate clean glow sprites from icon primaries and export rebuilt sheets to
        <code> icons/GeneratedGlow/</code>.
      </p>
      <div className="tm-info-chips">
        <span className="chip">AA solid stroke</span>
        <span className="chip">Pure white glow</span>
      </div>
      <div className="tm-form-row tm-form-row-2">
        <label>
          Input directory
          <div className="tm-folder-input">
            <input
              value={inputDir}
              onChange={(event) => onInputDirChange(event.target.value)}
              placeholder="C:/path/to/texturepack"
            />
            <button
              type="button"
              onClick={() =>
                pickFolder((path) => {
                  onInputDirChange(path);
                  if (!outputDir.trim()) {
                    onOutputDirChange(path);
                  }
                })
              }
            >
              <FolderOpen size={15} />
              Browse
            </button>
          </div>
        </label>
        <label>
          Output directory
          <div className="tm-folder-input">
            <input
              value={outputDir}
              onChange={(event) => onOutputDirChange(event.target.value)}
              placeholder="C:/path/to/output"
            />
            <button type="button" onClick={() => pickFolder(onOutputDirChange)}>
              <FolderOpen size={15} />
              Browse
            </button>
          </div>
        </label>
      </div>
      <div className="tm-form-row tm-form-row-2">
        <label className="tm-field-compact">
          Glow thickness (1-128)
          <GlassNumberInput
            value={thickness}
            min={1}
            max={128}
            onChange={onThicknessChange}
          />
        </label>
        <label className="tm-field-compact">
          Alpha tolerance (0-255)
          <GlassNumberInput
            value={tolerance}
            min={0}
            max={255}
            onChange={onToleranceChange}
          />
        </label>
      </div>
    </>
  );
}
