import { FolderOpen } from "lucide-react";
import { PickFolderFn } from "../types";
import { ToolField } from "./ToolField";

type FolderPathFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  pickFolder: PickFolderFn;
  placeholder?: string;
  onBrowse?: (path: string) => void;
};

export function FolderPathField({
  label,
  value,
  onChange,
  pickFolder,
  placeholder = "C:/path/to/folder",
  onBrowse,
}: FolderPathFieldProps) {
  return (
    <ToolField label={label}>
      <div className="tm-tool-path-input">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
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
          Browse
        </button>
      </div>
    </ToolField>
  );
}
