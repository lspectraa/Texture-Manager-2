const settings = {
  title: "Settings",
  description:
    "Global preferences for appearance, install discovery, and tool defaults.",
  statusAria: "Settings status",
  themeChip: "{{theme}} theme",
  concurrentChip: "{{count}} concurrent",
  gdChip: "GD {{status}}",
  appearance: {
    title: "Appearance",
    subtitle: "Choose a look — same picker will power first-run onboarding",
  },
  theme: "Theme",
  language: {
    title: "Language",
    subtitle: "Choose the language used throughout the app",
    label: "Language",
    aria: "Language",
  },
  background: {
    label: "App background",
    aria: "App background",
    random: "Random",
    defaultMeta: "Default",
    opacity: "Background opacity",
    noneFound:
      "No Geometry Dash game_bg_* images found yet — set a valid GD install path to discover them.",
  },
  performance: {
    title: "Performance",
    subtitle: "Default sheet concurrency for tools",
    concurrentGamesheets: "Default concurrent gamesheets",
    rangeHint: "1–64",
  },
  cache: {
    title: "Cache & data",
    subtitle: "Local game-files root and split cache",
    gameFilesRoot: "Game-files root",
    splitCache: "Split cache",
    openCacheFolder: "Open cache folder",
    resetDefaults: "Reset defaults",
  },
  geometryDash: {
    title: "Geometry Dash",
    subtitle:
      "Steam install used for vanilla Resources and Geode paths",
    notFound: "Not found",
    manualOverride: "Manual override",
    autoDetected: "Auto-detected",
    overrideActive: "Override active",
    detectedPathAvailable: "Detected path available",
    noAutoDetect: "No auto-detect result",
    installLocation: "Install location",
    browseHint:
      "Browse to your Geometry Dash folder, or install via Steam and re-detect.",
    applyPath: "Apply path",
    clearOverride: "Clear override",
    redetect: "Re-detect",
  },
  saveFailed: "Could not save language preference. {{error}}",
} as const;

export default settings;
