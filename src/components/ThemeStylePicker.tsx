import { useTranslation } from "react-i18next";
import type { AppTheme } from "../utils/theme";

export type ThemeStylePickerProps = {
  value: AppTheme;
  onChange: (theme: AppTheme) => void;
  disabled?: boolean;
  /**
   * `settings` — compact embed in Settings.
   * `onboarding` — larger “Pick your style” first-run layout (reusable later).
   */
  variant?: "settings" | "onboarding";
  /** Override heading; defaults by variant. */
  title?: string;
  showTitle?: boolean;
  className?: string;
};

type ThemeOption = {
  id: AppTheme;
  labelKey: "light" | "dark";
};

const THEME_OPTIONS: ThemeOption[] = [
  { id: "light", labelKey: "light" },
  { id: "dark", labelKey: "dark" },
];

function ThemeMiniPreview({ theme }: { theme: AppTheme }) {
  return (
    <div
      className="tm-theme-mini-preview"
      data-preview-theme={theme}
      aria-hidden
    >
      <div className="tm-theme-mini-preview-shell">
        <aside className="tm-theme-mini-preview-sidebar">
          <span className="tm-theme-mini-preview-brand" />
          <span className="tm-theme-mini-preview-nav active">
            <span className="tm-theme-mini-preview-nav-icon" />
            <span className="tm-theme-mini-preview-nav-line" />
          </span>
          <span className="tm-theme-mini-preview-nav cyan">
            <span className="tm-theme-mini-preview-nav-icon" />
            <span className="tm-theme-mini-preview-nav-line" />
          </span>
          <span className="tm-theme-mini-preview-nav amber">
            <span className="tm-theme-mini-preview-nav-icon" />
            <span className="tm-theme-mini-preview-nav-line short" />
          </span>
        </aside>
        <div className="tm-theme-mini-preview-main">
          <span className="tm-theme-mini-preview-eyebrow" />
          <span className="tm-theme-mini-preview-heading" />
          <span className="tm-theme-mini-preview-copy" />
          <span className="tm-theme-mini-preview-panel">
            <span className="tm-theme-mini-preview-card featured" />
            <span className="tm-theme-mini-preview-card" />
            <span className="tm-theme-mini-preview-card amber" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function ThemeStylePicker({
  value,
  onChange,
  disabled = false,
  variant = "settings",
  title,
  showTitle,
  className,
}: ThemeStylePickerProps) {
  const { t } = useTranslation("common");
  const resolvedShowTitle =
    showTitle ?? (variant === "onboarding" ? true : false);
  const resolvedTitle =
    title ??
    (variant === "onboarding"
      ? t("onboarding:pickYourStyle")
      : t("settings:theme"));

  return (
    <div
      className={[
        "tm-theme-style-picker",
        `tm-theme-style-picker--${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {resolvedShowTitle ? (
        <div className="tm-theme-style-picker-head">
          {variant === "onboarding" ? (
            <span className="tm-theme-style-picker-brand" aria-hidden>
              <img src="/app-icon.png" alt="" width={40} height={40} />
            </span>
          ) : null}
          <h3 className="tm-theme-style-picker-title">{resolvedTitle}</h3>
        </div>
      ) : null}

      <div
        className="tm-theme-style-picker-grid"
        role="radiogroup"
        aria-label={resolvedTitle}
      >
        {THEME_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              className={`tm-theme-style-card${selected ? " selected" : ""}`}
              data-theme-option={option.id}
              onClick={() => onChange(option.id)}
            >
              <div className="tm-theme-style-card-frame">
                <ThemeMiniPreview theme={option.id} />
              </div>
              <span className="tm-theme-style-card-label">
                {t(option.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
