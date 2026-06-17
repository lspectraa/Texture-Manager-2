import { Settings2 } from "lucide-react";
import { PickFolderFn } from "./types";
import {
  ToolCheckboxField,
  ToolNumberField,
  ToolPage,
  ToolPageHeader,
  ToolPathsSection,
  ToolSection,
} from "./layout";

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
    <ToolPage accent="sky">
      <ToolPageHeader toolId="merger" />
      <ToolPathsSection
        inputDir={inputDir}
        outputDir={outputDir}
        onInputDirChange={onInputDirChange}
        onOutputDirChange={onOutputDirChange}
        pickFolder={pickFolder}
        inputPlaceholder="C:/path/to/split/folders"
      />
      <ToolSection
        title="Merge Options"
        subtitle="Tune merge behavior and throughput"
        icon={Settings2}
        columns={2}
      >
        <ToolCheckboxField
          label="Include files outside plist (phase 2 compatible flag)"
          checked={includeOutsideFiles}
          onChange={onIncludeOutsideFilesChange}
        />
        <ToolNumberField
          label="Concurrent merge folders"
          hint="1–64"
          value={sheetConcurrency}
          min={1}
          max={64}
          onChange={onSheetConcurrencyChange}
        />
      </ToolSection>
    </ToolPage>
  );
}
