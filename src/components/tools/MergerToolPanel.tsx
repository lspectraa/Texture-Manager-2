import { FileOutput, FolderOpen } from "lucide-react";
import { GlassNumberInput } from "../inputs/GlassNumberInput";
import { PickFolderFn } from "./types";

type MergerToolPanelProps = {
  inputDir: string;
  outputDir: string;
  includeOutsideFiles: boolean;
  sheetConcurrency: number;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onIncludeOutsideFilesChange: (value: boolean) => void;
  onSheetConcurrencyChange: (value: number) => void;
  pickFolder: PickFolderFn;
};

export function MergerToolPanel({
  inputDir,
  outputDir,
  includeOutsideFiles,
  sheetConcurrency,
  onInputDirChange,
  onOutputDirChange,
  onIncludeOutsideFilesChange,
  onSheetConcurrencyChange,
  pickFolder,
}: MergerToolPanelProps) {
  return (
    <>
      <h2 className="tm-tool-title">
        <FileOutput size={19} />
        Merger
      </h2>
      <p className="desc tm-explainer">Merge split sprite folders back into plist/png sheets.</p>
      <div className="tm-info-chips">
        <span className="chip">Nested folder support</span>
        <span className="chip">Parallel merge dirs</span>
      </div>
      <div className="tm-form-row tm-form-row-2">
        <label>
          Input directory
          <div className="tm-folder-input">
            <input
              value={inputDir}
              onChange={(event) => onInputDirChange(event.target.value)}
              placeholder="C:/path/to/split/folders"
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
            checked={includeOutsideFiles}
            onChange={(event) => onIncludeOutsideFilesChange(event.target.checked)}
          />
          Include files outside plist (phase 2 compatible flag)
        </label>
        <label className="tm-field-compact">
          Concurrent merge folders (1-64)
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
