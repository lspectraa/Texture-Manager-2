import { FolderOpen, Scissors } from "lucide-react";
import { GlassNumberInput } from "../inputs/GlassNumberInput";
import { PickFolderFn } from "./types";

type SplitterToolPanelProps = {
  inputDir: string;
  outputDir: string;
  sheetConcurrency: number;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onSheetConcurrencyChange: (value: number) => void;
  pickFolder: PickFolderFn;
};

export function SplitterToolPanel({
  inputDir,
  outputDir,
  sheetConcurrency,
  onInputDirChange,
  onOutputDirChange,
  onSheetConcurrencyChange,
  pickFolder,
}: SplitterToolPanelProps) {
  return (
    <>
      <h2 className="tm-tool-title">
        <Scissors size={19} />
        Splitter
      </h2>
      <p className="desc tm-explainer">Split paired sheets into sprite files grouped per gamesheet.</p>
      <div className="tm-info-chips">
        <span className="chip">Pair discovery</span>
        <span className="chip">Parallel sheets</span>
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
      <div className="tm-form-row">
        <label className="tm-field-compact">
          Concurrent gamesheets (1-64)
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
