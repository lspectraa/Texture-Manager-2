import { describe, expect, it } from "vitest";
import {
  effectiveRecolor,
  includesForRuleSet,
  overridesForIncluded,
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

  it("keeps symbols, fonts, and gameplay objects out of menu chrome", () => {
    const font = tagsFor("goldFont_01.png");
    expect(font).toContain("font");
    expect(ruleSetIncludes(font, "menuChrome")).toBe(false);
    expect(ruleSetIncludes(font, "fonts")).toBe(true);

    const star = tagsFor("GJ_starsIcon_001.png");
    expect(star).toContain("symbols");
    expect(ruleSetIncludes(star, "menuChrome")).toBe(false);
    expect(ruleSetIncludes(star, "symbols")).toBe(true);

    const play = tagsFor("GJ_playBtn_001.png");
    expect(ruleSetIncludes(play, "menuChrome")).toBe(true);

    for (const name of [
      "dailyLevelLabel_001.png",
      "shopRope_001.png",
      "garageRope_001.png",
      "dailyLevelCorner_001.png",
      "GJ_levelComplete_001.png",
      "GJ_newBest_001.png",
      "GJ_select_001.png",
      "loadingCircle-uhd.png",
      "smallDot-hd.png",
      "GJ_squareB_01-uhd.png",
      "gj_explosionBtn_off_001.png",
      "GJ_pauseBtn_001.png",
    ]) {
      const tags = tagsFor(name);
      expect(ruleSetIncludes(tags, "menuChrome"), name).toBe(true);
    }

    for (const name of [
      "bonusShardLabel_001.png",
      "fireShardLabel_001.png",
      "shard0201ShardLabel_001.png",
      "label_shards_001.png",
      "GJ_nameTxt_001.png",
      "achievementGlow_001.png",
      "GJ_adVideoBtn_001.png",
      "GJ_ncsLibraryBtn_001.png",
      "GJ_paintBtn_001.png",
      "GJ_pauseBtn_clean_001.png",
      "gj_folderBtn_001.png",
      "folderIcon_001.png",
      "levelLeaderboard_friendsBtn_001.png",
      "levelLeaderboard_globalBtn_001.png",
      "levelLeaderboard_globalWeeklyBtn_001.png",
      "levelLeaderboard_localBtn_001.png",
      "GJ_checkpointBtn_001.png",
      "GJ_removeCheckBtn_001.png",
      "adRope_001.png",
    ]) {
      const tags = tagsFor(name);
      expect(ruleSetIncludes(tags, "menuChrome"), name).toBe(false);
    }

    const rope = tagsFor("shopRope_001.png");
    expect(rope).not.toContain("shop");
    const shardLabel = tagsFor("bonusShardLabel_001.png");
    expect(shardLabel).not.toContain("symbols");
    expect(shardLabel).not.toContain("chrome");
    const gauntletCorner = tagsFor("gauntletCorner_001.png");
    expect(ruleSetIncludes(gauntletCorner, "menuChrome")).toBe(false);
    expect(ruleSetIncludes(gauntletCorner, "gauntlets")).toBe(true);

    for (const name of ["GJ_arrow_01_001.png", "GJ_arrow_02_001.png", "GJ_arrow_03_001.png", "GJ_infoIcon_001.png"]) {
      const tags = tagsFor(name);
      expect(tags, name).not.toContain("symbols");
      expect(ruleSetIncludes(tags, "menuChrome"), name).toBe(true);
    }
    const achievementButton = tagSprite(
      "GJ_GameSheet03-uhd/GJ_achBtn_001.png",
      "GJ_achBtn_001.png",
      "GJ_GameSheet03-uhd",
    );
    expect(achievementButton).toContain("chrome");
    expect(achievementButton).not.toContain("symbols");
    expect(ruleSetIncludes(achievementButton, "menuChrome")).toBe(true);
    for (const name of ["edit_buildBtn_001.png", "edit_buildSBtn_001.png", "edit_deleteBtn_001.png", "edit_editBtn_001.png"]) {
      const tags = tagsFor(name);
      expect(tags, name).not.toContain("editor");
      expect(ruleSetIncludes(tags, "menuChrome"), name).toBe(true);
    }
    const editorTool = tagsFor("edit_delBtn_001.png");
    expect(ruleSetIncludes(editorTool, "menuChrome")).toBe(false);
    expect(ruleSetIncludes(editorTool, "editor")).toBe(true);
    const controller = tagsFor("controllerBtn_A_001.png");
    expect(ruleSetIncludes(controller, "menuChrome")).toBe(false);
    const wordmark = tagSprite("GJ_logo_001.png", "GJ_logo_001.png", "GJ_LaunchSheet-uhd");
    expect(ruleSetIncludes(wordmark, "menuChrome")).toBe(true);
    expect(wordmark).not.toContain("logos");
    const robtop = tagSprite("RobTopLogoBig_001.png", "RobTopLogoBig_001.png", "GJ_LaunchSheet-uhd");
    expect(ruleSetIncludes(robtop, "logos")).toBe(true);
    expect(ruleSetIncludes(robtop, "menuChrome")).toBe(false);
    const lost = tagSprite("theLostGauntletsLabel_001.png", "theLostGauntletsLabel_001.png", "GauntletSheet-uhd");
    expect(ruleSetIncludes(lost, "menuChrome")).toBe(true);
    expect(lost).not.toContain("gauntlet");
    const blank = tagSprite("baseCircle_Big_Blue.png", "baseCircle_Big_Blue.png", "BlankSheet-uhd");
    expect(ruleSetIncludes(blank, "menuChrome")).toBe(true);
    expect(blank).not.toContain("geode");
    for (const name of [
      "mods-list-top.png",
      "mods-list-side-gd.png",
      "mods-list-bottom-sapphire.png",
      "updates-available.png",
      "updates-deprecated.png",
      "updates-installed.png",
    ]) {
      const tags = tagSprite(name, name, "APISheet-uhd");
      expect(ruleSetIncludes(tags, "menuChrome"), name).toBe(true);
      expect(tags, name).not.toContain("geode");
    }
    const apiIcon = tagSprite("github.png", "github.png", "APISheet-uhd");
    expect(ruleSetIncludes(apiIcon, "menuChrome")).toBe(false);
    expect(apiIcon).toContain("geode");

    const block = tagSprite("block001_01_001.png", "block001_01_001.png", "GJ_GameSheet-uhd");
    expect(block).toContain("objects");
    expect(ruleSetIncludes(block, "menuChrome")).toBe(false);
    expect(ruleSetIncludes(block, "objects")).toBe(true);
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

  it("drops stored overrides and skips effects when a sprite is excluded", () => {
    const recipe = identityRecipe();
    recipe.bands.red.hueDeg = 40;
    const includes = { button: false, face: true };
    const overrides = overridesForIncluded(
      {
        button: { mode: "custom", recipe },
        face: { mode: "custom", recipe },
      },
      includes,
    );
    expect(overrides.button).toBeUndefined();
    expect(overrides.face?.mode).toBe("custom");
    expect(effectiveRecolor(false, identityRecipe(), { mode: "custom", recipe })).toBeNull();
    expect(effectiveRecolor(false, identityRecipe(), { mode: "strength", amount: 1 })).toBeNull();
    expect(effectiveRecolor(true, identityRecipe(), { mode: "custom", recipe })?.recipe.bands.red.hueDeg).toBe(
      40,
    );
  });
});
