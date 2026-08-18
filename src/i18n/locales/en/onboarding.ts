const onboarding = {
  steps: {
    language: "Choose your language",
    theme: "Pick your style",
    geometryDash: "Confirm Geometry Dash",
  },
  languageAria: "Language",
  languageHint: "You can change this later in Settings.",
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
    looksGood: "Looks good — tools will use this folder for game files.",
  },
} as const;

export default onboarding;
