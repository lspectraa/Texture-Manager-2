import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { basenameForDisplay } from "../../../utils/pathDisplay";
import { isMobileShell } from "../../../utils/platform";

type ToolFilePathFieldProps = {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  browseLabel?: string;
  browseIcon?: LucideIcon;
  disabled?: boolean;
  compact?: boolean;
  sandboxImported?: boolean;
  onBrowse: () => void;
};

export function ToolFilePathField({
  label,
  hint,
  value,
  placeholder,
  browseLabel,
  browseIcon: BrowseIcon,
  disabled = false,
  compact,
  sandboxImported = false,
  onBrowse,
}: ToolFilePathFieldProps) {
  const { t } = useTranslation("common");
  const resolvedPlaceholder = placeholder ?? t("selectFile");
  const resolvedBrowseLabel = browseLabel ?? t("browse");
  const mobile = isMobileShell();
  const nameOnly = compact ?? mobile;
  const displayValue = nameOnly
    ? value.trim()
      ? basenameForDisplay(value)
      : resolvedPlaceholder
    : value;
  const showSandboxChip = mobile && sandboxImported && value.trim().length > 0;

  return (
    <label className="tm-tool-field">
      <span className="tm-tool-field-label">
        {label}
        {hint ? <span className="tm-tool-field-hint">{hint}</span> : null}
      </span>
      <div className={`tm-tool-path-input${nameOnly ? " tm-tool-path-input--compact" : ""}`}>
        {nameOnly ? (
          <p className="tm-tool-path-name" title={value || undefined}>
            {showSandboxChip ? (
              <span
                className="tm-tool-path-sandbox-chip"
                title={t("appStorage")}
              >
                {t("appStorage")}
              </span>
            ) : null}
            <span className="tm-tool-path-name-text">{displayValue}</span>
          </p>
        ) : (
          <input
            value={displayValue}
            readOnly
            placeholder={resolvedPlaceholder}
            disabled={disabled}
          />
        )}
        <button
          type="button"
          className="tm-tool-path-browse"
          onClick={onBrowse}
          disabled={disabled}
        >
          {BrowseIcon ? <BrowseIcon size={15} /> : null}
          {resolvedBrowseLabel}
        </button>
      </div>
    </label>
  );
}
