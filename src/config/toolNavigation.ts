import type { LucideIcon } from "lucide-react";
import {
  FileOutput,
  GitBranch,
  Image,
  Layers,
  PackageOpen,
  RefreshCw,
  Scissors,
  Shuffle,
  Sparkles,
  Wand2,
  WandSparkles,
  Wind,
} from "lucide-react";

export type AppToolId =
  | "iconEditor"
  | "splitter"
  | "merger"
  | "porter"
  | "randomizer"
  | "glowMaker"
  | "convertToNewVersion"
  | "geodeButtons"
  | "texturePackInstaller"
  | "particleEditor";

export type ToolAccent = "sky" | "violet" | "mint" | "amber" | "rose" | "cyan";

export type ToolNavEntry = {
  id: AppToolId;
  label: string;
  shortLabel?: string;
  description: string;
  icon: LucideIcon;
  featured?: boolean;
  upcoming?: boolean;
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
    title: "sections.design.title",
    subtitle: "sections.design.subtitle",
    icon: Wand2,
    accent: "cyan",
    tools: [
      {
        id: "iconEditor",
        label: "tools.iconEditor.label",
        description: "tools.iconEditor.description",
        icon: Image,
        featured: true,
      },
      {
        id: "glowMaker",
        label: "tools.glowMaker.label",
        description: "tools.glowMaker.description",
        icon: WandSparkles,
      },
      {
        id: "geodeButtons",
        label: "tools.geodeButtons.label",
        shortLabel: "tools.geodeButtons.shortLabel",
        description: "tools.geodeButtons.description",
        icon: Sparkles,
      },
      {
        id: "particleEditor",
        label: "tools.particleEditor.label",
        description: "tools.particleEditor.description",
        icon: Wind,
      },
    ],
  },
  {
    id: "sheets",
    title: "sections.sheets.title",
    subtitle: "sections.sheets.subtitle",
    icon: Layers,
    accent: "sky",
    tools: [
      {
        id: "splitter",
        label: "tools.splitter.label",
        description: "tools.splitter.description",
        icon: Scissors,
      },
      {
        id: "merger",
        label: "tools.merger.label",
        description: "tools.merger.description",
        icon: FileOutput,
      },
      {
        id: "porter",
        label: "tools.porter.label",
        description: "tools.porter.description",
        icon: GitBranch,
      },
    ],
  },
  {
    id: "batch",
    title: "sections.batch.title",
    subtitle: "sections.batch.subtitle",
    icon: Shuffle,
    accent: "amber",
    tools: [
      {
        id: "randomizer",
        label: "tools.randomizer.label",
        description: "tools.randomizer.description",
        icon: Shuffle,
      },
      {
        id: "convertToNewVersion",
        label: "tools.convertToNewVersion.label",
        shortLabel: "tools.convertToNewVersion.shortLabel",
        description: "tools.convertToNewVersion.description",
        icon: RefreshCw,
      },
      {
        id: "texturePackInstaller",
        label: "tools.texturePackInstaller.label",
        shortLabel: "tools.texturePackInstaller.shortLabel",
        description: "tools.texturePackInstaller.description",
        icon: PackageOpen,
      },
    ],
  },
];

export const TOOL_COUNT = TOOL_NAV_SECTIONS.reduce(
  (count, section) => count + section.tools.filter((tool) => !tool.upcoming).length,
  0,
);

export const UPCOMING_TOOL_COUNT = TOOL_NAV_SECTIONS.reduce(
  (count, section) => count + section.tools.filter((tool) => tool.upcoming).length,
  0,
);

export function getToolSection(toolId: AppToolId): ToolNavSection | undefined {
  return TOOL_NAV_SECTIONS.find((section) =>
    section.tools.some((entry) => entry.id === toolId),
  );
}

export function getToolAccent(toolId: AppToolId): ToolAccent {
  return getToolSection(toolId)?.accent ?? "sky";
}

export function getToolMeta(toolId: AppToolId): ToolNavEntry | undefined {
  for (const section of TOOL_NAV_SECTIONS) {
    const tool = section.tools.find((entry) => entry.id === toolId);
    if (tool) {
      return tool;
    }
  }
  return undefined;
}

export function isUpcomingTool(toolId: AppToolId): boolean {
  return getToolMeta(toolId)?.upcoming === true;
}
