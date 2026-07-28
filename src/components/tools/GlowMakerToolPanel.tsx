import { useEffect, useRef, useState } from "react";
import { Eye, Palette, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getGlowMakerPreviewDataUrl } from "../../services/tauriGlowMaker";
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

const PREVIEW_DEBOUNCE_MS = 200;

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
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const previewGenRef = useRef(0);
  const refreshPendingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const gen = ++previewGenRef.current;
    const refresh = refreshPendingRef.current;
    refreshPendingRef.current = false;
    setPreviewLoading(true);
    setPreviewError(false);

    const timer = window.setTimeout(() => {
      getGlowMakerPreviewDataUrl({
        thickness,
        tolerance,
        rainbowGlow,
        compositeLayers,
        refresh,
      })
        .then((url) => {
          if (!alive || gen !== previewGenRef.current) return;
          if (url) {
            setPreviewSrc(url);
            setPreviewError(false);
          } else {
            setPreviewError(true);
          }
        })
        .catch(() => {
          if (!alive || gen !== previewGenRef.current) return;
          setPreviewError(true);
        })
        .finally(() => {
          if (!alive || gen !== previewGenRef.current) return;
          setPreviewLoading(false);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [thickness, tolerance, rainbowGlow, compositeLayers, previewRefreshKey]);

  const refreshPreviewIcon = (): void => {
    refreshPendingRef.current = true;
    setPreviewRefreshKey((key) => key + 1);
  };

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
      <ToolSection
        title={t("glowMaker.preview")}
        subtitle={t("glowMaker.previewDescription")}
        icon={Eye}
        columns={1}
      >
        <div
          className={`tm-glow-preview${previewLoading ? " tm-glow-preview--loading" : ""}`}
          aria-busy={previewLoading}
        >
          <button
            type="button"
            className="tm-glow-preview-refresh"
            onClick={refreshPreviewIcon}
            disabled={previewLoading}
          >
            <RefreshCw size={14} aria-hidden />
            {t("glowMaker.refreshPreview")}
          </button>
          {previewSrc && !previewError ? (
            <img
              className="tm-glow-preview-thumb"
              src={previewSrc}
              alt={t("glowMaker.previewAlt")}
            />
          ) : (
            <span className="tm-glow-preview-status">
              {previewError
                ? t("glowMaker.previewError")
                : t("glowMaker.previewLoading")}
            </span>
          )}
        </div>
      </ToolSection>
    </ToolPage>
  );
}
