import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_PREVIEW_TOOL,
  PATH_DOCK_TOOLS,
  initialSectionLeads,
  nextSectionLeads,
  pathSectionNumber,
  pathSectionOfTool,
} from "./pathHome";
import { TOOL_COUNT } from "./toolNavigation";

describe("pathHome", () => {
  it("maps every section onto its Path card slot", () => {
    expect(pathSectionOfTool("iconEditor")).toBe("design");
    expect(pathSectionOfTool("geodeButtons")).toBe("design");
    expect(pathSectionOfTool("upscaler")).toBe("sheets");
    expect(pathSectionOfTool("randomizer")).toBe("packs");
    expect(pathSectionOfTool("texturePackInstaller")).toBe("packs");
  });

  it("numbers sections with two digits", () => {
    expect(pathSectionNumber(0)).toBe("01");
    expect(pathSectionNumber(2)).toBe("03");
  });

  it("lists every PC tool once in the dock, Design first and Pack tools last", () => {
    const ids = PATH_DOCK_TOOLS.map((entry) => entry.tool.id);
    expect(ids).toHaveLength(TOOL_COUNT);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("iconEditor");
    expect(ids[ids.length - 1]).toBe("texturePackInstaller");
    expect(ids).toContain("convertToNewVersion");
    expect(ids).toContain("upscaler");
  });

  it("starts on the Design card with Icon Editor leading", () => {
    expect(DEFAULT_HOME_PREVIEW_TOOL).toBe("iconEditor");
    expect(initialSectionLeads(DEFAULT_HOME_PREVIEW_TOOL)).toEqual({
      design: "iconEditor",
      sheets: "splitter",
      packs: "randomizer",
    });
  });

  it("keeps other cards' leads when a preview moves to a new card", () => {
    const afterMerger = nextSectionLeads(initialSectionLeads("iconEditor"), "merger");
    const afterRandomizer = nextSectionLeads(afterMerger, "convertToNewVersion");
    expect(afterRandomizer).toEqual({
      design: "iconEditor",
      sheets: "merger",
      packs: "convertToNewVersion",
    });
  });
});
