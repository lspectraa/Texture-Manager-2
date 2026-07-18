import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type AppTooltipPlacement = "bottom" | "right";

type AppTooltipProps = {
  label: string;
  children: ReactNode;
  className?: string;
  placement?: AppTooltipPlacement;
};

export function AppTooltip({
  label,
  children,
  className,
  placement = "bottom",
}: AppTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (placement === "right") {
      setPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 10,
      });
      return;
    }
    setPosition({
      top: rect.bottom + 10,
      left: rect.left + rect.width / 2,
    });
  }, [placement]);

  const showTip = useCallback(() => {
    if (!label) {
      return;
    }
    updatePosition();
    setVisible(true);
  }, [label, updatePosition]);

  const hideTip = useCallback(() => {
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const syncPosition = (): void => {
      updatePosition();
    };
    window.addEventListener("scroll", syncPosition, true);
    window.addEventListener("resize", syncPosition);
    return () => {
      window.removeEventListener("scroll", syncPosition, true);
      window.removeEventListener("resize", syncPosition);
    };
  }, [updatePosition, visible]);

  return (
    <>
      <span
        ref={anchorRef}
        className={`tm-app-tooltip${className ? ` ${className}` : ""}`}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocusCapture={showTip}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
            return;
          }
          hideTip();
        }}
      >
        {children}
      </span>
      {visible &&
        label &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            className={`tm-app-tooltip-popup tm-app-tooltip-popup--${placement}`}
            role="tooltip"
            style={{ top: position.top, left: position.left }}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
