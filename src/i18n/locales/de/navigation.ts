const navigation = {
  applicationAria: "Anwendungsnavigation",
  title: "Navigation",
  expandPanelAria: "Navigationsbereich ausklappen",
  collapsePanelAria: "Navigationsbereich einklappen",
  showPanel: "Navigation anzeigen",
  hidePanel: "Navigation ausblenden",
  home: "Start",
  homeHint: "Übersicht",
  settings: "Einstellungen",
  copyrightAria: "Copyright und Info",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Bald",
  comingSoonTitle: "{{tool}} — demnächst",
  homeScreen: {
    eyebrow: "Zentrale für Textur-Workflows",
    title: "Woran möchtest du arbeiten?",
    lead:
      "Wähle unten ein Werkzeug, um seinen Arbeitsbereich zu öffnen. Die Werkzeuge sind nach Workflow gruppiert, damit du direkt loslegen kannst.",
    toolsReady: "Werkzeuge bereit",
    toolsAvailableAria: "{{count}} Werkzeuge verfügbar",
    comingSoonCount: "+{{count}} demnächst",
    cardComingSoon: "Demnächst",
  },
  sections: {
    design: {
      title: "Design & Effekte",
      subtitle: "An Icons und Effekten arbeiten",
    },
    sheets: {
      title: "Sheet-Pipeline",
      subtitle: "Sheets aufteilen, zusammenführen und skalieren",
    },
    batch: {
      title: "Stapel-Werkzeuge",
      subtitle: "Massenänderungen an Texture Packs",
    },
  },
  tools: {
    iconEditor: {
      label: "Icon-Editor",
      description: "Icons bearbeiten und Änderungen live sehen.",
    },
    glowMaker: {
      label: "Glow-Maker",
      description: "Glow-Effekte rund um deine Icons hinzufügen.",
    },
    geodeButtons: {
      label: "Geode-Buttons erstellen",
      shortLabel: "Geode-Buttons",
      description: "Buttons im Geode-Stil aus deinen Bildern erstellen.",
    },
    particleEditor: {
      label: "Partikel-Editor",
      description: "Partikeleffekte erstellen und bearbeiten.",
    },
    splitter: {
      label: "Splitter",
      description: "Textur-Sheets in einzelne Dateien aufteilen.",
    },
    merger: {
      label: "Merger",
      description: "Einzelne Dateien wieder zu Textur-Sheets zusammenführen.",
    },
    porter: {
      label: "Porter",
      description: "Textur-Sheets für andere Größen skalieren.",
    },
    randomizer: {
      label: "Randomizer",
      description: "Icons mit einem wiederverwendbaren Seed mischen.",
    },
    convertToNewVersion: {
      label: "In neue Version konvertieren",
      shortLabel: "Neue Version",
      description: "Sheets für die neueste Spielversion aktualisieren.",
    },
    texturePackInstaller: {
      label: "Texture-Pack-Installer",
      shortLabel: "Pack-Installer",
      description: "Texture Packs in deinen Spielordner installieren.",
    },
  },
} as const;

export default navigation;
