const navigation = {
  applicationAria: "Navigation de l’application",
  title: "Navigation",
  expandPanelAria: "Déplier le panneau de navigation",
  collapsePanelAria: "Replier le panneau de navigation",
  showPanel: "Afficher la navigation",
  hidePanel: "Masquer la navigation",
  home: "Accueil",
  homeHint: "Tous les outils",
  settings: "Paramètres",
  copyrightAria: "Droits d’auteur et à propos",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Bientôt",
  comingSoonTitle: "{{tool}} — bientôt disponible",
  homeScreen: {
    eyebrow: "Outils de textures",
    title: "Sur quoi voulez-vous travailler ?",
    splash: {
      general: [
        "Sur quoi voulez-vous travailler ?",
        "Choisissez un outil et lancez-vous.",
        "Sheets, icônes, glow — et ensuite ?",
        "Encore un pack, encore une journée.",
        "Faisons quelque chose de joli.",
      ],
      morning: ["Bonjour. On commence par quoi ?", "Nouvelle session — quel outil ?"],
      afternoon: ["Session de l’après-midi. On fabrique quoi ?"],
      evening: ["Soirée studio. Qu’est-ce qu’il reste ?", "Encore une sheet avant d’arrêter ?"],
      night: ["Session textures de nuit ?", "Les icônes peuvent attendre… ou pas."],
      monday: ["Lundi. Commencez petit."],
      friday: ["Vendredi. Un pack avant le week-end ?"],
      weekend: ["Projet du week-end.", "Pas de rush — choisissez quelque chose d’amusant."],
    },
    lead: "Choisissez un outil pour commencer. Ils sont groupés selon ce que vous voulez faire.",
    toolsReady: "outils prêts",
    toolsAvailableAria: "{{count}} outils disponibles",
    comingSoonCount: "+{{count}} bientôt",
    cardComingSoon: "Bientôt disponible",
  },
  sections: {
    design: {
      title: "Design et effets",
      subtitle: "Icônes, glow, boutons et particules",
    },
    sheets: {
      title: "Gamesheets",
      subtitle: "Découper, assembler, redimensionner et affiner les sheets",
    },
    batch: {
      title: "Outils de packs",
      subtitle: "Modifier beaucoup de fichiers d’un coup",
    },
  },
  tools: {
    iconEditor: {
      label: "Éditeur d’icônes",
      description: "Changez les parties, les couleurs et la position d’une icône.",
    },
    glowMaker: {
      label: "Créateur de glow",
      description: "Ajoutez un glow autour de vos icônes.",
    },
    geodeButtons: {
      label: "Créer des boutons Geode",
      shortLabel: "Boutons Geode",
      description: "Créer le gamesheet des boutons de menu Geode",
    },
    particleEditor: {
      label: "Éditeur de particules",
      description: "Créez et ajustez des effets de particules.",
    },
    splitter: {
      label: "Découpeur",
      description: "Découpez un gamesheet en sprites individuels.",
    },
    merger: {
      label: "Fusionneur",
      description: "Réassemblez les sprites en un gamesheet.",
    },
    porter: {
      label: "Portage",
      description: "Créez des versions HD, UHD ou basse qualité d’une sheet.",
    },
    upscaler: {
      label: "Upscaler",
      description: "Rendez les sprites plus nets et plus grands. Vous pouvez aussi les mettre à jour pour le jeu le plus récent.",
    },
    randomizer: {
      label: "Randomiseur",
      description: "Mélangez les icônes. Gardez le code pour retrouver le même mélange plus tard.",
    },
    convertToNewVersion: {
      label: "Convertir vers une nouvelle version",
      shortLabel: "Nouvelle version",
      description: "Ajoutez les sprites manquants pour qu’un pack fonctionne sur le jeu le plus récent.",
    },
    texturePackInstaller: {
      label: "Installateur de texture packs",
      shortLabel: "Installateur",
      description: "Ajoutez des texture packs à Geometry Dash.",
    },
  },
} as const;

export default navigation;
