import { Gauge } from "lucide-react";
import { PickFolderFn } from "./types";
import {
  ToolNumberField,
  ToolPage,
  ToolPageHeader,
  ToolPathsSection,
  ToolSection,
} from "./layout";

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
    <ToolPage accent="sky">
      <ToolPageHeader toolId="splitter" />
      <ToolPathsSection
        inputDir={inputDir}
        outputDir={outputDir}
        onInputDirChange={onInputDirChange}
        onOutputDirChange={onOutputDirChange}
        pickFolder={pickFolder}
        inputPlaceholder="C:/path/to/texturepack"
      />
      <ToolSection
        title="Performance"
        subtitle="Control how many gamesheets are processed in parallel"
        icon={Gauge}
      >
        <ToolNumberField
          label="Concurrent gamesheets"
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
