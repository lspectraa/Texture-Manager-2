import { useMemo, useState } from "react";
import {
  parseShellBackdropOverride,
  resolveShellBackdropMode,
  type AppBackgroundOption,
} from "../config/appBackground";
import type { AppBackgroundSetting } from "../domain/settings";
import { shellBackdropQueryValue } from "../utils/platform";
import { AppGameBackground } from "./AppGameBackground";
import "../styles/backdrop.css";

type ShellBackdropProps = {
  /** Omit on the boot screen (settings not loaded yet): atmosphere only. */
  game?: {
    setting: AppBackgroundSetting;
    options: readonly AppBackgroundOption[];
    opacity: number;
  };
};

/**
 * App-wide backdrop for the Path redesign (SPEC §7.6): blue/purple atmosphere with the
 * user's `game_bg_*` art, or the original procedural Path landscape when no art is
 * available. Light theme recolors the same scene to twilight pastel via CSS tokens.
 * Scene geometry is ported from the locked mock `.bg` layers (home round 15).
 */
export function ShellBackdrop({ game }: ShellBackdropProps) {
  const [hasGameArt, setHasGameArt] = useState(false);
  const override = useMemo(() => parseShellBackdropOverride(shellBackdropQueryValue()), []);
  const mode = resolveShellBackdropMode(hasGameArt, override);

  return (
    <div className="tm-bg tm-pbg" data-mode={mode} aria-hidden="true">
      {mode === "placeholder" ? <PlaceholderScene /> : <ProceduralScene />}
      {game && mode !== "placeholder" ? (
        <AppGameBackground
          setting={game.setting}
          options={game.options}
          opacity={game.opacity}
          onImageChange={setHasGameArt}
        />
      ) : null}
      <div className="tm-pbg-caustic" />
      <div className="tm-pbg-vignette" />
    </div>
  );
}

/** Sky, nebulae, stars, hills, ground, spikes, pad, orb and UFO — original geometry, not GD sprites. */
function ProceduralScene() {
  return (
    <svg className="tm-pbg-scene" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="tm-pbg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop className="tm-pbg-sky-0" offset="0%" />
          <stop className="tm-pbg-sky-1" offset="42%" />
          <stop className="tm-pbg-sky-2" offset="100%" />
        </linearGradient>
        <radialGradient id="tm-pbg-neb-a" cx="78%" cy="8%" r="46%">
          <stop className="tm-pbg-neb-a" offset="0%" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="tm-pbg-neb-b" cx="16%" cy="16%" r="40%">
          <stop className="tm-pbg-neb-b" offset="0%" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="1440" height="900" fill="url(#tm-pbg-sky)" />
      <ellipse cx="1180" cy="80" rx="480" ry="250" fill="url(#tm-pbg-neb-a)" />
      <ellipse cx="220" cy="140" rx="420" ry="230" fill="url(#tm-pbg-neb-b)" />
      <g className="tm-pbg-stars">
        <circle cx="100" cy="50" r="1.2" />
        <circle cx="400" cy="36" r=".8" />
        <circle cx="720" cy="60" r="1" />
        <circle cx="980" cy="40" r=".7" />
        <circle cx="1300" cy="70" r="1.1" />
      </g>
      <g className="tm-pbg-ground">
        <path className="tm-pbg-hill-1" d="M0 600 C 220 540, 400 620, 640 540 C 900 450, 1120 550, 1440 500 L1440 900 L0 900 Z" />
        <path className="tm-pbg-hill-2" d="M0 680 C 260 620, 520 720, 820 640 C 1100 570, 1280 680, 1440 640 L1440 900 L0 900 Z" />
        <path className="tm-pbg-hill-3" d="M0 790 C 300 750, 640 830, 980 770 C 1220 730, 1340 810, 1440 780 L1440 900 L0 900 Z" />
        <rect className="tm-pbg-floor" x="0" y="848" width="1440" height="52" />
        <rect className="tm-pbg-rail" x="0" y="842" width="1440" height="7" />
        <g className="tm-pbg-spikes">
          <polygon points="900,842 912,804 924,842" />
          <polygon points="924,842 936,804 948,842" />
          <polygon points="948,842 960,804 972,842" />
        </g>
        <g className="tm-pbg-pad">
          <rect x="260" y="832" width="50" height="10" rx="4" fill="#4CBCFF" />
          <rect x="260" y="828" width="50" height="5" rx="2" fill="#d6e8ff" />
        </g>
        <g className="tm-pbg-orb">
          <circle cx="700" cy="808" r="10" fill="#3EEFD0" />
          <circle cx="700" cy="808" r="18" fill="none" stroke="#3EEFD0" strokeWidth="2" opacity=".45" />
        </g>
      </g>
      <g className="tm-pbg-ufo" transform="translate(650 118)" fill="#d7e3ff" opacity=".9">
        <ellipse cx="26" cy="14" rx="18" ry="7" />
        <polygon points="8,14 26,-6 44,14" />
        <rect x="16" y="12" width="18" height="5" rx="1" fill="#8f7cff" />
      </g>
    </svg>
  );
}

/** Quiet review backdrop: moon glow, orbit rings, one hill silhouette. */
function PlaceholderScene() {
  return (
    <svg className="tm-pbg-scene" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="tm-pbg-ph-moon" cx="78%" cy="18%" r="38%">
          <stop className="tm-pbg-ph-moon-0" offset="0%" />
          <stop className="tm-pbg-ph-moon-1" offset="45%" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <linearGradient id="tm-pbg-ph-sky" x1="0" y1="0" x2="0" y2="1">
          <stop className="tm-pbg-ph-sky-0" offset="0%" />
          <stop className="tm-pbg-ph-sky-1" offset="100%" />
        </linearGradient>
      </defs>
      <rect width="1440" height="900" fill="url(#tm-pbg-ph-sky)" />
      <ellipse cx="1120" cy="160" rx="400" ry="280" fill="url(#tm-pbg-ph-moon)" />
      <g className="tm-pbg-ph-rings">
        <circle cx="1120" cy="150" r="56" fill="#d7e0ff" opacity=".16" />
        <circle cx="1120" cy="150" r="96" fill="none" stroke="rgba(121,183,255,.2)" strokeWidth="1.4" />
        <circle cx="1120" cy="150" r="150" fill="none" stroke="rgba(143,124,255,.12)" strokeWidth="1.2" />
        <circle cx="1120" cy="150" r="214" fill="none" stroke="rgba(121,183,255,.08)" strokeWidth="1" />
      </g>
      <path className="tm-pbg-ph-hill" d="M0 760 C 280 720, 560 800, 860 740 C 1160 680, 1320 760, 1440 730 L1440 900 L0 900 Z" />
    </svg>
  );
}
