const onboarding = {
  steps: {
    language: "Choisissez votre langue",
    theme: "Choisissez votre style",
    geometryDash: "Confirmez Geometry Dash",
  },
  languageAria: "Langue",
  languageHint: "D’autres langues apparaîtront ici au fur et à mesure des traductions.",
  progressAria: "Progression de la configuration",
  stepAria: "Étape {{number}} : {{id}}",
  pickYourStyle: "Choisissez votre style",
  gd: {
    notFound: "Introuvable",
    manualOverride: "Remplacement manuel",
    autoDetected: "Détecté automatiquement",
    overrideActive: "Remplacement actif",
    noInstallYet: "Aucune installation trouvée pour l’instant",
    installLocation: "Emplacement de l’installation",
    applyPath: "Appliquer le chemin",
    redetect: "Détecter à nouveau",
    notFoundWarning:
      "Geometry Dash est introuvable. Vous pouvez terminer la configuration maintenant et définir le chemin plus tard dans les Paramètres.",
    looksGood: "Parfait — ce chemin servira pour les fichiers du jeu et les outils.",
  },
} as const;

export default onboarding;
