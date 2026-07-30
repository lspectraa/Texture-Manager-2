import { useEffect, useRef, useState } from "react";
import { Eye, FileImage, Palette, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { getGlowMakerPreviewDataUrl } from "../../services/tauriGlowMaker";
import { isTauriRuntime } from "../../services/tauriOperations";
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
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [customIconPlistPath, setCustomIconPlistPath] = useState("");
  const previewGenRef = useRef(0);
  const refreshPendingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const gen = ++previewGenRef.current;
    const refresh = refreshPendingRef.current;
    refreshPendingRef.current = false;
    setPreviewLoading(true);
    setPreviewError(null);

    const timer = window.setTimeout(() => {
      getGlowMakerPreviewDataUrl({
        thickness,
        tolerance,
        rainbowGlow,
        compositeLayers,
        refresh,
        iconPlistPath: customIconPlistPath || null,
      })
        .then((result) => {
          if (!alive || gen !== previewGenRef.current) return;
          if (result && "dataUrl" in result) {
            setPreviewSrc(result.dataUrl);
            setPreviewError(null);
          } else if (result && "error" in result) {
            setPreviewSrc(null);
            setPreviewError(result.error);
          } else {
            setPreviewSrc(null);
            setPreviewError(t("glowMaker.previewError"));
          }
        })
        .catch(() => {
          if (!alive || gen !== previewGenRef.current) return;
          setPreviewSrc(null);
          setPreviewError(t("glowMaker.previewError"));
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
  }, [
    thickness,
    tolerance,
    rainbowGlow,
    compositeLayers,
    previewRefreshKey,
    customIconPlistPath,
    t,
  ]);

  const refreshPreviewIcon = (): void => {
    if (customIconPlistPath) {
      setPreviewRefreshKey((key) => key + 1);
      return;
    }
    refreshPendingRef.current = true;
    setPreviewRefreshKey((key) => key + 1);
  };

  const pickCustomIcon = async (): Promise<void> => {
    if (!isTauriRuntime()) return;
    try {
      const selected = await open({
        title: t("glowMaker.customIconDialogTitle"),
        filters: [
          { name: t("glowMaker.customIconPlistFilter"), extensions: ["plist"] },
        ],
        multiple: false,
        directory: false,
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      setCustomIconPlistPath(selected);
    } catch {
      // Dialog cancelled / unavailable — keep current icon.
    }
  };

  const clearCustomIcon = (): void => {
    setCustomIconPlistPath("");
    refreshPendingRef.current = true;
    setPreviewRefreshKey((key) => key + 1);
  };

  const hasCustomIcon = Boolean(customIconPlistPath.trim());

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
          <div className="tm-glow-preview-actions">
            <button
              type="button"
              className="tm-glow-preview-action"
              onClick={refreshPreviewIcon}
              disabled={previewLoading || hasCustomIcon}
              title={
                hasCustomIcon
                  ? t("glowMaker.refreshPreviewDisabledCustom")
                  : undefined
              }
            >
              <RefreshCw size={14} aria-hidden />
              {t("glowMaker.refreshPreview")}
            </button>
            <button
              type="button"
              className="tm-glow-preview-action"
              onClick={() => void pickCustomIcon()}
              disabled={previewLoading}
              title={t("glowMaker.customIconHint")}
            >
              <FileImage size={14} aria-hidden />
              {t("glowMaker.customIcon")}
            </button>
            {hasCustomIcon ? (
              <button
                type="button"
                className="tm-glow-preview-action"
                onClick={clearCustomIcon}
                disabled={previewLoading}
                title={t("glowMaker.clearCustomIcon")}
              >
                <X size={14} aria-hidden />
                {t("glowMaker.clearCustomIcon")}
              </button>
            ) : null}
          </div>
          {previewSrc && !previewError ? (
            <img
              className="tm-glow-preview-thumb"
              src={previewSrc}
              alt={t("glowMaker.previewAlt")}
            />
          ) : (
            <span className="tm-glow-preview-status">
              {previewError
                ? previewError
                : t("glowMaker.previewLoading")}
            </span>
          )}
        </div>
      </ToolSection>
    </ToolPage>
  );
}
