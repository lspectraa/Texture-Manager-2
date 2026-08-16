import { AppSelect, type AppSelectOption } from "../../AppSelect";
import { ToolField } from "./ToolField";

type ToolSelectFieldProps = {
  label: string;
  hint?: string;
  value: string;
  options: readonly string[] | readonly AppSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function ToolSelectField({
  label,
  hint,
  value,
  options,
  onChange,
  disabled = false,
}: ToolSelectFieldProps) {
  const selectOptions: AppSelectOption[] = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

  return (
    <ToolField label={label} hint={hint}>
      <AppSelect
        value={value}
        options={selectOptions}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
    </ToolField>
  );
}
