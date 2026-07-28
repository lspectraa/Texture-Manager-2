import { GlassNumberInput } from "../../inputs/GlassNumberInput";
import { ToolField } from "./ToolField";

type ToolNumberFieldProps = {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  compact?: boolean;
};

export function ToolNumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  compact = true,
}: ToolNumberFieldProps) {
  return (
    <ToolField label={label} hint={hint} compact={compact}>
      <GlassNumberInput value={value} min={min} max={max} onChange={onChange} />
    </ToolField>
  );
}
