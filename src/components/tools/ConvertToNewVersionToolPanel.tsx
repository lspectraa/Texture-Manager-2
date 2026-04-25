import { useEffect, useRef, useState } from "react";
import { FolderOpen, RefreshCw } from "lucide-react";
import { GlassNumberInput } from "../inputs/GlassNumberInput";
import { PickFolderFn } from "./types";

type ConvertToNewVersionToolPanelProps = {
  inputDir: string;
  outputDir: string;
  gameVersion: string;
  versionOptions: string[];
  sheetConcurrency: number;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onGameVersionChange: (value: string) => void;
  onSheetConcurrencyChange: (value: number) => void;
  pickFolder: PickFolderFn;
};

export function ConvertToNewVersionToolPanel({
  inputDir,
  outputDir,
  gameVersion,
  versionOptions,
  sheetConcurrency,
  onInputDirChange,
  onOutputDirChange,
  onGameVersionChange,
  onSheetConcurrencyChange,
  pickFolder,
}: ConvertToNewVersionToolPanelProps) {
  const [isVersionMenuOpen, setIsVersionMenuOpen] = useState(false);
  const versionMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (!versionMenuRef.current?.contains(event.target as Node)) {
        setIsVersionMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <>
      <h2 className="tm-tool-title">
        <RefreshCw size={19} />
        Convert to New Version
      </h2>
      <p className="desc tm-explainer">
        Split input sheets in memory, compare against latest placeholder plists, and merge only
        newly added frame keys.
      </p>
      <div className="tm-info-chips">
        <span className="chip">Latest plist delta</span>
        <span className="chip">In-memory split</span>
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
          Game version
          <div className="tm-select-wrap" ref={versionMenuRef}>
            <button
              type="button"
              className={`tm-select tm-select-btn ${isVersionMenuOpen ? "open" : ""}`}
              onClick={() => setIsVersionMenuOpen((prev) => !prev)}
            >
              <span>{gameVersion}</span>
              <span className="tm-select-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {isVersionMenuOpen ? (
              <div className="tm-select-menu">
                {versionOptions.map((version) => (
                  <button
                    key={version}
                    type="button"
                    className={`tm-select-option ${version === gameVersion ? "active" : ""}`}
                    onClick={() => {
                      onGameVersionChange(version);
                      setIsVersionMenuOpen(false);
                    }}
                  >
                    {version}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </label>
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
