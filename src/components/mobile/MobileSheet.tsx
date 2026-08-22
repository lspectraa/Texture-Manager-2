import { X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { GlassFrost } from "../GlassFrost";

export type MobileSheetSize = "default" | "half";

export type MobileSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional footer actions (sticky above dock clearance). */
  footer?: ReactNode;
  className?: string;
  /** `half` keeps more of the preview visible (inspector / colors). */
  size?: MobileSheetSize;
};

/**
 * Shared bottom sheet for mobile secondary surfaces (inspector, frames, etc.).
 * Desktop callers should not mount this — gate with isMobileShell().
 */
export function MobileSheet({
  open,
  title,
  onClose,
  children,
  footer,
  className = "",
  size = "default",
}: MobileSheetProps) {
  const { t } = useTranslation("navigation");
  const titleId = useId();

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={`tm-mobile-sheet-root${open ? " is-open" : ""}${
        size === "half" ? " tm-mobile-sheet-root--half" : ""
      }${className ? ` ${className}` : ""}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={`tm-mobile-sheet-backdrop${open ? " is-open" : ""}`}
        aria-label={t("mobile.closeDrawerAria")}
        tabIndex={open ? 0 : -1}
        onClick={() => {
          if (open) {
            onClose();
          }
        }}
      />
      <section
        className={`tm-mobile-sheet tm-glass-card${open ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <GlassFrost />
        <header className="tm-mobile-sheet-head">
          <h2 id={titleId} className="tm-mobile-sheet-title">
            {title}
          </h2>
          <button
            type="button"
            className="tm-mobile-sheet-close"
            aria-label={t("mobile.closeDrawerAria")}
            onClick={onClose}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </header>
        <div className="tm-mobile-sheet-body">{children}</div>
        {footer ? <footer className="tm-mobile-sheet-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
