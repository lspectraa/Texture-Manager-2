const onboarding = {
  steps: {
    language: "Sprache wählen",
    theme: "Stil wählen",
    geometryDash: "Geometry Dash bestätigen",
  },
  languageAria: "Sprache",
  languageHint: "Weitere Sprachen erscheinen hier, sobald Übersetzungen ergänzt werden.",
  progressAria: "Einrichtungsfortschritt",
  stepAria: "Schritt {{number}}: {{id}}",
  pickYourStyle: "Stil wählen",
  gd: {
    notFound: "Nicht gefunden",
    manualOverride: "Manuelle Überschreibung",
    autoDetected: "Automatisch erkannt",
    overrideActive: "Überschreibung aktiv",
    noInstallYet: "Noch keine Installation gefunden",
    installLocation: "Installationsort",
    applyPath: "Pfad übernehmen",
    redetect: "Erneut erkennen",
    notFoundWarning:
      "Geometry Dash wurde nicht gefunden. Du kannst die Einrichtung jetzt abschließen und den Installationspfad später in den Einstellungen setzen.",
    looksGood: "Sieht gut aus — dieser Pfad wird für Spieldateien und Werkzeuge verwendet.",
  },
} as const;

export default onboarding;
