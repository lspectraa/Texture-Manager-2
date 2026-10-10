import { AppSelect, type AppSelectOption } from "../../AppSelect";
import { ToolField } from "./ToolField";

type ToolSelectFieldProps = {
  label: string;
  hint?: string;
  value: string;
  options: readonly string[] | readonly AppSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  selectClassName?: string;
  menuClassName?: string;
};

export function ToolSelectField({
  label,
  hint,
  value,
  options,
  onChange,
  disabled = false,
  className,
  selectClassName,
  menuClassName,
}: ToolSelectFieldProps) {
  const selectOptions: AppSelectOption[] = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

  return (
    <ToolField label={label} hint={hint} className={className}>
      <AppSelect
        value={value}
        options={selectOptions}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
        className={selectClassName}
        menuClassName={menuClassName}
      />
    </ToolField>
  );
}
