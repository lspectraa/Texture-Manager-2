import { useEffect, useMemo, useRef, useState } from "react";
import {
  APP_BACKGROUND_RANDOM,
  BACKGROUND_BLEND_MODE,
  resolveAppBackgroundOption,
  type AppBackgroundOption,
} from "../config/appBackground";
import type { AppBackgroundSetting } from "../domain/settings";
import { getAppBackgroundImageDataUrl } from "../services/appBackgroundImages";

type AppGameBackgroundProps = {
  setting: AppBackgroundSetting;
  options: readonly AppBackgroundOption[];
  opacity: number;
};

/**
 * GD `game_bg_*` layer: above gradient orbs, below glass UI.
 * Soft-fails (renders nothing) when GD path is missing or no backgrounds exist.
 */
export function AppGameBackground({
  setting,
  options,
  opacity,
}: AppGameBackgroundProps) {
  // Session-stable random pick: keep the same id until reload or the list changes.
  const sessionRandomIdRef = useRef<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const resolved = useMemo(() => {
    const option = resolveAppBackgroundOption(
      setting,
      options,
      sessionRandomIdRef.current,
    );
    if (setting === APP_BACKGROUND_RANDOM && option) {
      sessionRandomIdRef.current = option.id;
    }
    return option;
  }, [setting, options]);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      if (!resolved) {
        setImageUrl(null);
        return;
      }

      try {
        const dataUrl = await getAppBackgroundImageDataUrl(resolved.id);
        if (!cancelled) {
          setImageUrl(dataUrl);
        }
      } catch {
        if (!cancelled) {
          setImageUrl(null);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [resolved?.id]);

  if (!imageUrl) {
    return null;
  }

  return (
    <img
      className="tm-bg-game"
      src={imageUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ mixBlendMode: BACKGROUND_BLEND_MODE, opacity }}
      onError={() => setImageUrl(null)}
    />
  );
}
