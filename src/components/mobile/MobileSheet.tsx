import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useTouchSwipeDownDismiss } from "../../hooks/useTouchSwipeDownDismiss";
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
  /**
   * When false, the dimming layer is omitted so a parent can own a shared
   * backdrop (Icon Editor tab switches).
   */
  showBackdrop?: boolean;
  /** Swipe down anywhere on the sheet to dismiss (mobile WebView touch). */
  swipeToDismiss?: boolean;
};

const SHEET_EXIT_MS = 360;

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
  showBackdrop = true,
  swipeToDismiss = true,
}: MobileSheetProps) {
  const { t } = useTranslation("navigation");
  const titleId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  const { surfaceRef, swiping, style: swipeStyle } = useTouchSwipeDownDismiss({
    enabled: open && entered && swipeToDismiss,
    onDismiss: onClose,
    scrollContainerRef: bodyRef,
    excludeSelector: ".tm-mobile-sheet-close",
  });

  const setSheetRef = (node: HTMLElement | null): void => {
    sheetRef.current = node;
    surfaceRef.current = node;
  };

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    setEntered(false);
    return undefined;
  }, [open]);

  // Unmount after close animation; timeout covers reduced-motion / missed events.
  useEffect(() => {
    if (open || entered || !mounted) {
      return;
    }
    const timeout = window.setTimeout(() => setMounted(false), SHEET_EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [entered, mounted, open]);

  const onSheetTransitionEnd = (event: TransitionEvent<HTMLElement>): void => {
    if (event.target !== sheetRef.current) {
      return;
    }
    if (event.propertyName !== "transform") {
      return;
    }
    if (!open) {
      setMounted(false);
    }
  };

  if (typeof document === "undefined" || !mounted) {
    return null;
  }

  return createPortal(
    <div
      className={`tm-mobile-sheet-root${entered || open ? " is-open" : ""}${
        size === "half" ? " tm-mobile-sheet-root--half" : ""
      }${showBackdrop ? "" : " tm-mobile-sheet-root--no-backdrop"}${
        swiping ? " is-swiping" : ""
      }${className ? ` ${className}` : ""}`}
      aria-hidden={!open}
    >
      {showBackdrop ? (
        <button
          type="button"
          className={`tm-mobile-sheet-backdrop${entered ? " is-open" : ""}`}
          aria-label={t("mobile.closeDrawerAria")}
          tabIndex={open ? 0 : -1}
          onClick={() => {
            if (open) {
              onClose();
            }
          }}
        />
      ) : null}
      <section
        ref={setSheetRef}
        className={`tm-mobile-sheet tm-glass-card${entered ? " is-open" : ""}${
          swiping ? " is-swiping" : ""
        }`}
        style={swipeStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onTransitionEnd={onSheetTransitionEnd}
      >
        <GlassFrost />
        <div className="tm-mobile-sheet-handle" aria-hidden>
          <span className="tm-mobile-sheet-handle-bar" />
        </div>
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
        <div className="tm-mobile-sheet-body" ref={bodyRef}>
          {children}
        </div>
        {footer ? <footer className="tm-mobile-sheet-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
