import { Dices } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PickFolderFn } from "./types";
import {
  ToolPage,
  ToolPageHeader,
  ToolPathsSection,
  ToolSection,
  ToolTextField,
} from "./layout";

type RandomizerToolPanelProps = {
  inputDir: string;
  outputDir: string;
  seed: string;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onSeedChange: (value: string) => void;
  pickFolder: PickFolderFn;
};

export function RandomizerToolPanel({
  inputDir,
  outputDir,
  seed,
  onInputDirChange,
  onOutputDirChange,
  onSeedChange,
  pickFolder,
}: RandomizerToolPanelProps) {
  const { t } = useTranslation("tools");

  return (
    <ToolPage accent="amber">
      <ToolPageHeader toolId="randomizer" />
      <ToolPathsSection
        inputDir={inputDir}
        outputDir={outputDir}
        onInputDirChange={onInputDirChange}
        onOutputDirChange={onOutputDirChange}
        pickFolder={pickFolder}
      />
      <ToolSection
        title={t("randomizer.section")}
        subtitle={t("randomizer.sectionDescription")}
        icon={Dices}
      >
        <ToolTextField
          label={t("randomizer.seed")}
          hint={t("common:optional")}
          value={seed}
          onChange={onSeedChange}
          placeholder={t("randomizer.seedPlaceholder")}
        />
      </ToolSection>
    </ToolPage>
  );
}
