import type { ButtonHTMLAttributes, ReactNode } from "react";
import { GlassFrost } from "../../GlassFrost";
import { isMobileShell } from "../../../utils/platform";

export type ToolGlassActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** Tint behind the frost layer — run (blue) vs output/rail (teal). */
  variant?: "run" | "output";
};

export function ToolGlassActionButton({
  children,
  className = "",
  variant = "run",
  type = "button",
  ...props
}: ToolGlassActionButtonProps) {
  const mobileShell = isMobileShell();
  const variantClass =
    variant === "output" ? "tm-glass-action-btn--output" : "tm-glass-action-btn--run";

  if (!mobileShell) {
    return (
      <button type={type} className={className} {...props}>
        {children}
      </button>
    );
  }

  return (
    <button
      type={type}
      className={`tm-glass-action-btn ${variantClass}${className ? ` ${className}` : ""}`}
      {...props}
    >
      <GlassFrost />
      <span className="tm-glass-action-btn-content">{children}</span>
    </button>
  );
}
