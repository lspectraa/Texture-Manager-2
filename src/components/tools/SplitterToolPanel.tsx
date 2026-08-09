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

type SplitterToolPanelProps = {
  inputDir: string;
  outputDir: string;
  sheetConcurrency: number;
  skipIcons: boolean;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onSheetConcurrencyChange: (value: number) => void;
  onSkipIconsChange: (value: boolean) => void;
  pickFolder: PickFolderFn;
};

export function SplitterToolPanel({
  inputDir,
  outputDir,
  sheetConcurrency,
  skipIcons,
  onInputDirChange,
  onOutputDirChange,
  onSheetConcurrencyChange,
  onSkipIconsChange,
  pickFolder,
}: SplitterToolPanelProps) {
  const { t } = useTranslation("tools");

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
        title={t("splitter.settings")}
        subtitle={t("splitter.settingsDescription")}
        icon={Settings2}
        columns={2}
      >
        <ToolCheckboxField
          label={t("splitter.skipIcons")}
          checked={skipIcons}
          onChange={onSkipIconsChange}
        />
        <ToolNumberField
          label={t("splitter.concurrentGamesheets")}
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
