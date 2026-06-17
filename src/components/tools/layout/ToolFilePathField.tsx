import type { LucideIcon } from "lucide-react";

type ToolFilePathFieldProps = {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  browseLabel?: string;
  browseIcon?: LucideIcon;
  disabled?: boolean;
  onBrowse: () => void;
};

export function ToolFilePathField({
  label,
  hint,
  value,
  placeholder = "Select file",
  browseLabel = "Browse",
  browseIcon: BrowseIcon,
  disabled = false,
  onBrowse,
}: ToolFilePathFieldProps) {
  return (
    <label className="tm-tool-field">
      <span className="tm-tool-field-label">
        {label}
        {hint ? <span className="tm-tool-field-hint">{hint}</span> : null}
      </span>
      <div className="tm-tool-path-input">
        <input value={value} readOnly placeholder={placeholder} disabled={disabled} />
        <button
          type="button"
          className="tm-tool-path-browse"
          onClick={onBrowse}
          disabled={disabled}
        >
          {BrowseIcon ? <BrowseIcon size={15} /> : null}
          {browseLabel}
        </button>
      </div>
    </label>
  );
}
