type ToolCheckboxFieldProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function ToolCheckboxField({ label, checked, onChange }: ToolCheckboxFieldProps) {
  return (
    <label className="tm-tool-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="tm-tool-toggle-copy">{label}</span>
    </label>
  );
}
