import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type SwipeDismissAxis = "horizontal" | "vertical";

export type UseSwipeDismissOptions = {
  enabled: boolean;
  axis: SwipeDismissAxis;
  /** Dismiss when dragging in the positive axis direction (down / right). */
  dismissDirection?: "positive" | "negative";
  thresholdPx?: number;
  maxOffsetPx?: number;
  dragStartPx?: number;
  onDismiss: () => void;
};

const DEFAULT_THRESHOLD = 72;
const DEFAULT_MAX_OFFSET = 280;
const DEFAULT_DRAG_START = 8;

export function useSwipeDismiss({
  enabled,
  axis,
  dismissDirection = "positive",
  thresholdPx = DEFAULT_THRESHOLD,
  maxOffsetPx = DEFAULT_MAX_OFFSET,
  dragStartPx = DEFAULT_DRAG_START,
  onDismiss,
}: UseSwipeDismissOptions) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const syncOffset = useCallback((next: number) => {
    dragOffsetRef.current = next;
    setDragOffset(next);
  }, []);

  const resetDrag = useCallback(() => {
    startX.current = null;
    startY.current = null;
    draggingRef.current = false;
    setDragging(false);
    syncOffset(0);
  }, [syncOffset]);

  const applyMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || startX.current == null || startY.current == null) {
        return;
      }
      const deltaX = event.clientX - startX.current;
      const deltaY = event.clientY - startY.current;
      const raw = axis === "horizontal" ? deltaX : deltaY;
      const directed = dismissDirection === "positive" ? raw : -raw;
      if (!draggingRef.current && directed <= dragStartPx) {
        return;
      }
      if (!draggingRef.current) {
        draggingRef.current = true;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      const pull = Math.max(0, directed);
      syncOffset(Math.min(pull, maxOffsetPx));
    },
    [axis, dismissDirection, dragStartPx, enabled, maxOffsetPx, syncOffset],
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) {
        return;
      }
      const offset = dragOffsetRef.current;
      const wasDragging = draggingRef.current;
      resetDrag();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (wasDragging) {
        event.preventDefault();
        if (offset >= thresholdPx) {
          onDismiss();
        }
      }
    },
    [enabled, onDismiss, resetDrag, thresholdPx],
  );

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) {
        return;
      }
      startX.current = event.clientX;
      startY.current = event.clientY;
      draggingRef.current = false;
      syncOffset(0);
    },
    [enabled, syncOffset],
  );

  const onPointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      applyMove(event);
    },
    [applyMove],
  );

  const onPointerUpCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      finishPointer(event);
    },
    [finishPointer],
  );

  const onPointerCancelCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      resetDrag();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [resetDrag],
  );

  const onClickCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragOffsetRef.current > dragStartPx || draggingRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, [dragStartPx]);

  const style: CSSProperties | undefined =
    enabled && dragging && dragOffset !== 0
      ? axis === "horizontal"
        ? {
            transform: `translateX(${Math.max(0, dragOffset)}px)`,
            transition: "none",
          }
        : {
            transform: `translateY(${Math.max(0, dragOffset)}px)`,
            transition: "none",
          }
      : undefined;

  return {
    dragOffset,
    dragging,
    style,
    captureHandlers: {
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture,
      onPointerCancelCapture,
      onClickCapture,
    },
    handlers: {
      onPointerDown: onPointerDownCapture,
      onPointerMove: onPointerMoveCapture,
      onPointerUp: onPointerUpCapture,
      onPointerCancel: onPointerCancelCapture,
      onClickCapture,
    },
  };
}
