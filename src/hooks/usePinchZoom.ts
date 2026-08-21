import { useEffect, useRef, type RefObject } from "react";

type UsePinchZoomOptions = {
  enabled: boolean;
  /** Current zoom (read when a pinch gesture starts). */
  zoom: number;
  /** Apply a new zoom value. */
  setZoom: (next: number) => void;
  /** Clamp zoom during the gesture (prefer continuous, no step snap). */
  clamp: (value: number) => number;
  /** Optional snap/clamp when the pinch ends (e.g. 10% steps). Defaults to `clamp`. */
  finalize?: (value: number) => number;
};

function touchDistance(touches: TouchList): number {
  const a = touches.item(0);
  const b = touches.item(1);
  if (!a || !b) {
    return 0;
  }
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Two-finger pinch / spread zoom on a DOM element.
 * Uses non-passive `touchmove` so the page does not steal the gesture.
 */
export function usePinchZoom(
  elementRef: RefObject<HTMLElement | null>,
  { enabled, zoom, setZoom, clamp, finalize }: UsePinchZoomOptions,
): void {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const setZoomRef = useRef(setZoom);
  setZoomRef.current = setZoom;

  const clampRef = useRef(clamp);
  clampRef.current = clamp;

  const finalizeRef = useRef(finalize ?? clamp);
  finalizeRef.current = finalize ?? clamp;

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) {
      return;
    }

    let startDistance = 0;
    let startZoom = 1;

    const onTouchStart = (event: TouchEvent): void => {
      if (event.touches.length !== 2) {
        return;
      }
      startDistance = touchDistance(event.touches);
      startZoom = zoomRef.current;
    };

    const onTouchMove = (event: TouchEvent): void => {
      if (event.touches.length !== 2 || startDistance <= 0) {
        return;
      }
      event.preventDefault();
      const nextDistance = touchDistance(event.touches);
      if (nextDistance <= 0) {
        return;
      }
      const scale = nextDistance / startDistance;
      setZoomRef.current(clampRef.current(startZoom * scale));
    };

    const onTouchEnd = (event: TouchEvent): void => {
      if (event.touches.length >= 2) {
        return;
      }
      if (startDistance > 0) {
        setZoomRef.current(finalizeRef.current(zoomRef.current));
      }
      startDistance = 0;
    };

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd);
    element.addEventListener("touchcancel", onTouchEnd);

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [elementRef, enabled]);
}
