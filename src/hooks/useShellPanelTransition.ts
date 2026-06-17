import { useCallback, useEffect, useRef, useState } from "react";

export const SHELL_PANEL_LAYOUT_MS = 340;
export const SHELL_PANEL_FADE_IN_MS = 520;
export const SHELL_PANEL_FADE_OUT_MS = 280;
export const SHELL_PANEL_FADE_OUT_COLLAPSE_MS = 100;

const SHELL_PANEL_ANIMATION_MS = Math.max(
  SHELL_PANEL_LAYOUT_MS,
  SHELL_PANEL_FADE_IN_MS,
  SHELL_PANEL_FADE_OUT_MS,
);

type UseShellPanelTransitionResult = {
  animating: boolean;
  collapse: () => void;
  expand: () => void;
};

export function useShellPanelTransition(
  setCollapsed: (collapsed: boolean) => void,
): UseShellPanelTransitionResult {
  const [animating, setAnimating] = useState(false);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback((): void => {
    for (const timerId of timersRef.current) {
      window.clearTimeout(timerId);
    }
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const finishAnimation = useCallback((): void => {
    const timerId = window.setTimeout(() => {
      setAnimating(false);
    }, SHELL_PANEL_ANIMATION_MS + 40);
    timersRef.current.push(timerId);
  }, []);

  const collapse = useCallback((): void => {
    clearTimers();
    setAnimating(true);
    setCollapsed(true);
    finishAnimation();
  }, [clearTimers, finishAnimation, setCollapsed]);

  const expand = useCallback((): void => {
    clearTimers();
    setAnimating(true);
    setCollapsed(false);
    finishAnimation();
  }, [clearTimers, finishAnimation, setCollapsed]);

  return { animating, collapse, expand };
}
