import { Gauge } from "lucide-react";
import { useTranslation } from "react-i18next";
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
        title={t("splitter.performance")}
        subtitle={t("splitter.performanceDescription")}
        icon={Gauge}
      >
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
