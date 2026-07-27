import packageJson from "../../package.json";

/** App version — single source of truth is package.json. */
export const APP_VERSION = packageJson.version;

export const COPYRIGHT_HOLDER = "Spectra";
export const COPYRIGHT_YEAR = 2026;

export const APP_LINKS = {
  github: "https://github.com/lspectraa/Texture-Manager-2",
  youtube: "https://www.youtube.com/c/spectraa",
  discord: "https://discord.gg/YFXhJZJCv6",
  /** Pre-filled issue form for reporting localization mistakes. */
  translationIssue:
    "https://github.com/lspectraa/Texture-Manager-2/issues/new?title=Translation%20issue&labels=localization",
} as const;
