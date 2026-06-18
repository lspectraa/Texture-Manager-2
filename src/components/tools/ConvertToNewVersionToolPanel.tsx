import { RefreshCw } from "lucide-react";
import { PickFolderFn } from "./types";
import {
  ToolNumberField,
  ToolPage,
  ToolPageHeader,
  ToolPathsSection,
  ToolSection,
  ToolSelectField,
} from "./layout";

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
  return (
    <ToolPage accent="amber">
      <ToolPageHeader toolId="convertToNewVersion" />
      <ToolPathsSection
        inputDir={inputDir}
        outputDir={outputDir}
        onInputDirChange={onInputDirChange}
        onOutputDirChange={onOutputDirChange}
        pickFolder={pickFolder}
      />
      <ToolSection
        title="Version Target"
        subtitle="Pick the destination game version and processing concurrency"
        icon={RefreshCw}
        columns={2}
      >
        <ToolSelectField
          label="Game version"
          value={gameVersion}
          options={versionOptions}
          onChange={onGameVersionChange}
        />
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
