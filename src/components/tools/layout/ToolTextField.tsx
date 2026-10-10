import { ToolField } from "./ToolField";

type ToolTextFieldProps = {
  label: string;
  hint?: string;
  className?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function ToolTextField({
  label,
  hint,
  className,
  value,
  onChange,
  placeholder,
}: ToolTextFieldProps) {
  return (
    <ToolField label={label} hint={hint} className={className}>
      <input
        className="tm-tool-text-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </ToolField>
  );
}
