import type { ReactNode } from "react";
import { GlassFrost } from "../../GlassFrost";

export type ToolActionBarProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Sticky glass footer for primary tool actions (Run operation, pack metadata, etc.).
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
