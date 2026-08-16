import { Maximize2, Settings2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  SHIPPED_UPSCALER_MODELS,
  upscalerModelLabelKey,
  type UpscalerModel,
  type UpscalerTargetGraphics,
} from "../../domain/operations";
import { PickFolderFn } from "./types";
import {
  ToolCheckboxField,
  ToolPage,
  ToolPageHeader,
  ToolPathsSection,
  ToolSection,
  ToolSelectField,
} from "./layout";

type UpscalerToolPanelProps = {
  inputDir: string;
  outputDir: string;
  model: UpscalerModel;
  targetGraphics: UpscalerTargetGraphics;
  convertToLatest: boolean;
  gameVersion: string;
  versionOptions: string[];
  onInputDirChange: (value: string) => void;
  onOutputDirChange: (value: string) => void;
  onModelChange: (value: UpscalerModel) => void;
  onTargetGraphicsChange: (value: UpscalerTargetGraphics) => void;
  onConvertToLatestChange: (value: boolean) => void;
  onGameVersionChange: (value: string) => void;
  pickFolder: PickFolderFn;
};

export function UpscalerToolPanel({
  inputDir,
  outputDir,
  model,
  targetGraphics,
  convertToLatest,
  gameVersion,
  versionOptions,
  onInputDirChange,
  onOutputDirChange,
  onModelChange,
  onTargetGraphicsChange,
  onConvertToLatestChange,
  onGameVersionChange,
  pickFolder,
}: UpscalerToolPanelProps) {
  const { t } = useTranslation("tools");

  const showModelPicker = SHIPPED_UPSCALER_MODELS.length > 1;
  const modelOptions = useMemo(
    () =>
      SHIPPED_UPSCALER_MODELS.map((value) => ({
        value,
        label: t(upscalerModelLabelKey(value)),
      })),
    [t],
  );

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
        {showModelPicker ? (
          <ToolSelectField
            label={t("upscaler.model")}
            hint={t("upscaler.modelHint")}
            value={model}
            options={modelOptions}
            onChange={(value) => onModelChange(value as UpscalerModel)}
          />
        ) : null}
        <ToolSelectField
          label={t("upscaler.targetGraphics")}
          hint={t("upscaler.targetHint")}
          value={targetGraphics}
          options={targetOptions}
          onChange={(value) => onTargetGraphicsChange(value as UpscalerTargetGraphics)}
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
