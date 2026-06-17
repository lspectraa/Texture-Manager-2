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
    <ToolPage accent="sky">
      <ToolPageHeader toolId="porter" />
      <ToolPathsSection
        inputDir={inputDir}
        outputDir={outputDir}
        onInputDirChange={onInputDirChange}
        onOutputDirChange={onOutputDirChange}
        pickFolder={pickFolder}
      />
      <ToolSection
        title="Port Settings"
        subtitle="Choose output tier and parallel processing limits"
        icon={Settings2}
        columns={2}
      >
        <ToolCheckboxField
          label="Port to Low Graphics"
          checked={lowPort}
          onChange={onLowPortChange}
        />
        <ToolNumberField
          label="Concurrent gamesheets and textures"
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
