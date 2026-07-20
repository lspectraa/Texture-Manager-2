const tools = {
  common: {
    sourceAndOutput: "Source & Output",
    sourceAndOutputDescription:
      "Choose where the operation reads from and writes results",
    inputDirectory: "Input directory",
    outputDirectory: "Output directory",
    outputMirroringNote:
      "Output stays separate unless you browse input into an empty output path.",
    runOperation: "Run Operation",
    running: "Running…",
    range1To64: "1–64",
  },
  splitter: {
    performance: "Performance",
    performanceDescription:
      "Control how many gamesheets are processed in parallel",
    concurrentGamesheets: "Concurrent gamesheets",
  },
  porter: {
    settings: "Port Settings",
    settingsDescription:
      "Choose output tier and parallel processing limits",
    lowGraphics: "Port to Low Graphics",
    concurrentGamesheetsAndTextures:
      "Concurrent gamesheets and textures",
  },
  merger: {
    options: "Merge Options",
    optionsDescription: "Tune merge behavior and throughput",
    includeOutsidePlist:
      "Include files outside plist (phase 2 compatible flag)",
    concurrentFolders: "Concurrent merge folders",
  },
  randomizer: {
    section: "Randomization",
    sectionDescription:
      "Use a fixed seed to reproduce the same shuffle later",
    seed: "Seed",
    seedPlaceholder: "Leave blank for random seed",
  },
  convertToNewVersion: {
    versionTarget: "Version Target",
    versionTargetDescription:
      "Pick the destination game version and processing concurrency",
    previousGameVersion: "Previous game version",
    concurrentGamesheets: "Concurrent gamesheets",
  },
  glowMaker: {
    parameters: "Glow Parameters",
    parametersDescription:
      "Adjust stroke width and alpha filtering thresholds",
    thickness: "Glow thickness",
    thicknessRange: "1–128",
    outlineAlphaMinimum: "Outline alpha minimum",
    alphaRange: "0–255",
    generationMode: "Generation Mode",
    generationModeDescription:
      "Choose compositing and color spectrum behavior",
    compositeLayers:
      "Composite icon layers before glow (primary + secondary + extra)",
    rainbowGlow:
      "Rainbow glow (extended spectrum, cyan → purple → reddish-violet)",
    preview: "Preview",
    previewDescription:
      "Live preview using a random UHD icon from your game — updates as you change settings",
    previewAlt: "Glow maker sample preview",
    previewLoading: "Generating preview…",
    previewError: "Preview unavailable",
    refreshPreview: "New random icon",
  },
  geodeButtons: {
    sourceDescription:
      "BlankSheet loads from Steam geode/resources/geode.loader by default; browse to use a custom gamesheet instead",
    inputGamesheet: "Input gamesheet",
    customPlist: "Custom plist",
    cachedBlankSheet: "Cached BlankSheet",
    resolvingBlankSheet: "Resolving BlankSheet…",
    buttonFamilies: "Button Families",
    buttonFamiliesDescription:
      "Select a family to preview templates and tune HSV deltas",
    groups: {
      menus: "Menus",
      circle: "Circle",
      editorBase: "Editor Base",
      account: "Account",
    },
    variants: {
      primary: "Primary",
      secondary: "Secondary",
      darkAqua: "Dark Aqua",
      darkPurple: "Dark Purple",
      gray: "Gray",
      error: "Error",
      info: "Info",
      pink: "Pink",
    },
    noPreview: "No preview",
    frames_one: "{{count}} frame",
    frames_other: "{{count}} frames",
    templateSet: "template set",
    usingDefault: "using default",
    loadingTargets: "Loading targets…",
    waitingForGamesheet: "Waiting for gamesheet to load previews.",
    adjust: "Adjust",
    adjustSubtitle: "{{family}} • Variant {{variant}}",
    noFamilySelected: "No family selected",
    notAvailable: "N/A",
    templatePng: "Template PNG",
    perFamily: "Per family",
    selectTemplatePng: "Select template png",
    selectTemplatePngDialog: "Select template png",
    selectInputGamesheetDialog: "Select input gamesheet plist",
    hsvDelta: "HSV (delta)",
    hueDegrees: "Hue (deg)",
    saturation: "Saturation",
    value: "Value",
    hsvHelp:
      "These deltas apply when regenerating frames whose color suffix maps to the selected variant. Double-click a slider to reset it.",
    previewAlt: "{{family}} preview",
  },
} as const;

export default tools;
