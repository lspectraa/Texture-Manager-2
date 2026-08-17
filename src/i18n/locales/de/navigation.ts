const navigation = {
  applicationAria: "Anwendungsnavigation",
  title: "Navigation",
  expandPanelAria: "Navigationsbereich ausklappen",
  collapsePanelAria: "Navigationsbereich einklappen",
  showPanel: "Navigation anzeigen",
  hidePanel: "Navigation ausblenden",
  home: "Start",
  homeHint: "Alle Werkzeuge",
  settings: "Einstellungen",
  copyrightAria: "Copyright und Info",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Bald",
  comingSoonTitle: "{{tool}} — demnächst",
  homeScreen: {
    eyebrow: "Textur-Werkzeuge",
    title: "Woran möchtest du arbeiten?",
    splash: {
      general: [
        "Woran möchtest du arbeiten?",
        "Wähl ein Werkzeug und leg los.",
        "Sheets, Icons, Glow — was kommt als Nächstes?",
        "Wieder ein Pack, wieder ein Tag.",
        "Lass uns etwas Schönes machen.",
      ],
      morning: ["Guten Morgen. Was zuerst?", "Frischer Start — welches Werkzeug?"],
      afternoon: ["Nachmittagssession. Was bauen wir?"],
      evening: ["Abend im Studio. Was steht an?", "Noch ein Sheet, bevor Schluss ist?"],
      night: ["Späte Texture-Runde?", "Die Icons können warten … oder auch nicht."],
      monday: ["Montag. Fang ruhig mit einer kleinen Änderung an."],
      friday: ["Freitag. Noch ein Pack vor dem Wochenende?"],
      weekend: ["Wochenendprojekt.", "Keine Eile — such dir was Schönes aus."],
    },
    lead: "Wähle ein Werkzeug, um zu starten. Sie sind danach gruppiert, was du tun möchtest.",
    toolsReady: "Werkzeuge bereit",
    toolsAvailableAria: "{{count}} Werkzeuge verfügbar",
    comingSoonCount: "+{{count}} demnächst",
    cardComingSoon: "Demnächst",
  },
  sections: {
    design: {
      title: "Design & Effekte",
      subtitle: "Icons, Glow, Buttons und Partikel",
    },
    sheets: {
      title: "Gamesheets",
      subtitle: "Sheets teilen, kombinieren, skalieren und schärfen",
    },
    batch: {
      title: "Pack-Werkzeuge",
      subtitle: "Viele Dateien auf einmal ändern",
    },
  },
  tools: {
    iconEditor: {
      label: "Icon-Editor",
      description: "Teile, Farben und Position eines Icons ändern.",
    },
    glowMaker: {
      label: "Glow-Maker",
      description: "Einen Glow um deine Icons legen.",
    },
    geodeButtons: {
      label: "Geode-Buttons erstellen",
      shortLabel: "Geode-Buttons",
      description: "Das Geode-Menübutton-Gamesheet erstellen",
    },
    particleEditor: {
      label: "Partikel-Editor",
      description: "Partikeleffekte erstellen und anpassen.",
    },
    splitter: {
      label: "Splitter",
      description: "Ein Gamesheet in einzelne Sprites zerlegen.",
    },
    merger: {
      label: "Merger",
      description: "Sprites wieder zu einem Gamesheet zusammenfügen.",
    },
    porter: {
      label: "Porter",
      description: "HD-, UHD- oder Low-Quality-Versionen eines Sheets erstellen.",
    },
    upscaler: {
      label: "Upscaler",
      description: "Sprites schärfer und größer machen. Optional für die neueste Spielversion aktualisieren.",
    },
    randomizer: {
      label: "Randomizer",
      description: "Icons mischen. Den Code merken, wenn du dieselbe Mischung später willst.",
    },
    convertToNewVersion: {
      label: "In neue Version konvertieren",
      shortLabel: "Neue Version",
      description: "Fehlende Sprites ergänzen, damit ein Pack im neuesten Spiel funktioniert.",
    },
    texturePackInstaller: {
      label: "Texture-Pack-Installer",
      shortLabel: "Pack-Installer",
      description: "Texture Packs in Geometry Dash hinzufügen.",
    },
  },
} as const;

export default navigation;
