import { useEffect, useState, type ReactNode } from "react";
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
} from "lucide-react";
import { APP_VERSION } from "../../config/appMeta";
import {
  APP_BACKGROUND_RANDOM,
  MAX_APP_BACKGROUND_OPACITY,
  MIN_APP_BACKGROUND_OPACITY,
  type AppBackgroundOption,
} from "../../config/appBackground";
import type { AppBackgroundSetting, AppSettingsView } from "../../domain/settings";
import { getAppBackgroundImageDataUrl } from "../../services/appBackgroundImages";
import type { AppTheme } from "../../utils/theme";
import { applyTheme, setStoredTheme } from "../../utils/theme";
import { ThemeStylePicker } from "../ThemeStylePicker";
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
  onThemeChange: (theme: AppTheme) => void;
  onConcurrencyChange: (value: number) => void;
  onAppBackgroundChange: (value: AppBackgroundSetting) => void;
  onAppBackgroundOpacityChange: (value: number) => void;
  onGeometryDashPathSelected: (path: string) => void;
  onClearGeometryDashOverride: () => void;
  onRedetectGeometryDash: () => void;
  onOpenCacheFolder: () => void;
  onResetDefaults: () => void;
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
    void getAppBackgroundImageDataUrl(option.id)
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

  return src ? <img src={src} alt={alt} draggable={false} /> : null;
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

function geometryDashStatus(settings: AppSettingsView): {
  tone: StatusChipTone;
  label: string;
} {
  if (!settings.geometryDashFound) {
    return { tone: "danger", label: "Not found" };
  }
  if (settings.geometryDashOverrideActive) {
    return { tone: "warning", label: "Manual override" };
  }
  return { tone: "success", label: "Auto-detected" };
}

export function SettingsToolPanel({
  settings,
  busy,
  error,
  onThemeChange,
  onConcurrencyChange,
  onAppBackgroundChange,
  onAppBackgroundOpacityChange,
  onGeometryDashPathSelected,
  onClearGeometryDashOverride,
  onRedetectGeometryDash,
  onOpenCacheFolder,
  onResetDefaults,
  pickFolder,
}: SettingsToolPanelProps) {
  const [draftPath, setDraftPath] = useState(
    settings.geometryDashResolved || settings.geometryDashDetected || "",
  );

  useEffect(() => {
    setDraftPath(
      settings.geometryDashResolved || settings.geometryDashDetected || "",
    );
  }, [settings.geometryDashResolved, settings.geometryDashDetected]);

  const gdStatus = geometryDashStatus(settings);

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
            <h2 className="tm-settings-hero-title">Settings</h2>
            <p className="tm-settings-hero-desc">
              Global preferences for appearance, install discovery, and tool
              defaults.
            </p>
          </div>
        </div>
        <div className="tm-settings-hero-chips" aria-label="Settings status">
          <StatusChip tone="info">v{APP_VERSION}</StatusChip>
          <StatusChip tone={settings.theme === "light" ? "info" : "neutral"}>
            {settings.theme === "light" ? "Light" : "Dark"} theme
          </StatusChip>
          <StatusChip tone="info">
            <Gauge size={12} strokeWidth={2.2} aria-hidden />
            {settings.defaultSheetConcurrency} concurrent
          </StatusChip>
          <StatusChip tone={gdStatus.tone}>
            {gdStatus.tone === "success" ? (
              <CheckCircle2 size={12} strokeWidth={2.2} aria-hidden />
            ) : null}
            GD {gdStatus.label}
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
          title="Appearance"
          subtitle="Choose a look — same picker will power first-run onboarding"
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
              App background
            </span>
            <div
              className="tm-settings-background-grid"
              role="radiogroup"
              aria-label="App background"
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
                <span className="tm-settings-background-name">Random</span>
                <span className="tm-settings-background-meta">Default</span>
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
                No Geometry Dash game_bg_* images found yet — set a valid GD
                install path to discover them.
              </p>
            ) : null}
            <label className="tm-settings-background-opacity">
              <span>
                Background opacity
                <output>{Math.round(settings.appBackgroundOpacity * 100)}%</output>
              </span>
              <input
                type="range"
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

          <div className="tm-settings-language-row">
            <div className="tm-tool-field tm-settings-language-field">
              <span className="tm-tool-field-label">
                Language
                <StatusChip tone="neutral">Coming soon</StatusChip>
              </span>
              <div className="tm-settings-language">
                <Globe size={15} strokeWidth={1.85} aria-hidden />
                <select
                  className="tm-tool-text-input tm-settings-language-select"
                  value="en"
                  disabled
                  aria-label="Language"
                >
                  <option value="en">English</option>
                  <option value="es" disabled>
                    Español (coming soon)
                  </option>
                  <option value="de" disabled>
                    Deutsch (coming soon)
                  </option>
                </select>
              </div>
            </div>
          </div>
        </ToolSection>

        <div className="tm-settings-side-stack">
          <ToolSection
            title="Performance"
            subtitle="Default sheet concurrency for tools"
            icon={Gauge}
          >
            <ToolNumberField
              label="Default concurrent gamesheets"
              hint="1–64"
              value={settings.defaultSheetConcurrency}
              min={1}
              max={64}
              onChange={onConcurrencyChange}
            />
          </ToolSection>

          <ToolSection
            title="Cache & data"
            subtitle="Local game-files root and split cache"
            icon={HardDrive}
          >
            <div className="tm-settings-path-stack">
              <div className="tm-tool-field">
                <span className="tm-tool-field-label">Game-files root</span>
                <input
                  className="tm-tool-text-input"
                  value={settings.gameFilesRoot}
                  readOnly
                />
              </div>
              <div className="tm-tool-field">
                <span className="tm-tool-field-label">Split cache</span>
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
                Open cache folder
              </button>
              <button
                type="button"
                className="tm-settings-action-btn"
                disabled={busy}
                onClick={onResetDefaults}
              >
                <RotateCcw size={14} strokeWidth={1.9} />
                Reset defaults
              </button>
            </div>
          </ToolSection>

          <ToolSection
            title="Geometry Dash"
            subtitle="Steam install used for vanilla Resources and Geode paths"
            icon={HardDrive}
            className="tm-settings-section-gd"
          >
            <div className="tm-settings-gd-status">
              <StatusChip tone={gdStatus.tone}>{gdStatus.label}</StatusChip>
              {settings.geometryDashOverrideActive ? (
                <StatusChip tone="warning">Override active</StatusChip>
              ) : null}
              {settings.geometryDashDetected ? (
                <StatusChip tone="neutral">Detected path available</StatusChip>
              ) : (
                <StatusChip tone="danger">No auto-detect result</StatusChip>
              )}
            </div>

            <FolderPathField
              label="Install location"
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
                Browse to your Geometry Dash folder, or install via Steam and
                re-detect.
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
                Apply path
              </button>
              <button
                type="button"
                className="tm-settings-action-btn"
                disabled={busy || !settings.geometryDashOverrideActive}
                onClick={onClearGeometryDashOverride}
              >
                <RotateCcw size={14} strokeWidth={1.9} />
                Clear override
              </button>
              <button
                type="button"
                className="tm-settings-action-btn"
                disabled={busy}
                onClick={onRedetectGeometryDash}
              >
                <RefreshCw size={14} strokeWidth={1.9} />
                Re-detect
              </button>
            </div>
          </ToolSection>
        </div>
      </div>
    </ToolPage>
  );
}
