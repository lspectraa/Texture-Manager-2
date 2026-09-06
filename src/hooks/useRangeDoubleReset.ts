import { useCallback, useRef } from "react";
import type { PointerEvent } from "react";

const TAP_MAX_MS = 450;
const TAP_MAX_DIST_PX = 36;
const DRAG_THRESHOLD_PX = 10;

/**
 * Desktop: double-click resets. Mobile / touch: double-tap without drag resets.
 * Attach returned handlers to a range input.
 */
export function useRangeDoubleReset(onReset: () => void) {
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const gestureRef = useRef({ moved: false, startX: 0, startY: 0 });
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  const reset = useCallback(() => {
    onResetRef.current();
  }, []);

  const onPointerDown = useCallback((event: PointerEvent<HTMLInputElement>) => {
    gestureRef.current = { moved: false, startX: event.clientX, startY: event.clientY };
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLInputElement>) => {
    const gesture = gestureRef.current;
    if (
      Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >
      DRAG_THRESHOLD_PX
    ) {
      gesture.moved = true;
    }
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLInputElement>) => {
      if (gestureRef.current.moved) {
        lastTapRef.current = null;
        return;
      }
      const now = event.timeStamp;
      const last = lastTapRef.current;
      if (
        last &&
        now - last.time < TAP_MAX_MS &&
        Math.hypot(event.clientX - last.x, event.clientY - last.y) < TAP_MAX_DIST_PX
      ) {
        event.preventDefault();
        reset();
        lastTapRef.current = null;
        return;
      }
      lastTapRef.current = { time: now, x: event.clientX, y: event.clientY };
    },
    [reset],
  );

  const onDoubleClick = useCallback(() => {
    reset();
  }, [reset]);

  return { onDoubleClick, onPointerDown, onPointerMove, onPointerUp };
}
