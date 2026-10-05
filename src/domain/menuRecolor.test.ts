import { describe, expect, it } from "vitest";
import {
  effectiveRecolor,
  includesForRuleSet,
  ruleSetIncludes,
  tagSprite,
} from "./menuRecolor";
import { identityRecipe } from "./menuRecolorColor";

function tagsFor(path: string): string[] {
  const name = path.split("/").pop() ?? path;
  return tagSprite(path, name, null);
}

describe("menu recolor tags and rule sets", () => {
  it("GJ_button_01.png included", () => {
    const tags = tagsFor("GJ_button_01.png");
    expect(ruleSetIncludes(tags, "menuChrome")).toBe(true);
    expect(tags).not.toContain("faces");
    expect(tags).not.toContain("icons");
    expect(tags).not.toContain("font");
  });

  it("diffIcon_05_btn_001-uhd.png faces", () => {
    const tags = tagsFor("diffIcon_05_btn_001-uhd.png");
    expect(tags).toContain("faces");
    expect(ruleSetIncludes(tags, "menuChrome")).toBe(false);
    expect(ruleSetIncludes(tags, "facesOnly")).toBe(true);
  });

  it("icons/player_01.png icons", () => {
    const tags = tagsFor("icons/player_01.png");
    expect(tags).toContain("icons");
    expect(ruleSetIncludes(tags, "menuChrome")).toBe(false);
    expect(ruleSetIncludes(tags, "exceptIcons")).toBe(false);
  });

  it("does not exclude font from menu chrome", () => {
    const tags = tagsFor("goldFont_01.png");
    expect(tags).toContain("font");
    expect(ruleSetIncludes(tags, "menuChrome")).toBe(true);
  });

  it("changing rule sets keeps overrides", () => {
    const sprites = [
      { id: "button", tags: tagsFor("GJ_button_01.png") },
      { id: "face", tags: tagsFor("diffIcon_05_btn_001-uhd.png") },
    ];
    const overrides = { face: { mode: "off" as const } };
    const includes = includesForRuleSet(sprites, "facesOnly");
    expect(includes.button).toBe(false);
    expect(includes.face).toBe(true);
    expect(overrides.face).toEqual({ mode: "off" });
    expect(effectiveRecolor(includes.face, identityRecipe(), overrides.face)).toBeNull();
    expect(effectiveRecolor(false, identityRecipe(), { mode: "inherit" })).toBeNull();
    expect(effectiveRecolor(true, identityRecipe(), { mode: "off" })).toBeNull();
  });
});
