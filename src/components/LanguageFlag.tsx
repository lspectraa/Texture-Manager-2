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

function flagTitle(code: AppLanguage): string {
  switch (code) {
    case "en":
      return "United States";
    case "es":
      return "Spain";
    case "ru":
      return "Russia";
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
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}
