import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FolderOpen,
  Globe,
  RefreshCw,
} from "lucide-react";
import type { AppSettingsView } from "../domain/settings";
import type { AppTheme } from "../utils/theme";
import { applyTheme, setStoredTheme } from "../utils/theme";
import { shortenPathForDisplay } from "../utils/pathDisplay";
import type { PickFolderFn } from "./tools/types";
import { FolderPathField } from "./tools/layout";
import { GlassFrost } from "./GlassFrost";
import { ThemeStylePicker } from "./ThemeStylePicker";

export type OnboardingLanguageOption = {
  id: string;
  label: string;
  available: boolean;
};

const LANGUAGE_OPTIONS: OnboardingLanguageOption[] = [
  { id: "en", label: "English", available: true },
];

type OnboardingStepId = "language" | "theme" | "geometryDash";

const STEPS: OnboardingStepId[] = ["language", "theme", "geometryDash"];

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

export type OnboardingFlowProps = {
  settings: AppSettingsView;
  busy?: boolean;
  error?: string | null;
  pickFolder: PickFolderFn;
  onThemeChange: (theme: AppTheme) => void;
  onGeometryDashPathSelected: (path: string) => void;
  onRedetectGeometryDash: () => void;
  onComplete: (choices: { language: string; theme: AppTheme }) => void;
};

export function OnboardingFlow({
  settings,
  busy = false,
  error = null,
  pickFolder,
  onThemeChange,
  onGeometryDashPathSelected,
  onRedetectGeometryDash,
  onComplete,
}: OnboardingFlowProps) {
  const titleId = useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [language, setLanguage] = useState(
    () => settings.language?.trim() || "en",
  );
  const [theme, setTheme] = useState<AppTheme>(() => settings.theme);
  const [draftPath, setDraftPath] = useState(
    () => settings.geometryDashResolved || settings.geometryDashDetected || "",
  );

  useEffect(() => {
    setDraftPath(
      settings.geometryDashResolved || settings.geometryDashDetected || "",
    );
  }, [settings.geometryDashResolved, settings.geometryDashDetected]);

  const stepId = STEPS[stepIndex] ?? "language";
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const gdStatus = geometryDashStatus(settings);
  const displayPath = useMemo(() => {
    const path =
      settings.geometryDashResolved ||
      settings.geometryDashDetected ||
      draftPath.trim();
    return path ? shortenPathForDisplay(path) : "No install found yet";
  }, [
    draftPath,
    settings.geometryDashDetected,
    settings.geometryDashResolved,
  ]);

  const stepTitle = (() => {
    switch (stepId) {
      case "language":
        return "Choose your language";
      case "theme":
        return "Pick your style";
      case "geometryDash":
        return "Confirm Geometry Dash";
      default: {
        const _exhaustive: never = stepId;
        return _exhaustive;
      }
    }
  })();

  const handleThemeChange = (next: AppTheme) => {
    setTheme(next);
    applyTheme(next);
    setStoredTheme(next);
    onThemeChange(next);
  };

  const goNext = () => {
    if (isLast) {
      onComplete({ language, theme });
      return;
    }
    setStepIndex((index) => Math.min(STEPS.length - 1, index + 1));
  };

  const goBack = () => {
    setStepIndex((index) => Math.max(0, index - 1));
  };

  return (
    <div className="tm-onboarding">
      <div className="tm-onboarding-card tm-glass-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <GlassFrost />

        <header className="tm-onboarding-header">
          <span className="tm-onboarding-brand" aria-hidden>
            <img src="/app-icon.png" alt="" width={44} height={44} />
          </span>
          <h1 id={titleId} className="tm-onboarding-title">
            {stepTitle}
          </h1>
        </header>

        <div className="tm-onboarding-body">
          {stepId === "language" ? (
            <div
              className="tm-onboarding-language-grid"
              role="radiogroup"
              aria-label="Language"
            >
              {LANGUAGE_OPTIONS.map((option) => {
                const selected = language === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!option.available || busy}
                    className={`tm-onboarding-language-card${
                      selected ? " selected" : ""
                    }`}
                    onClick={() => setLanguage(option.id)}
                  >
                    <span className="tm-onboarding-language-icon" aria-hidden>
                      <Globe size={22} strokeWidth={1.85} />
                    </span>
                    <span className="tm-onboarding-language-label">
                      {option.label}
                    </span>
                    {option.available ? (
                      <StatusChip tone="success">Available</StatusChip>
                    ) : (
                      <StatusChip tone="neutral">Coming soon</StatusChip>
                    )}
                  </button>
                );
              })}
              <p className="tm-onboarding-hint">
                More languages will appear here as translations are added.
              </p>
            </div>
          ) : null}

          {stepId === "theme" ? (
            <ThemeStylePicker
              value={theme}
              onChange={handleThemeChange}
              disabled={busy}
              variant="onboarding"
              showTitle={false}
            />
          ) : null}

          {stepId === "geometryDash" ? (
            <div className="tm-onboarding-gd">
              <div className="tm-onboarding-gd-status">
                <StatusChip tone={gdStatus.tone}>{gdStatus.label}</StatusChip>
                {settings.geometryDashOverrideActive ? (
                  <StatusChip tone="warning">Override active</StatusChip>
                ) : null}
              </div>

              <p className="tm-onboarding-gd-path" title={draftPath || undefined}>
                {displayPath}
              </p>

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

              <div className="tm-onboarding-gd-actions">
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
                  disabled={busy}
                  onClick={onRedetectGeometryDash}
                >
                  <RefreshCw size={14} strokeWidth={1.9} />
                  Re-detect
                </button>
              </div>

              {!settings.geometryDashFound ? (
                <p className="tm-onboarding-warning" role="status">
                  Geometry Dash was not found. You can finish setup now and set
                  the install path later in Settings.
                </p>
              ) : (
                <p className="tm-onboarding-hint">
                  <CheckCircle2 size={14} strokeWidth={2.1} aria-hidden />
                  Looks good — this path will be used for game files and tools.
                </p>
              )}
            </div>
          ) : null}

          {error ? (
            <p className="tm-tool-inline-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="tm-onboarding-footer">
          <div className="tm-onboarding-nav">
            <button
              type="button"
              className="tm-onboarding-nav-btn tm-onboarding-nav-btn--ghost"
              disabled={isFirst || busy}
              onClick={goBack}
            >
              <ArrowLeft size={16} strokeWidth={2.1} aria-hidden />
              Back
            </button>
            <button
              type="button"
              className="tm-onboarding-nav-btn tm-onboarding-nav-btn--primary"
              disabled={busy || (stepId === "language" && !language)}
              onClick={goNext}
            >
              {isLast ? "Finish" : "Next"}
              {isLast ? (
                <CheckCircle2 size={16} strokeWidth={2.1} aria-hidden />
              ) : (
                <ArrowRight size={16} strokeWidth={2.1} aria-hidden />
              )}
            </button>
          </div>

          <div
            className="tm-onboarding-progress"
            role="tablist"
            aria-label="Setup progress"
          >
            {STEPS.map((id, index) => {
              const active = index === stepIndex;
              const complete = index < stepIndex;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Step ${index + 1}: ${id}`}
                  className={`tm-onboarding-dot${active ? " is-active" : ""}${
                    complete ? " is-complete" : ""
                  }`}
                  disabled={busy}
                  onClick={() => setStepIndex(index)}
                />
              );
            })}
          </div>
        </footer>
      </div>
    </div>
  );
}
