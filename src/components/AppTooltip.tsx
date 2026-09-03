import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type AppTooltipPlacement = "bottom" | "right";

type AppTooltipProps = {
  label: string;
  /** Optional keyboard shortcut shown as a kbd badge in the tooltip. */
  shortcut?: string;
  children: ReactNode;
  className?: string;
  placement?: AppTooltipPlacement;
};

type TooltipCoords = {
  top: number;
  left: number;
  arrow: number;
  side: "bottom" | "top" | "right" | "left";
};

const VIEWPORT_PAD = 8;
const ANCHOR_GAP = 10;
const ARROW_INSET = 14;

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function viewportBox(): { left: number; top: number; right: number; bottom: number } {
  const view = window.visualViewport;
  if (view) {
    return {
      left: view.offsetLeft,
      top: view.offsetTop,
      right: view.offsetLeft + view.width,
      bottom: view.offsetTop + view.height,
    };
  }
  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
}

export function AppTooltip({
  label,
  shortcut,
  children,
  className,
  placement = "bottom",
}: AppTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords>({
    top: 0,
    left: 0,
    arrow: 50,
    side: placement,
  });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const popup = popupRef.current;
    if (!anchor || !popup) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const popupWidth = popup.offsetWidth;
    const popupHeight = popup.offsetHeight;
    if (popupWidth <= 0 || popupHeight <= 0) {
      return;
    }
    const view = viewportBox();
    const minLeft = view.left + VIEWPORT_PAD;
    const minTop = view.top + VIEWPORT_PAD;
    const maxLeft = view.right - VIEWPORT_PAD - popupWidth;
    const maxTop = view.bottom - VIEWPORT_PAD - popupHeight;
    const anchorCenterX = rect.left + rect.width / 2;
    const anchorCenterY = rect.top + rect.height / 2;

    if (placement === "right") {
      const fitsRight = rect.right + ANCHOR_GAP + popupWidth <= view.right - VIEWPORT_PAD;
      const side: TooltipCoords["side"] = fitsRight ? "right" : "left";
      const unclampedLeft =
        side === "right" ? rect.right + ANCHOR_GAP : rect.left - ANCHOR_GAP - popupWidth;
      const left = clamp(unclampedLeft, minLeft, Math.max(minLeft, maxLeft));
      const top = clamp(anchorCenterY - popupHeight / 2, minTop, Math.max(minTop, maxTop));
      const arrow = clamp(anchorCenterY - top, ARROW_INSET, popupHeight - ARROW_INSET);
      setCoords({ top, left, arrow, side });
      return;
    }

    const fitsBelow = rect.bottom + ANCHOR_GAP + popupHeight <= view.bottom - VIEWPORT_PAD;
    const side: TooltipCoords["side"] = fitsBelow ? "bottom" : "top";
    const unclampedTop =
      side === "bottom" ? rect.bottom + ANCHOR_GAP : rect.top - ANCHOR_GAP - popupHeight;
    const top = clamp(unclampedTop, minTop, Math.max(minTop, maxTop));
    const left = clamp(anchorCenterX - popupWidth / 2, minLeft, Math.max(minLeft, maxLeft));
    const arrow = clamp(anchorCenterX - left, ARROW_INSET, popupWidth - ARROW_INSET);
    setCoords({ top, left, arrow, side });
  }, [placement]);

  const showTip = useCallback(() => {
    if (!label) {
      return;
    }
    setVisible(true);
  }, [label]);

  const hideTip = useCallback(() => {
    setVisible(false);
    setPlaced(false);
  }, []);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    updatePosition();
    setPlaced(true);
  }, [label, shortcut, updatePosition, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const syncPosition = (): void => {
      updatePosition();
    };
    window.addEventListener("scroll", syncPosition, true);
    window.addEventListener("resize", syncPosition);
    window.visualViewport?.addEventListener("resize", syncPosition);
    window.visualViewport?.addEventListener("scroll", syncPosition);
    return () => {
      window.removeEventListener("scroll", syncPosition, true);
      window.removeEventListener("resize", syncPosition);
      window.visualViewport?.removeEventListener("resize", syncPosition);
      window.visualViewport?.removeEventListener("scroll", syncPosition);
    };
  }, [updatePosition, visible]);

  const popupStyle: CSSProperties = {
    top: coords.top,
    left: coords.left,
    visibility: placed ? "visible" : "hidden",
    ["--tm-tooltip-arrow" as string]: `${coords.arrow}px`,
  };

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
            ref={popupRef}
            className={`tm-app-tooltip-popup tm-app-tooltip-popup--${coords.side}${
              shortcut ? " tm-app-tooltip-popup--with-shortcut" : ""
            }`}
            role="tooltip"
            style={popupStyle}
          >
            <span className="tm-app-tooltip-label">{label}</span>
            {shortcut ? (
              <kbd className="tm-app-tooltip-shortcut">{shortcut}</kbd>
            ) : null}
          </span>,
          document.body,
        )}
    </>
  );
}
