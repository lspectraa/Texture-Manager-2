import type { LucideIcon } from "lucide-react";
import {
  FileOutput,
  GitBranch,
  Image,
  Layers,
  RefreshCw,
  Scissors,
  Shuffle,
  Sparkles,
  Wand2,
  WandSparkles,
} from "lucide-react";

export type AppToolId =
  | "iconEditor"
  | "splitter"
  | "merger"
  | "porter"
  | "randomizer"
  | "glowMaker"
  | "convertToNewVersion"
  | "geodeButtons";

export type ToolAccent = "sky" | "violet" | "mint" | "amber" | "rose" | "cyan";

export type ToolNavEntry = {
  id: AppToolId;
  label: string;
  shortLabel?: string;
  description: string;
  icon: LucideIcon;
  accent: ToolAccent;
  featured?: boolean;
};

export type ToolNavSection = {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent: ToolAccent;
  tools: ToolNavEntry[];
};

export const TOOL_NAV_SECTIONS: ReadonlyArray<ToolNavSection> = [
  {
    id: "design",
    title: "Design & Effects",
    subtitle: "Work on icons and effects",
    icon: Wand2,
    accent: "cyan",
    tools: [
      {
        id: "iconEditor",
        label: "Icon Editor",
        description: "Edit icons and see your changes live.",
        icon: Image,
        accent: "cyan",
        featured: true,
      },
      {
        id: "glowMaker",
        label: "Glow Maker",
        description: "Add glow effects around your icons.",
        icon: WandSparkles,
        accent: "mint",
      },
      {
        id: "geodeButtons",
        label: "Create Geode Buttons",
        shortLabel: "Geode Buttons",
        description: "Build Geode-style buttons from your images.",
        icon: Sparkles,
        accent: "violet",
      },
    ],
  },
  {
    id: "sheets",
    title: "Sheet Pipeline",
    subtitle: "Split, merge, and resize sheets",
    icon: Layers,
    accent: "sky",
    tools: [
      {
        id: "splitter",
        label: "Splitter",
        description: "Split texture sheets into separate files.",
        icon: Scissors,
        accent: "sky",
      },
      {
        id: "merger",
        label: "Merger",
        description: "Combine separate files back into texture sheets.",
        icon: FileOutput,
        accent: "sky",
      },
      {
        id: "porter",
        label: "Porter",
        description: "Resize texture sheets for different sizes.",
        icon: GitBranch,
        accent: "sky",
      },
    ],
  },
  {
    id: "batch",
    title: "Batch Utilities",
    subtitle: "Bulk changes to texture packs",
    icon: Shuffle,
    accent: "amber",
    tools: [
      {
        id: "randomizer",
        label: "Randomizer",
        description: "Shuffle icons with a seed you can reuse.",
        icon: Shuffle,
        accent: "amber",
      },
      {
        id: "convertToNewVersion",
        label: "Convert to New Version",
        shortLabel: "New Version",
        description: "Update sheets for the newest game version.",
        icon: RefreshCw,
        accent: "rose",
      },
    ],
  },
];

export const TOOL_COUNT = TOOL_NAV_SECTIONS.reduce(
  (count, section) => count + section.tools.length,
  0,
);

export function getToolMeta(toolId: AppToolId): ToolNavEntry | undefined {
  for (const section of TOOL_NAV_SECTIONS) {
    const tool = section.tools.find((entry) => entry.id === toolId);
    if (tool) {
      return tool;
    }
  }
  return undefined;
}
