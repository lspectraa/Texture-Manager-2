const navigation = {
  applicationAria: "Application navigation",
  title: "Navigation",
  expandPanelAria: "Expand navigation panel",
  collapsePanelAria: "Collapse navigation panel",
  showPanel: "Show navigation",
  hidePanel: "Hide navigation",
  home: "Home",
  homeHint: "Launcher",
  settings: "Settings",
  copyrightAria: "Copyright and about",
  copyrightTitle: "© {{holder}} {{year}}",
  comingSoonBadge: "Soon",
  comingSoonTitle: "{{tool}} — coming soon",
  homeScreen: {
    eyebrow: "Texture workflow hub",
    title: "What would you like to work on?",
    lead:
      "Pick a tool below to open its workspace. Tools are grouped by workflow so you can jump straight to the task at hand.",
    toolsReady: "tools ready",
    toolsAvailableAria: "{{count}} tools available",
    comingSoonCount: "+{{count}} coming soon",
    cardComingSoon: "Coming soon",
  },
  sections: {
    design: {
      title: "Design & Effects",
      subtitle: "Work on icons and effects",
    },
    sheets: {
      title: "Sheet Pipeline",
      subtitle: "Split, merge, resize, and upscale sheets",
    },
    batch: {
      title: "Batch Utilities",
      subtitle: "Bulk changes to texture packs",
    },
  },
  tools: {
    iconEditor: {
      label: "Icon Editor",
      description: "Edit icons and see your changes live.",
    },
    glowMaker: {
      label: "Glow Maker",
      description: "Add glow effects around your icons.",
    },
    geodeButtons: {
      label: "Create Geode Buttons",
      shortLabel: "Geode Buttons",
      description: "Build Geode-style buttons from your images.",
    },
    particleEditor: {
      label: "Particle Editor",
      description: "Create and edit particle effects.",
    },
    splitter: {
      label: "Splitter",
      description: "Split texture sheets into separate files.",
    },
    merger: {
      label: "Merger",
      description: "Combine separate files back into texture sheets.",
    },
    porter: {
      label: "Porter",
      description: "Resize texture sheets for different sizes.",
    },
    upscaler: {
      label: "Upscaler",
      description:
        "AI-upscale sprites to HD or UHD, then optionally convert to the latest game version.",
    },
    randomizer: {
      label: "Randomizer",
      description: "Shuffle icons with a seed you can reuse.",
    },
    convertToNewVersion: {
      label: "Convert to New Version",
      shortLabel: "New Version",
      description: "Update sheets for the newest game version.",
    },
    texturePackInstaller: {
      label: "Texture Pack Installer",
      shortLabel: "Pack Installer",
      description: "Install texture packs into your game folder.",
    },
  },
} as const;

export default navigation;
