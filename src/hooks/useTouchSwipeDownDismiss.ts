import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

export type TouchSwipeDirection = "down" | "up";

export type UseTouchSwipeDownDismissOptions = {
  enabled: boolean;
  onDismiss: () => void;
  direction?: TouchSwipeDirection;
  /** When set, swipe is ignored if this element is scrolled (down swipes only). */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Elements matching this selector never start a swipe (e.g. dedicated drag handles). */
  excludeSelector?: string;
  thresholdPx?: number;
  maxOffsetPx?: number;
  dragStartPx?: number;
};

const DEFAULT_THRESHOLD = 72;
const DEFAULT_MAX_OFFSET = 280;
const DEFAULT_DRAG_START = 8;

export function useTouchSwipeDownDismiss({
  enabled,
  onDismiss,
  direction = "down",
  scrollContainerRef,
  excludeSelector,
  thresholdPx = DEFAULT_THRESHOLD,
  maxOffsetPx = DEFAULT_MAX_OFFSET,
  dragStartPx = DEFAULT_DRAG_START,
}: UseTouchSwipeDownDismissOptions) {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const finishTrigger = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    let tracking = false;
    let dragging = false;
    let startY = 0;
    let offset = 0;

    const blockMisclick = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    const shouldTrackSwipe = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node) || !surface.contains(target)) {
        return false;
      }
      if (
        excludeSelector &&
        target instanceof Element &&
        target.closest(excludeSelector)
      ) {
        return false;
      }
      if (direction === "down") {
        const scrollEl = scrollContainerRef?.current;
        if (scrollEl?.contains(target) && scrollEl.scrollTop > 2) {
          return false;
        }
      }
      return true;
    };

    const onTouchStart = (event: TouchEvent): void => {
      if (!shouldTrackSwipe(event.target)) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      tracking = true;
      dragging = false;
      offset = 0;
      startY = touch.clientY;
    };

    const onTouchMove = (event: TouchEvent): void => {
      if (!tracking) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const delta = touch.clientY - startY;
      const directed = direction === "down" ? delta : -delta;
      if (!dragging && directed > dragStartPx) {
        dragging = true;
        setSwiping(true);
      }
      if (!dragging) {
        return;
      }
      event.preventDefault();
      offset = Math.min(Math.max(0, directed), maxOffsetPx);
      setDragOffset(offset);
    };

    const finishTouch = (): void => {
      if (!tracking) {
        return;
      }
      tracking = false;
      if (dragging) {
        if (offset >= thresholdPx) {
          finishTrigger();
        }
        document.addEventListener("click", blockMisclick, true);
        window.setTimeout(() => {
          document.removeEventListener("click", blockMisclick, true);
        }, 400);
      }
      dragging = false;
      offset = 0;
      setSwiping(false);
      setDragOffset(0);
    };

    surface.addEventListener("touchstart", onTouchStart as EventListener, {
      capture: true,
      passive: true,
    });
    surface.addEventListener("touchmove", onTouchMove as EventListener, {
      capture: true,
      passive: false,
    });
    surface.addEventListener("touchend", finishTouch, { capture: true, passive: true });
    surface.addEventListener("touchcancel", finishTouch, { capture: true, passive: true });
    return () => {
      surface.removeEventListener("touchstart", onTouchStart as EventListener, true);
      surface.removeEventListener("touchmove", onTouchMove as EventListener, true);
      surface.removeEventListener("touchend", finishTouch, true);
      surface.removeEventListener("touchcancel", finishTouch, true);
      document.removeEventListener("click", blockMisclick, true);
    };
  }, [
    direction,
    dragStartPx,
    enabled,
    excludeSelector,
    finishTrigger,
    maxOffsetPx,
    scrollContainerRef,
    thresholdPx,
  ]);

  useEffect(() => {
    if (enabled) {
      return;
    }
    setSwiping(false);
    setDragOffset(0);
  }, [enabled]);

  const style: CSSProperties | undefined =
    enabled && swiping && dragOffset !== 0
      ? {
          transform:
            direction === "down"
              ? `translateY(${Math.max(0, dragOffset)}px)`
              : `translateY(${-Math.max(0, dragOffset)}px)`,
          transition: "none",
        }
      : undefined;

  return {
    surfaceRef,
    swiping,
    dragOffset,
    style,
  };
};
