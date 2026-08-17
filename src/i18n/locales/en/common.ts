const common = {
  browse: "Browse",
  cancel: "Cancel",
  close: "Close",
  remove: "Remove",
  download: "Download",
  copied: "Copied",
  save: "Save",
  saved: "Saved",
  unsaved: "Unsaved",
  saving: "Saving…",
  rename: "Rename",
  saveCopy: "Save Copy",
  none: "None",
  optional: "Optional",
  selectFile: "Select file",
  selectFolder: "Select folder",
  light: "Light",
  dark: "Dark",
  back: "Back",
  next: "Next",
  finish: "Finish",
  available: "Available",
  comingSoon: "Coming soon",
  productName: "Texture Manager 2",
  about: {
    title: "About",
    closeAria: "Close about dialog",
    copyright: "© {{year}} {{holder}}.",
    description:
      "A desktop app for Geometry Dash texture packs — edit icons, split and merge sheets, and more.",
    licenseHeading: "License",
    licenseName: "GNU GPLv3 (or later)",
    licenseSummary:
      "Free software: you may redistribute and modify it under the GNU General Public License. There is no warranty.",
    licenseLink: "View full license",
    licenseHint: "Opens LICENSE on GitHub",
    thirdPartyHeading: "Third-party upscalers",
    thirdPartyName: "Waifu2x, Real-ESRGAN, ncnn",
    thirdPartySummary:
      "This app includes extra upscaling tools. They keep their own licenses, and the full notices come with the app.",
    thirdPartyWaifu2x:
      "Waifu2x CUNet — MIT. Original by nagadomi; ncnn-Vulkan port by nihui.",
    thirdPartyRealesrgan:
      "Real-ESRGAN AnimeVideo v3 — BSD-3-Clause (Xintao Wang). ncnn-Vulkan port — MIT (Xintao Wang / nihui).",
    thirdPartyNcnn: "ncnn — BSD-3-Clause. Copyright (C) 2017 Tencent.",
    thirdPartyLink: "View third-party notices",
    thirdPartyHint: "Opens NOTICE on GitHub",
    version: "Version",
    github: "Project on GitHub",
    githubHint: "Source code and issues",
    youtube: "YouTube channel",
    youtubeHint: "Texture packs and tutorials",
    discord: "Discord server",
    discordHint: "Community and support",
  },
  translationQuality: {
    bannerTitle: "Translations may be inaccurate",
    bannerBody:
      "This language was translated with automated help. If you spot a mistake, please report it so we can improve.",
    settingsHint:
      "Translations may be inaccurate — please report mistakes.",
    reportAction: "Report a translation issue",
  },
} as const;

export default common;
