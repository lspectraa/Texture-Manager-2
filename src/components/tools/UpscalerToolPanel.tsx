import { Maximize2, Settings2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type UpscalerTargetGraphics } from "../../domain/operations";
import { PickFolderFn } from "./types";
import {
  ToolCheckboxField,
  ToolNumberField,
  ToolPage,
  ToolPageHeader,
  ToolPathsSection,
  ToolSection,
  ToolSelectField,
} from "./layout";

type UpscalerToolPanelProps = {
  inputDir: string;
  outputDir: string;
  targetGraphics: UpscalerTargetGraphics;
  convertToLatest: boolean;
  gameVersion: string;
  versionOptions: string[];
  glowThickness: number;
  glowTolerance: number;
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onTargetGraphicsChange: (value: UpscalerTargetGraphics) => void;
  onConvertToLatestChange: (value: boolean) => void;
  onGameVersionChange: (value: string) => void;
  onGlowThicknessChange: (value: number) => void;
  onGlowToleranceChange: (value: number) => void;
  pickFolder: PickFolderFn;
};

export function UpscalerToolPanel({
  inputDir,
  outputDir,
  targetGraphics,
  convertToLatest,
  gameVersion,
  versionOptions,
  glowThickness,
  glowTolerance,
  onInputDirChange,
  onOutputDirChange,
  onTargetGraphicsChange,
  onConvertToLatestChange,
  onGameVersionChange,
  onGlowThicknessChange,
  onGlowToleranceChange,
  pickFolder,
}: UpscalerToolPanelProps) {
  const { t } = useTranslation("tools");

  const targetOptions = useMemo(
    () => [
      { value: "uhd", label: t("upscaler.targetUhd") },
      { value: "hd", label: t("upscaler.targetHd") },
    ],
    [t],
  );

  return (
    <ToolPage accent="sky">
      <ToolPageHeader toolId="upscaler" />
      <ToolPathsSection
        inputDir={inputDir}
        outputDir={outputDir}
        onInputDirChange={onInputDirChange}
        onOutputDirChange={onOutputDirChange}
        pickFolder={pickFolder}
      />
      <ToolSection
        title={t("upscaler.settings")}
        subtitle={t("upscaler.settingsDescription")}
        icon={Settings2}
        columns={2}
      >
        <ToolSelectField
          label={t("upscaler.targetGraphics")}
          value={targetGraphics}
          options={targetOptions}
          onChange={(value) => onTargetGraphicsChange(value as UpscalerTargetGraphics)}
        />
        <ToolNumberField
          label={t("upscaler.glowLineThickness")}
          hint={t("upscaler.glowLineThicknessHint")}
          value={glowThickness}
          min={1}
          max={128}
          onChange={onGlowThicknessChange}
        />
        <ToolNumberField
          label={t("upscaler.glowAlphaThreshold")}
          hint={t("upscaler.glowAlphaThresholdHint")}
          value={glowTolerance}
          min={0}
          max={255}
          onChange={onGlowToleranceChange}
        />
      </ToolSection>
      <ToolSection
        title={t("upscaler.convertSection")}
        subtitle={t("upscaler.convertSectionDescription")}
        icon={Maximize2}
        columns={1}
      >
        <ToolCheckboxField
          label={t("upscaler.convertToLatest")}
          checked={convertToLatest}
          onChange={onConvertToLatestChange}
        />
        <ToolSelectField
          label={t("upscaler.previousGameVersion")}
          value={gameVersion}
          options={versionOptions.map((value) => ({ value, label: value }))}
          onChange={onGameVersionChange}
          disabled={!convertToLatest}
        />
      </ToolSection>
    </ToolPage>
  );
}
