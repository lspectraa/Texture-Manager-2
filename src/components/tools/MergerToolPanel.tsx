import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("tools");

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
        title={t("merger.options")}
        subtitle={t("merger.optionsDescription")}
        icon={Settings2}
        columns={2}
      >
        <ToolCheckboxField
          label={t("merger.includeOutsidePlist")}
          checked={includeOutsideFiles}
          onChange={onIncludeOutsideFilesChange}
        />
        <ToolNumberField
          label={t("merger.concurrentFolders")}
          hint={t("common.range1To64")}
          value={sheetConcurrency}
          min={1}
          max={64}
          onChange={onSheetConcurrencyChange}
        />
      </ToolSection>
    </ToolPage>
  );
}
