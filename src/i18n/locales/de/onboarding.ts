const onboarding = {
  steps: {
    language: "Sprache wählen",
    theme: "Stil wählen",
    geometryDash: "Geometry Dash bestätigen",
    androidStorage: "Allow storage access",
  },
  languageAria: "Sprache",
  languageHint: "Weitere Sprachen erscheinen hier, sobald Übersetzungen ergänzt werden.",
  progressAria: "Einrichtungsfortschritt",
  stepAria: "Schritt {{number}}: {{id}}",
  pickYourStyle: "Stil wählen",
  androidStorage: {
    hint:
      "Texture Manager needs All files access to read Geode’s game folder on internal storage.",
    looksGood: "Storage access looks good — Geode files can be read.",
    skipWarning:
      "You can finish setup now and grant access later from Settings or when a tool needs Geode files.",
    permissionGranted: "Zugriff auf alle Dateien gewährt.",
    skipFinish: "Ohne Speicherzugriff fortfahren",
    recheck: "Erneut prüfen",
  },
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
