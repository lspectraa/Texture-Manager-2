import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  collectHomeSplashTitles,
  HOME_SPLASH_FADE_MS,
  HOME_SPLASH_INTERVAL_MS,
  homeSplashGroupsForDate,
  type HomeSplashGroup,
} from "../utils/homeSplash";

function readSplashGroup(
  t: (key: string, options: { returnObjects: true }) => unknown,
  group: HomeSplashGroup,
): string[] {
  const value = t(`homeScreen.splash.${group}`, { returnObjects: true });
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

/**
 * Rotating home heading (time-of-day splash titles). Shared by the mobile home and the
 * desktop Path home. Rotation pauses under `prefers-reduced-motion`.
 */
export function useHomeSplashTitle(): { title: string; fading: boolean } {
  const { t, i18n } = useTranslation("navigation");
  const titles = useMemo(() => {
    const collected = collectHomeSplashTitles(homeSplashGroupsForDate(new Date()), (group) =>
      readSplashGroup(t, group),
    );
    return collected.length > 0 ? collected : [t("homeScreen.title")];
  }, [i18n.language, t]);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * titles.length));
    setFading(false);
  }, [i18n.language, titles.length]);

  useEffect(() => {
    if (titles.length < 2) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let timeoutId = 0;
    const intervalId = window.setInterval(() => {
      setFading(true);
      timeoutId = window.setTimeout(() => {
        setIndex((current) => (current + 1) % titles.length);
        setFading(false);
      }, HOME_SPLASH_FADE_MS);
    }, HOME_SPLASH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [titles]);

  return { title: titles[index] ?? t("homeScreen.title"), fading };
}
