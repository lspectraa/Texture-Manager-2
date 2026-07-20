import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  Image,
  RefreshCw,
  RotateCcw,
  Settings2,
  Shuffle,
  Sparkles,
  Download,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  APP_BACKGROUND_RANDOM,
  MAX_APP_BACKGROUND_OPACITY,
  MIN_APP_BACKGROUND_OPACITY,
  type AppBackgroundOption,
} from "../../config/appBackground";
import type {
  AppBackgroundSetting,
  AppLanguage,
  AppSettingsView,
} from "../../domain/settings";
import { APP_LANGUAGES } from "../../i18n/languages";
import { getAppBackgroundImageDataUrl } from "../../services/appBackgroundImages";
import type { AppTheme } from "../../utils/theme";
import { applyTheme, setStoredTheme } from "../../utils/theme";
import { AppSelect, type AppSelectOption } from "../AppSelect";
import { LanguageFlag } from "../LanguageFlag";
import { ThemeStylePicker } from "../ThemeStylePicker";
import { TranslationQualityNotice } from "../TranslationQualityNotice";
import { PickFolderFn } from "./types";
import {
  FolderPathField,
  ToolNumberField,
  ToolPage,
  ToolSection,
} from "./layout";

type SettingsToolPanelProps = {
  settings: AppSettingsView;
  busy: boolean;
  error: string | null;
  appVersion: string;
  updateStatusMessage: string | null;
  updateCheckBusy: boolean;
  operationRunning: boolean;
  onThemeChange: (theme: AppTheme) => void;
  onLanguageChange: (language: AppLanguage) => void;
  onConcurrencyChange: (value: number) => void;
  onAppBackgroundChange: (value: AppBackgroundSetting) => void;
  onAppBackgroundOpacityChange: (value: number) => void;
  onGeometryDashPathSelected: (path: string) => void;
  onClearGeometryDashOverride: () => void;
  onRedetectGeometryDash: () => void;
  onOpenCacheFolder: () => void;
  onResetDefaults: () => void;
  onCheckForUpdates: () => void;
  pickFolder: PickFolderFn;
};

function AppBackgroundThumbnail({
  option,
  alt,
}: {
  option: AppBackgroundOption | undefined;
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!option) {
      setSrc(null);
      return;
    }
    void getAppBackgroundImageDataUrl(option)
      .then((dataUrl) => {
        if (!cancelled) {
          setSrc(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [option]);

  return src ? <img src={src} alt={alt} draggable={false} loading="lazy" /> : null;
}

type StatusChipTone = "success" | "warning" | "danger" | "info" | "neutral";

function StatusChip({
  tone,
  children,
}: {
  tone: StatusChipTone;
  children: ReactNode;
}) {
  return (
    <span className={`tm-status-chip tm-status-chip--${tone}`}>{children}</span>
  );
}

function geometryDashStatus(
  settings: AppSettingsView,
  t: (key: string) => string,
): {
  tone: StatusChipTone;
  label: string;
} {
  if (!settings.geometryDashFound) {
    return { tone: "danger", label: t("geometryDash.notFound") };
  }
  if (settings.geometryDashOverrideActive) {
    return { tone: "warning", label: t("geometryDash.manualOverride") };
  }
  return { tone: "success", label: t("geometryDash.autoDetected") };
}

export function SettingsToolPanel({
  settings,
  busy,
  error,
  appVersion,
  updateStatusMessage,
  updateCheckBusy,
  operationRunning,
  onThemeChange,
  onLanguageChange,
  onConcurrencyChange,
  onAppBackgroundChange,
  onAppBackgroundOpacityChange,
  onGeometryDashPathSelected,
  onClearGeometryDashOverride,
  onRedetectGeometryDash,
  onOpenCacheFolder,
  onResetDefaults,
  onCheckForUpdates,
  pickFolder,
}: SettingsToolPanelProps) {
  const { t } = useTranslation("settings");
  const [draftPath, setDraftPath] = useState(
    settings.geometryDashResolved || settings.geometryDashDetected || "",
  );

  useEffect(() => {
    setDraftPath(
      settings.geometryDashResolved || settings.geometryDashDetected || "",
    );
  }, [settings.geometryDashResolved, settings.geometryDashDetected]);

  const gdStatus = geometryDashStatus(settings, t);

  const languageOptions = useMemo<AppSelectOption<AppLanguage>[]>(
    () =>
      APP_LANGUAGES.map((language) => ({
        value: language.code,
        label: language.nativeName,
        description:
          language.englishName === language.nativeName
            ? undefined
            : language.englishName,
        leading: <LanguageFlag code={language.code} size={22} />,
      })),
    [],
  );

  const handleThemeChange = (theme: AppTheme) => {
    applyTheme(theme);
    setStoredTheme(theme);
    onThemeChange(theme);
  };

  return (
    <ToolPage accent="sky" wide>
      <header className="tm-settings-hero">
        <div className="tm-settings-hero-main">
          <span className="tm-settings-hero-icon" aria-hidden>
            <Settings2 size={22} strokeWidth={1.75} />
          </span>
          <div className="tm-settings-hero-copy">
            <h2 className="tm-settings-hero-title">{t("title")}</h2>
            <p className="tm-settings-hero-desc">{t("description")}</p>
          </div>
        </div>
        <div className="tm-settings-hero-chips" aria-label={t("statusAria")}>
          <StatusChip tone="info">v{appVersion}</StatusChip>
          <StatusChip tone={settings.theme === "light" ? "info" : "neutral"}>
            {t("themeChip", {
              theme: t(`common:${settings.theme}`),
            })}
          </StatusChip>
          <StatusChip tone="info">
            <Gauge size={12} strokeWidth={2.2} aria-hidden />
            {t("concurrentChip", {
              count: settings.defaultSheetConcurrency,
            })}
          </StatusChip>
          <StatusChip tone={gdStatus.tone}>
            {gdStatus.tone === "success" ? (
              <CheckCircle2 size={12} strokeWidth={2.2} aria-hidden />
            ) : null}
            {t("gdChip", { status: gdStatus.label })}
          </StatusChip>
        </div>
      </header>

      {error ? (
        <p className="tm-tool-inline-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="tm-settings-layout">
        <ToolSection
          title={t("appearance.title")}
          subtitle={t("appearance.subtitle")}
          icon={Sparkles}
          className="tm-settings-section-appearance"
        >
          <ThemeStylePicker
            value={settings.theme}
            onChange={handleThemeChange}
            variant="settings"
            showTitle={false}
          />

          <div className="tm-tool-field tm-settings-background-field">
            <span className="tm-tool-field-label">
              <Image size={14} strokeWidth={1.9} aria-hidden />
              {t("background.label")}
            </span>
            <div
              className="tm-settings-background-grid"
              role="radiogroup"
              aria-label={t("background.aria")}
            >
              <button
                type="button"
                className={`tm-settings-background-tile${
                  settings.appBackground === APP_BACKGROUND_RANDOM
                    ? " is-selected"
                    : ""
                }`}
                role="radio"
                aria-checked={settings.appBackground === APP_BACKGROUND_RANDOM}
                disabled={busy}
                onClick={() => onAppBackgroundChange(APP_BACKGROUND_RANDOM)}
              >
                <span className="tm-settings-background-preview">
                  <AppBackgroundThumbnail
                    option={settings.availableAppBackgrounds[0]}
                    alt=""
                  />
                  <span className="tm-settings-background-random-icon" aria-hidden>
                    <Shuffle size={18} strokeWidth={2.2} />
                  </span>
                </span>
                <span className="tm-settings-background-name">
                  {t("background.random")}
                </span>
                <span className="tm-settings-background-meta">
                  {t("background.defaultMeta")}
                </span>
              </button>
              {settings.availableAppBackgrounds.map((bg) => {
                const selected = settings.appBackground === bg.id;
                return (
                  <button
                    type="button"
                    className={`tm-settings-background-tile${
                      selected ? " is-selected" : ""
                    }`}
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    key={bg.id}
                    onClick={() => onAppBackgroundChange(bg.id)}
                  >
                    <span className="tm-settings-background-preview">
                      <AppBackgroundThumbnail option={bg} alt="" />
                    </span>
                    <span className="tm-settings-background-name">{bg.label}</span>
                  </button>
                );
              })}
            </div>
            {settings.availableAppBackgrounds.length === 0 ? (
              <p className="tm-tool-section-note">
                {t("background.noneFound")}
              </p>
            ) : null}
            <label className="tm-settings-background-opacity">
              <span>
                {t("background.opacity")}
                <output>{Math.round(settings.appBackgroundOpacity * 100)}%</output>
              </span>
              <input
                type="range"
                className="tm-settings-opacity-slider"
                min={MIN_APP_BACKGROUND_OPACITY * 100}
                max={MAX_APP_BACKGROUND_OPACITY * 100}
                step={5}
                value={Math.round(settings.appBackgroundOpacity * 100)}
                disabled={busy || settings.availableAppBackgrounds.length === 0}
                onChange={(event) =>
                  onAppBackgroundOpacityChange(Number(event.target.value) / 100)
                }
              />
            </label>
          </div>

        </ToolSection>

        <div className="tm-settings-side-stack">
          <ToolSection
            title={t("language.title")}
            subtitle={t("language.subtitle")}
            icon={Globe}
            className="tm-settings-section-language"
          >
            <div className="tm-tool-field tm-settings-language-field">
              <span className="tm-tool-field-label">
                {t("language.label")}
              </span>
              <AppSelect
                className="tm-settings-language-select"
                size="md"
                value={settings.language}
                options={languageOptions}
                disabled={busy}
                aria-label={t("language.aria")}
                onChange={onLanguageChange}
              />
            </div>
            <TranslationQualityNotice variant="inline" />
          </ToolSection>

          <ToolSection
            title={t("performance.title")}
            subtitle={t("performance.subtitle")}
            icon={Gauge}
          >
            <ToolNumberField
              label={t("performance.concurrentGamesheets")}
              hint={t("performance.rangeHint")}
              value={settings.defaultSheetConcurrency}
              min={1}
              max={64}
              onChange={onConcurrencyChange}
            />
          </ToolSection>

          <ToolSection
            title={t("cache.title")}
            subtitle={t("cache.subtitle")}
            icon={HardDrive}
          >
            <div className="tm-settings-path-stack">
              <div className="tm-tool-field">
                <span className="tm-tool-field-label">
                  {t("cache.gameFilesRoot")}
                </span>
                <input
                  className="tm-tool-text-input"
                  value={settings.gameFilesRoot}
                  readOnly
                />
              </div>
              <div className="tm-tool-field">
                <span className="tm-tool-field-label">
                  {t("cache.splitCache")}
                </span>
                <input
                  className="tm-tool-text-input"
                  value={settings.splitCacheDir}
                  readOnly
                />
              </div>
            </div>
            <div className="tm-settings-actions">
              <button
                type="button"
                className="tm-settings-action-btn"
                disabled={busy || !settings.gameFilesRoot}
                onClick={onOpenCacheFolder}
              >
                <FolderOpen size={14} strokeWidth={1.9} />
                {t("cache.openCacheFolder")}
              </button>
              <button
                type="button"
                className="tm-settings-action-btn"
                disabled={busy}
                onClick={onResetDefaults}
              >
                <RotateCcw size={14} strokeWidth={1.9} />
                {t("cache.resetDefaults")}
              </button>
            </div>
          </ToolSection>

          <ToolSection
            title={t("updates.title")}
            subtitle={t("updates.subtitle")}
            icon={Download}
          >
            <div className="tm-settings-actions">
              <button
                type="button"
                className="tm-settings-action-btn"
                disabled={busy || updateCheckBusy || operationRunning}
                onClick={onCheckForUpdates}
              >
                <RefreshCw size={14} strokeWidth={1.9} />
                {updateCheckBusy
                  ? t("updates.checking")
                  : t("updates.checkForUpdates")}
              </button>
            </div>
            {operationRunning ? (
              <p className="tm-tool-section-note">{t("updates.installBlocked")}</p>
            ) : null}
            {updateStatusMessage ? (
              <p className="tm-tool-section-note">{updateStatusMessage}</p>
            ) : null}
          </ToolSection>

          <ToolSection
            title={t("geometryDash.title")}
            subtitle={t("geometryDash.subtitle")}
            icon={HardDrive}
            className="tm-settings-section-gd"
          >
            <div className="tm-settings-gd-status">
              <StatusChip tone={gdStatus.tone}>{gdStatus.label}</StatusChip>
              {settings.geometryDashOverrideActive ? (
                <StatusChip tone="warning">
                  {t("geometryDash.overrideActive")}
                </StatusChip>
              ) : null}
              {settings.geometryDashDetected ? (
                <StatusChip tone="neutral">
                  {t("geometryDash.detectedPathAvailable")}
                </StatusChip>
              ) : (
                <StatusChip tone="danger">
                  {t("geometryDash.noAutoDetect")}
                </StatusChip>
              )}
            </div>

            <FolderPathField
              label={t("geometryDash.installLocation")}
              value={draftPath}
              onChange={setDraftPath}
              pickFolder={pickFolder}
              placeholder="C:/Program Files (x86)/Steam/steamapps/common/Geometry Dash"
              onBrowse={(path) => {
                setDraftPath(path);
                onGeometryDashPathSelected(path);
              }}
            />

            {!settings.geometryDashDetected ? (
              <p className="tm-settings-meta-path">
                {t("geometryDash.browseHint")}
              </p>
            ) : null}

            <div className="tm-settings-actions">
              <button
                type="button"
                className="tm-settings-action-btn"
                disabled={busy || !draftPath.trim()}
                onClick={() => onGeometryDashPathSelected(draftPath.trim())}
              >
                <FolderOpen size={14} strokeWidth={1.9} />
                {t("geometryDash.applyPath")}
              </button>
              <button
                type="button"
                className="tm-settings-action-btn"
                disabled={busy || !settings.geometryDashOverrideActive}
                onClick={onClearGeometryDashOverride}
              >
                <RotateCcw size={14} strokeWidth={1.9} />
                {t("geometryDash.clearOverride")}
              </button>
              <button
                type="button"
                className="tm-settings-action-btn"
                disabled={busy}
                onClick={onRedetectGeometryDash}
              >
                <RefreshCw size={14} strokeWidth={1.9} />
                {t("geometryDash.redetect")}
              </button>
            </div>
          </ToolSection>
        </div>
      </div>
    </ToolPage>
  );
}
