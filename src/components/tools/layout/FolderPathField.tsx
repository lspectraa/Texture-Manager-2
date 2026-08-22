import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  basenameForDisplay,
  shortenPathForDisplay,
} from "../../../utils/pathDisplay";
import { isMobileShell } from "../../../utils/platform";
import { PickFolderFn } from "../types";
import { ToolField } from "./ToolField";

type FolderPathFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  pickFolder: PickFolderFn;
  placeholder?: string;
  onBrowse?: (path: string) => void;
  compact?: boolean;
};

export function FolderPathField({
  label,
  value,
  onChange,
  pickFolder,
  placeholder = "C:/path/to/folder",
  onBrowse,
  compact,
}: FolderPathFieldProps) {
  const { t } = useTranslation("common");
  const nameOnly = compact ?? isMobileShell();
  const displayValue = nameOnly
    ? value.trim()
      ? shortenPathForDisplay(value) || basenameForDisplay(value)
      : t("noFolderSelected")
    : value;

  return (
    <ToolField label={label}>
      <div className={`tm-tool-path-input${nameOnly ? " tm-tool-path-input--compact" : ""}`}>
        {nameOnly ? (
          <p className="tm-tool-path-name" title={value || undefined}>
            {displayValue}
          </p>
        ) : (
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
          />
        )}
        <button
          type="button"
          className="tm-tool-path-browse"
          onClick={() =>
            pickFolder((path) => {
              if (onBrowse) {
                onBrowse(path);
                return;
              }
              onChange(path);
            })
          }
        >
          <FolderOpen size={15} />
          {t("browse")}
        </button>
      </div>
    </ToolField>
  );
}
