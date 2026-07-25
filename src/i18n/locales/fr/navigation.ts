const navigation = {
  applicationAria: "Navigation de l’application",
  title: "Navigation",
  expandPanelAria: "Déplier le panneau de navigation",
  collapsePanelAria: "Replier le panneau de navigation",
  showPanel: "Afficher la navigation",
  hidePanel: "Masquer la navigation",
  home: "Accueil",
  homeHint: "Lanceur",
  settings: "Paramètres",
  copyrightAria: "Droits d’auteur et à propos",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Bientôt",
  comingSoonTitle: "{{tool}} — bientôt disponible",
  homeScreen: {
    eyebrow: "Centre des workflows de textures",
    title: "Sur quoi voulez-vous travailler ?",
    lead:
      "Choisissez un outil ci-dessous pour ouvrir son espace de travail. Les outils sont regroupés par workflow pour aller droit au but.",
    toolsReady: "outils prêts",
    toolsAvailableAria: "{{count}} outils disponibles",
    comingSoonCount: "+{{count}} bientôt",
    cardComingSoon: "Bientôt disponible",
  },
  sections: {
    design: {
      title: "Design et effets",
      subtitle: "Travailler sur les icônes et les effets",
    },
    sheets: {
      title: "Pipeline de sheets",
      subtitle: "Découper, fusionner et redimensionner les sheets",
    },
    batch: {
      title: "Utilitaires par lot",
      subtitle: "Modifications en masse des texture packs",
    },
  },
  tools: {
    iconEditor: {
      label: "Éditeur d’icônes",
      description: "Modifiez vos icônes et voyez les changements en direct.",
    },
    glowMaker: {
      label: "Créateur de glow",
      description: "Ajoutez des effets de glow autour de vos icônes.",
    },
    geodeButtons: {
      label: "Créer des boutons Geode",
      shortLabel: "Boutons Geode",
      description: "Créez des boutons de style Geode à partir de vos images.",
    },
    particleEditor: {
      label: "Éditeur de particules",
      description: "Créez et modifiez des effets de particules.",
    },
    splitter: {
      label: "Découpeur",
      description: "Découpez des sheets de textures en fichiers séparés.",
    },
    merger: {
      label: "Fusionneur",
      description: "Réunissez des fichiers séparés en sheets de textures.",
    },
    porter: {
      label: "Portage",
      description: "Redimensionnez les sheets de textures pour d’autres tailles.",
    },
    randomizer: {
      label: "Randomiseur",
      description: "Mélangez les icônes avec une graine réutilisable.",
    },
    convertToNewVersion: {
      label: "Convertir vers une nouvelle version",
      shortLabel: "Nouvelle version",
      description: "Mettez à jour les sheets pour la dernière version du jeu.",
    },
    texturePackInstaller: {
      label: "Installateur de texture packs",
      shortLabel: "Installateur",
      description: "Installez des texture packs dans le dossier de votre jeu.",
    },
  },
} as const;

export default navigation;
