import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PULL_THRESHOLD_PX = 48;
const PULL_DRAG_START_PX = 6;

export type MobileEdgeTabProps = {
  label: string;
  icon: ReactNode;
  open: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onClose: () => void;
  className?: string;
  ariaControls?: string;
};

export function MobileEdgeTab({
  label,
  icon,
  open,
  disabled = false,
  onOpen,
  onClose,
  className,
  ariaControls,
}: MobileEdgeTabProps) {
  const [pullOffset, setPullOffset] = useState(0);
  const pullOffsetRef = useRef(0);
  const touchStateRef = useRef({ tracking: false, dragging: false, startX: 0 });

  const toggle = useCallback((): void => {
    if (disabled) {
      return;
    }
    if (open) {
      onClose();
    } else {
      onOpen();
    }
  }, [disabled, onClose, onOpen, open]);

  const resetTouch = useCallback((): void => {
    touchStateRef.current = { tracking: false, dragging: false, startX: 0 };
    pullOffsetRef.current = 0;
    setPullOffset(0);
  }, []);

  const onTouchStart = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>): void => {
      if (disabled) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      touchStateRef.current = {
        tracking: true,
        dragging: false,
        startX: touch.clientX,
      };
    },
    [disabled],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>): void => {
      const state = touchStateRef.current;
      if (!state.tracking || disabled) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const deltaX = touch.clientX - state.startX;
      if (!state.dragging && deltaX < -PULL_DRAG_START_PX) {
        state.dragging = true;
      }
      if (!state.dragging) {
        return;
      }
      event.preventDefault();
      const offset = Math.min(Math.max(0, -deltaX), 96);
      pullOffsetRef.current = offset;
      setPullOffset(offset);
    },
    [disabled],
  );

  const onTouchEnd = useCallback((): void => {
    const state = touchStateRef.current;
    if (!state.tracking) {
      return;
    }
    const openedByPull = state.dragging && pullOffsetRef.current >= PULL_THRESHOLD_PX;
    if (openedByPull) {
      onOpen();
      const blockMisclick = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
      };
      document.addEventListener("click", blockMisclick, true);
      window.setTimeout(() => {
        document.removeEventListener("click", blockMisclick, true);
      }, 400);
    }
    resetTouch();
  }, [onOpen, resetTouch]);

  if (typeof document === "undefined") {
    return null;
  }

  const style: CSSProperties | undefined =
    pullOffset > 0
      ? {
          transform: `translateY(-50%) translateX(calc(100% - 38px - ${pullOffset}px))`,
        }
      : undefined;

  return createPortal(
    <button
      type="button"
      className={`tm-mobile-edge-tab${open ? " is-open" : ""}${
        disabled ? " is-disabled" : ""
      }${className ? ` ${className}` : ""}`}
      style={style}
      aria-expanded={open}
      aria-controls={ariaControls}
      disabled={disabled}
      onClick={toggle}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <span className="tm-mobile-edge-tab-icon" aria-hidden>
        {icon}
      </span>
      <span className="tm-mobile-edge-tab-label">{label}</span>
    </button>,
    document.body,
  );
}
