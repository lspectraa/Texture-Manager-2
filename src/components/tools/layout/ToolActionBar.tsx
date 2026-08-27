import type { ReactNode } from "react";
import { GlassFrost } from "../../GlassFrost";

export type ToolActionBarProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Primary tool actions (Run operation, pack metadata, etc.).
 * Glass frost overlay is mobile-only via CSS (`[data-shell="mobile"]`).
 * Design token / class name: `tm-tool-action-bar`.
 */
export function ToolActionBar({ children, className = "" }: ToolActionBarProps) {
  return (
    <div className={`tm-tool-action-bar tm-glass-card${className ? ` ${className}` : ""}`}>
      <GlassFrost />
      {children}
    </div>
  );
}
