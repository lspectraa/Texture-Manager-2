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
    /** Desktop Path home: one-line hint beside the heading. */
    pathLead: "Hover a tool to preview it. Click once to enter.",
    /** Desktop Path home wordmark copyright, rendered after a © glyph. */
    wordmarkCopyright: "{{year}} {{holder}}",
    /** Section card index, e.g. "01 · 5" (section number · tool count). */
    sectionIndex: "{{index}} · {{count}}",
    toolsReady: "tools ready",
    toolsAvailableAria: "{{count}} tools available",
    comingSoonCount: "+{{count}} coming soon",
    cardComingSoon: "Coming soon",
    aboutTitle: "About",
    aboutSubtitle: "Copyright, license, and links",
    aboutCardLabel: "Copyright & about",
    openPacksFolder: "Open packs folder",
    openGameFiles: "Open game files",
    openSaveFolder: "Open save folder",
    utilitiesAria: "Quick folder shortcuts",
    openPacksFolderFailed: "Couldn’t open the packs folder. Is Geometry Dash installed?",
    openGameFilesFailed: "Couldn’t open the game files folder. Is Geometry Dash installed?",
    openSaveFolderFailed: "Couldn’t open the save folder.",
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
      description: "Edit an icon’s parts, colors, and placement.",
    },
    glowMaker: {
      label: "Glow Maker",
      description: "Add a glow around your icons.",
    },
    geodeButtons: {
      label: "Geode Sprites",
      shortLabel: "Geode Sprites",
      description: "Build the Geode menu-sprite gamesheet.",
    },
    menuRecolor: {
      label: "Menu Recolor",
      shortLabel: "Recolor",
      description: "Recolor menu sprites with hue bands.",
    },
    particleEditor: {
      label: "Particle Editor",
      shortLabel: "Particles",
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
      description: "Sharpen and enlarge sprites, or update them for the newest game.",
    },
    randomizer: {
      label: "Randomizer",
      description: "Mix up icons. Save the code to reuse the same mix.",
    },
    convertToNewVersion: {
      label: "Converter",
      shortLabel: "Converter",
      description: "Add missing sprites so a pack works on the newest game.",
    },
    texturePackInstaller: {
      label: "Texture Pack Installer",
      shortLabel: "Pack Installer",
      description: "Add texture packs to Geometry Dash.",
    },
  },
  dock: {
    aria: "Tools",
    scrollPrevAria: "Scroll tools left",
    scrollNextAria: "Scroll tools right",
  },
  mobile: {
    sectionShortcutAria: "{{section}}, open first tool",
    expandAllToolsAria: "Show all tools",
    closeGridAria: "Close tools",
    allToolsTitle: "All tools",
    backAria: "Back",
    closeDrawerAria: "Close side panel",
    showDrawerAria: "Show {{panel}}",
    hideDrawerAria: "Hide {{panel}}",
    editorSurfacesAria: "Editor views",
    geodeBackToFamilies: "Back to families",
  },
} as const;

export default navigation;
