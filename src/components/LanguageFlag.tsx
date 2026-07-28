import type { AppLanguage } from "../i18n/languages";

type LanguageFlagProps = {
  code: AppLanguage;
  size?: number;
  className?: string;
  title?: string;
};

/**
 * Compact SVG country flags for language pickers.
 * Prefer SVG over emoji so Windows always shows a real flag (not "US"/"ES"/"RU").
 */
export function LanguageFlag({
  code,
  size = 20,
  className,
  title,
}: LanguageFlagProps) {
  const label = title ?? flagTitle(code);
  return (
    <span
      className={`tm-language-flag${className ? ` ${className}` : ""}`}
      style={{ width: size, height: Math.round(size * 0.75) }}
      role="img"
      aria-label={label}
      title={label}
    >
      {flagSvg(code)}
    </span>
  );
}

/** Unit five-pointed star centered on the origin, drawn point-up. */
const STAR_PATH =
  "M0,-1 L0.2245,-0.309 L0.951,-0.309 L0.3633,0.1181 L0.588,0.809 L0,0.382 L-0.588,0.809 L-0.3633,0.1181 L-0.951,-0.309 L-0.2245,-0.309 Z";

function flagTitle(code: AppLanguage): string {
  switch (code) {
    case "en":
      return "United States";
    case "es":
      return "Spain";
    case "ru":
      return "Russia";
    case "pt":
      return "Portugal";
    case "de":
      return "Germany";
    case "fr":
      return "France";
    case "zh":
      return "China";
    case "ko":
      return "South Korea";
    case "ja":
      return "Japan";
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

function flagSvg(code: AppLanguage) {
  switch (code) {
    case "en":
      return (
        <svg viewBox="0 0 60 45" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="60" height="45" fill="#B22234" />
          <path
            fill="#fff"
            d="M0 5.2h60v3.5H0zm0 6.9h60v3.5H0zm0 6.9h60v3.5H0zm0 6.9h60v3.5H0zm0 6.9h60v3.5H0z"
          />
          <rect width="24" height="24.2" fill="#3C3B6E" />
          <g fill="#fff">
            <circle cx="4" cy="4" r="1.1" />
            <circle cx="10" cy="4" r="1.1" />
            <circle cx="16" cy="4" r="1.1" />
            <circle cx="22" cy="4" r="1.1" />
            <circle cx="7" cy="8" r="1.1" />
            <circle cx="13" cy="8" r="1.1" />
            <circle cx="19" cy="8" r="1.1" />
            <circle cx="4" cy="12" r="1.1" />
            <circle cx="10" cy="12" r="1.1" />
            <circle cx="16" cy="12" r="1.1" />
            <circle cx="22" cy="12" r="1.1" />
            <circle cx="7" cy="16" r="1.1" />
            <circle cx="13" cy="16" r="1.1" />
            <circle cx="19" cy="16" r="1.1" />
            <circle cx="4" cy="20" r="1.1" />
            <circle cx="10" cy="20" r="1.1" />
            <circle cx="16" cy="20" r="1.1" />
            <circle cx="22" cy="20" r="1.1" />
          </g>
        </svg>
      );
    case "es":
      return (
        <svg viewBox="0 0 60 45" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="60" height="45" fill="#AA151B" />
          <rect y="11.25" width="60" height="22.5" fill="#F1BF00" />
        </svg>
      );
    case "ru":
      return (
        <svg viewBox="0 0 60 45" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="60" height="15" fill="#fff" />
          <rect y="15" width="60" height="15" fill="#0039A6" />
          <rect y="30" width="60" height="15" fill="#D52B1E" />
        </svg>
      );
    case "pt":
      return (
        <svg viewBox="0 0 60 45" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="60" height="45" fill="#FF0000" />
          <rect width="24" height="45" fill="#006600" />
          <circle cx="24" cy="22.5" r="8" fill="#FFFF00" />
          <circle cx="24" cy="22.5" r="5" fill="#fff" />
          <circle cx="24" cy="22.5" r="5" fill="none" stroke="#003399" strokeWidth="2" />
        </svg>
      );
    case "de":
      return (
        <svg viewBox="0 0 60 45" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="60" height="15" fill="#000" />
          <rect y="15" width="60" height="15" fill="#DD0000" />
          <rect y="30" width="60" height="15" fill="#FFCE00" />
        </svg>
      );
    case "fr":
      return (
        <svg viewBox="0 0 60 45" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="20" height="45" fill="#002395" />
          <rect x="20" width="20" height="45" fill="#fff" />
          <rect x="40" width="20" height="45" fill="#ED2939" />
        </svg>
      );
    case "zh":
      return (
        <svg viewBox="0 0 60 45" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="60" height="45" fill="#DE2910" />
          <g fill="#FFDE00">
            <path d={STAR_PATH} transform="translate(11 11.5) scale(6)" />
            <path d={STAR_PATH} transform="translate(22 4.5) scale(2)" />
            <path d={STAR_PATH} transform="translate(26.5 9.5) scale(2)" />
            <path d={STAR_PATH} transform="translate(26.5 15.5) scale(2)" />
            <path d={STAR_PATH} transform="translate(22 20.5) scale(2)" />
          </g>
        </svg>
      );
    case "ko":
      return (
        <svg viewBox="0 0 60 45" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="60" height="45" fill="#fff" />
          <path
            d="M21 22.5a9 9 0 0 1 18 0a4.5 4.5 0 0 0-9 0a4.5 4.5 0 0 1-9 0Z"
            fill="#CD2E3A"
          />
          <path
            d="M39 22.5a9 9 0 0 1-18 0a4.5 4.5 0 0 0 9 0a4.5 4.5 0 0 1 9 0Z"
            fill="#0047A0"
          />
          <g fill="#000">
            <g transform="rotate(-56 12 10)">
              <rect x="7" y="8" width="10" height="1.4" />
              <rect x="7" y="10.3" width="10" height="1.4" />
              <rect x="7" y="12.6" width="10" height="1.4" />
            </g>
            <g transform="rotate(56 48 10)">
              <rect x="43" y="8" width="10" height="1.4" />
              <rect x="43" y="10.3" width="10" height="1.4" />
              <rect x="43" y="12.6" width="10" height="1.4" />
            </g>
            <g transform="rotate(56 12 35)">
              <rect x="7" y="33" width="10" height="1.4" />
              <rect x="7" y="35.3" width="10" height="1.4" />
              <rect x="7" y="37.6" width="10" height="1.4" />
            </g>
            <g transform="rotate(-56 48 35)">
              <rect x="43" y="33" width="10" height="1.4" />
              <rect x="43" y="35.3" width="10" height="1.4" />
              <rect x="43" y="37.6" width="10" height="1.4" />
            </g>
          </g>
        </svg>
      );
    case "ja":
      return (
        <svg viewBox="0 0 60 45" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect width="60" height="45" fill="#fff" />
          <circle cx="30" cy="22.5" r="13.5" fill="#BC002D" />
        </svg>
      );
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}
