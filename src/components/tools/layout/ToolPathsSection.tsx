import { FolderInput, FolderOutput } from "lucide-react";
import { PickFolderFn } from "../types";
import { FolderPathField } from "./FolderPathField";
import { ToolSection } from "./ToolSection";

type ToolPathsSectionProps = {
  inputDir: string;
  outputDir: string;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  pickFolder: PickFolderFn;
  inputPlaceholder?: string;
  outputPlaceholder?: string;
  mirrorOutputOnInputBrowse?: boolean;
};

export function ToolPathsSection({
  inputDir,
  outputDir,
  onInputDirChange,
  onOutputDirChange,
  pickFolder,
  inputPlaceholder = "C:/path/to/texturepack",
  outputPlaceholder = "C:/path/to/output",
  mirrorOutputOnInputBrowse = true,
}: ToolPathsSectionProps) {
  return (
    <ToolSection
      title="Source & Output"
      subtitle="Choose where the operation reads from and writes results"
      icon={FolderInput}
      columns={2}
    >
      <FolderPathField
        label="Input directory"
        value={inputDir}
        onChange={onInputDirChange}
        pickFolder={pickFolder}
        placeholder={inputPlaceholder}
        onBrowse={
          mirrorOutputOnInputBrowse
            ? (path) => {
                onInputDirChange(path);
                if (!outputDir.trim()) {
                  onOutputDirChange(path);
                }
              }
            : undefined
        }
      />
      <FolderPathField
        label="Output directory"
        value={outputDir}
        onChange={onOutputDirChange}
        pickFolder={pickFolder}
        placeholder={outputPlaceholder}
      />
      <p className="tm-tool-section-note">
        <FolderOutput size={14} aria-hidden />
        Output stays separate unless you browse input into an empty output path.
      </p>
    </ToolSection>
  );
}
