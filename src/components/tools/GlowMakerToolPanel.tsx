import { Palette, SlidersHorizontal } from "lucide-react";
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

type GlowMakerToolPanelProps = {
  inputDir: string;
  outputDir: string;
  thickness: number;
  tolerance: number;
  rainbowGlow: boolean;
  compositeLayers: boolean;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onThicknessChange: (value: number) => void;
  onToleranceChange: (value: number) => void;
  onRainbowGlowChange: (value: boolean) => void;
  onCompositeLayersChange: (value: boolean) => void;
  pickFolder: PickFolderFn;
};

export function GlowMakerToolPanel({
  inputDir,
  outputDir,
  thickness,
  tolerance,
  rainbowGlow,
  compositeLayers,
  onInputDirChange,
  onOutputDirChange,
  onThicknessChange,
  onToleranceChange,
  onRainbowGlowChange,
  onCompositeLayersChange,
  pickFolder,
}: GlowMakerToolPanelProps) {
  const { t } = useTranslation("tools");

  return (
    <ToolPage accent="cyan">
      <ToolPageHeader toolId="glowMaker" />
      <ToolPathsSection
        inputDir={inputDir}
        outputDir={outputDir}
        onInputDirChange={onInputDirChange}
        onOutputDirChange={onOutputDirChange}
        pickFolder={pickFolder}
      />
      <ToolSection
        title={t("glowMaker.parameters")}
        subtitle={t("glowMaker.parametersDescription")}
        icon={SlidersHorizontal}
        columns={2}
      >
        <ToolNumberField
          label={t("glowMaker.thickness")}
          hint={t("glowMaker.thicknessRange")}
          value={thickness}
          min={1}
          max={128}
          onChange={onThicknessChange}
        />
        <ToolNumberField
          label={t("glowMaker.outlineAlphaMinimum")}
          hint={t("glowMaker.alphaRange")}
          value={tolerance}
          min={0}
          max={255}
          onChange={onToleranceChange}
        />
      </ToolSection>
      <ToolSection
        title={t("glowMaker.generationMode")}
        subtitle={t("glowMaker.generationModeDescription")}
        icon={Palette}
        columns={2}
      >
        <ToolCheckboxField
          label={t("glowMaker.compositeLayers")}
          checked={compositeLayers}
          onChange={onCompositeLayersChange}
        />
        <ToolCheckboxField
          label={t("glowMaker.rainbowGlow")}
          checked={rainbowGlow}
          onChange={onRainbowGlowChange}
        />
      </ToolSection>
    </ToolPage>
  );
}
