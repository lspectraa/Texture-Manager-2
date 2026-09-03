import type { ReactNode } from "react";
import { GlassFrost } from "../../GlassFrost";
import { isMobileShell } from "../../../utils/platform";

export type ToolActionBarProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Primary tool actions (Run operation, pack metadata, etc.).
 * Mobile: glass frost on each action button — no full-width glass plate.
 * Design token / class name: `tm-tool-action-bar`.
 */
export function ToolActionBar({ children, className = "" }: ToolActionBarProps) {
  const mobileShell = isMobileShell();
  return (
    <div
      className={`tm-tool-action-bar${mobileShell ? "" : " tm-glass-card"}${className ? ` ${className}` : ""}`}
    >
      {mobileShell ? null : <GlassFrost />}
      {children}
    </div>
  );
}
