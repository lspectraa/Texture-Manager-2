const onboarding = {
  steps: {
    language: "Choose your language",
    theme: "Pick your style",
    geometryDash: "Confirm Geometry Dash",
  },
  languageAria: "Language",
  languageHint: "More languages will appear here as translations are added.",
  progressAria: "Setup progress",
  stepAria: "Step {{number}}: {{id}}",
  pickYourStyle: "Pick your style",
  gd: {
    notFound: "Not found",
    manualOverride: "Manual override",
    autoDetected: "Auto-detected",
    overrideActive: "Override active",
    noInstallYet: "No install found yet",
    installLocation: "Install location",
    applyPath: "Apply path",
    redetect: "Re-detect",
    notFoundWarning:
      "Geometry Dash was not found. You can finish setup now and set the install path later in Settings.",
    looksGood:
      "Looks good — this path will be used for game files and tools.",
  },
} as const;

export default onboarding;
