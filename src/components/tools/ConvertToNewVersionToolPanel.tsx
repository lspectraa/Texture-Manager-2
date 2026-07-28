import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("tools");

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
        title={t("convertToNewVersion.versionTarget")}
        subtitle={t("convertToNewVersion.versionTargetDescription")}
        icon={RefreshCw}
        columns={2}
      >
        <ToolSelectField
          label={t("convertToNewVersion.previousGameVersion")}
          value={gameVersion}
          options={versionOptions}
          onChange={onGameVersionChange}
        />
        <ToolNumberField
          label={t("convertToNewVersion.concurrentGamesheets")}
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
