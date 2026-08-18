const navigation = {
  applicationAria: "Application navigation",
  title: "Navigation",
  expandPanelAria: "Expand navigation panel",
  collapsePanelAria: "Collapse navigation panel",
  showPanel: "Show navigation",
  hidePanel: "Hide navigation",
  home: "Home",
  homeHint: "All tools",
  settings: "Settings",
  copyrightAria: "Copyright and about",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Soon",
  comingSoonTitle: "{{tool}} — coming soon",
  homeScreen: {
    eyebrow: "Texture tools",
    title: "What would you like to work on?",
    splash: {
      general: [
        "What would you like to work on?",
        "Pick a tool and jump in.",
        "Sheets, icons, glow — what’s next?",
        "Another pack, another day.",
        "Let’s make something look good.",
        "Ready when you are — pick a tool.",
        "Icons, particles, or a full gamesheet?",
        "Small tweak or a whole pack?",
        "Your texture lab is open.",
        "What are we polishing today?",
        "Split, merge, glow — your call.",
        "Time to touch some pixels.",
      ],
      morning: [
        "Good morning. What’s first?",
        "Fresh start — which tool?",
        "Coffee’s on. What are we editing?",
        "Morning pass on a pack?",
      ],
      afternoon: [
        "Afternoon session. What are we making?",
        "Midday grind — which tool?",
        "Quick edit or a deep session?",
      ],
      evening: [
        "Evening studio time. What’s on the list?",
        "One more sheet before you’re done?",
        "Wind down with a small texture job?",
        "Golden hour for glow tweaks.",
      ],
      night: [
        "Late night texture run?",
        "The icons can wait… or not.",
        "Quiet hours, loud particles.",
        "One more export before sleep?",
      ],
      monday: [
        "Monday. Ease in with a small edit.",
        "New week — start with one sprite?",
      ],
      friday: [
        "Friday. Finish a pack before the weekend?",
        "Last push — ship that sheet?",
      ],
      weekend: [
        "Weekend project time.",
        "No rush — pick something fun.",
        "Side project energy — what’s the vibe?",
        "Saturday sheet surgery?",
      ],
    },
    lead: "Choose a tool to get started. They’re grouped by what you want to do.",
    toolsReady: "tools ready",
    toolsAvailableAria: "{{count}} tools available",
    comingSoonCount: "+{{count}} coming soon",
    cardComingSoon: "Coming soon",
  },
  sections: {
    design: {
      title: "Design & Effects",
      subtitle: "Icons, glow, buttons, and particles",
    },
    sheets: {
      title: "Gamesheets",
      subtitle: "Split, combine, resize, and sharpen sheets",
    },
    batch: {
      title: "Pack tools",
      subtitle: "Change many files at once",
    },
  },
  tools: {
    iconEditor: {
      label: "Icon Editor",
      description: "Change an icon’s parts, colors, and placement.",
    },
    glowMaker: {
      label: "Glow Maker",
      description: "Add a glow around your icons.",
    },
    geodeButtons: {
      label: "Create Geode Buttons",
      shortLabel: "Geode Buttons",
      description: "Create the Geode menu buttons gamesheet",
    },
    particleEditor: {
      label: "Particle Editor",
      description: "Make and tweak particle effects.",
    },
    splitter: {
      label: "Splitter",
      description: "Cut a gamesheet into individual sprites.",
    },
    merger: {
      label: "Merger",
      description: "Put sprites back together into a gamesheet.",
    },
    porter: {
      label: "Porter",
      description: "Make HD, UHD, or low-quality versions of a sheet.",
    },
    upscaler: {
      label: "Upscaler",
      description: "Make sprites sharper and larger. You can also update them for the newest game.",
    },
    randomizer: {
      label: "Randomizer",
      description: "Mix up icons. Save the code if you want the same mix later.",
    },
    convertToNewVersion: {
      label: "Convert to New Version",
      shortLabel: "New Version",
      description: "Add missing sprites so a pack works on the newest game.",
    },
    texturePackInstaller: {
      label: "Texture Pack Installer",
      shortLabel: "Pack Installer",
      description: "Add texture packs to Geometry Dash.",
    },
  },
} as const;

export default navigation;
