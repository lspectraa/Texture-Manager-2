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
  const { t } = useTranslation("tools");

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
        title={t("porter.settings")}
        subtitle={t("porter.settingsDescription")}
        icon={Settings2}
        columns={2}
      >
        <ToolCheckboxField
          label={t("porter.lowGraphics")}
          checked={lowPort}
          onChange={onLowPortChange}
        />
        <ToolNumberField
          label={t("porter.concurrentGamesheetsAndTextures")}
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
