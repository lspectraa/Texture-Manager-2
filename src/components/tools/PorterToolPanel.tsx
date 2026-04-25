import { FolderOpen, GitBranch } from "lucide-react";
import { GlassNumberInput } from "../inputs/GlassNumberInput";
import { PickFolderFn } from "./types";

type PorterToolPanelProps = {
  inputDir: string;
  outputDir: string;
  lowPort: boolean;
  sheetConcurrency: number;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onLowPortChange: (value: boolean) => void;
  onSheetConcurrencyChange: (value: number) => void;
  pickFolder: PickFolderFn;
};

export function PorterToolPanel({
  inputDir,
  outputDir,
  lowPort,
  sheetConcurrency,
  onInputDirChange,
  onOutputDirChange,
  onLowPortChange,
  onSheetConcurrencyChange,
  pickFolder,
}: PorterToolPanelProps) {
  return (
    <>
      <h2 className="tm-tool-title">
        <GitBranch size={19} />
        Porter
      </h2>
      <p className="desc tm-explainer">
        Rebuild sheets at scaled output tiers and copy standalone sprites when no plist pair
        exists.
      </p>
      <div className="tm-info-chips">
        <span className="chip">In-memory split/merge</span>
        <span className="chip">Standalone png copy</span>
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
        <label className="checkbox">
          <input
            type="checkbox"
            checked={lowPort}
            onChange={(event) => onLowPortChange(event.target.checked)}
          />
          Port to Low Graphics
        </label>
        <label className="tm-field-compact">
          Concurrent gamesheets and textures (1-64)
          <GlassNumberInput
            value={sheetConcurrency}
            min={1}
            max={64}
            onChange={onSheetConcurrencyChange}
          />
        </label>
      </div>
    </>
  );
}
