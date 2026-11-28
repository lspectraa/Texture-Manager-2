import {
  TOOL_NAV_SECTIONS,
  getToolSection,
  type AppToolId,
  type ToolAccent,
  type ToolNavEntry,
  type ToolNavSection,
} from "./toolNavigation";

/** Card slots on the PC Path home (mock `.chamber-wrap.design / .sheets / .packs`). */
export type PathSectionKey = "design" | "sheets" | "packs";

/** Navigation section id → Path card slot. The Pack tools section id stays `batch`. */
const PATH_SECTION_SLOTS: Readonly<Record<string, PathSectionKey>> = {
  design: "design",
  sheets: "sheets",
  batch: "packs",
};

/** Going Home lands on the Design card with Icon Editor as the lead (SPEC §7.1 resetHomePreview). */
export const DEFAULT_HOME_PREVIEW_TOOL: AppToolId = "iconEditor";

export function pathSectionKey(section: ToolNavSection): PathSectionKey {
  return PATH_SECTION_SLOTS[section.id] ?? "design";
}

export function pathSectionOfTool(toolId: AppToolId): PathSectionKey {
  const section = getToolSection(toolId);
  return section ? pathSectionKey(section) : "design";
}

/** Two-digit section number shown in the card corner ("01", "02", "03"). */
export function pathSectionNumber(sectionIndex: number): string {
  return String(sectionIndex + 1).padStart(2, "0");
}

export type PathDockTool = {
  tool: ToolNavEntry;
  accent: ToolAccent;
};

/** Every PC tool in section order, for the dock's scrolling strip. */
export const PATH_DOCK_TOOLS: ReadonlyArray<PathDockTool> = TOOL_NAV_SECTIONS.flatMap((section) =>
  section.tools.map((tool) => ({ tool, accent: section.accent })),
);

/** Lead tool per card: the previewed tool for its own card, else the remembered lead. */
export function nextSectionLeads(
  previous: Readonly<Record<PathSectionKey, AppToolId>>,
  previewTool: AppToolId,
): Record<PathSectionKey, AppToolId> {
  return { ...previous, [pathSectionOfTool(previewTool)]: previewTool };
}

/** Initial leads: first tool of every card, with the previewed tool leading its own card. */
export function initialSectionLeads(previewTool: AppToolId): Record<PathSectionKey, AppToolId> {
  const leads = {} as Record<PathSectionKey, AppToolId>;
  for (const section of TOOL_NAV_SECTIONS) {
    const first = section.tools[0];
    if (first) {
      leads[pathSectionKey(section)] = first.id;
    }
  }
  return nextSectionLeads(leads, previewTool);
}
