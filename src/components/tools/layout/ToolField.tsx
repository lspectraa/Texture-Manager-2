import type { ReactNode } from "react";

type ToolFieldProps = {
  label: string;
  hint?: string;
  htmlFor?: string;
  compact?: boolean;
  children: ReactNode;
};

export function ToolField({ label, hint, htmlFor, compact = false, children }: ToolFieldProps) {
  return (
    <label
      className={`tm-tool-field${compact ? " tm-tool-field-compact" : ""}`}
      htmlFor={htmlFor}
    >
      <span className="tm-tool-field-label">
        {label}
        {hint ? <span className="tm-tool-field-hint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
