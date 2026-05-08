import { FolderOpen, Shuffle } from "lucide-react";
import { PickFolderFn } from "./types";

type RandomizerToolPanelProps = {
  inputDir: string;
  outputDir: string;
  seed: string;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onSeedChange: (value: string) => void;
  pickFolder: PickFolderFn;
};

export function RandomizerToolPanel({
  inputDir,
  outputDir,
  seed,
  onInputDirChange,
  onOutputDirChange,
  onSeedChange,
  pickFolder,
}: RandomizerToolPanelProps) {
  return (
    <>
      <h2 className="tm-tool-title">
        <Shuffle size={19} />
        Randomizer
      </h2>
      <p className="desc tm-explainer">
        Randomize icon sheets and selected standalone sprites with a reproducible seed.
      </p>
      <div className="tm-info-chips">
        <span className="chip">Deterministic seed mode</span>
        <span className="chip">Writes to Randomized/</span>
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
        <label>
          Seed (optional)
          <input
            value={seed}
            onChange={(event) => onSeedChange(event.target.value)}
            placeholder="Leave blank for random seed"
          />
        </label>
      </div>
    </>
  );
}
