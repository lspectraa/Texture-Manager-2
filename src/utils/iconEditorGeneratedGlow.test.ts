import { describe, expect, it } from "vitest";
import {
  glowGenKeyForComponent,
  glowMakerOwnedOffset,
  glowMakerPlistOffset,
  isGlowMakerOwnedFrame,
  resolveGlowGenSettings,
} from "./iconEditorGeneratedGlow";

describe("glowGenKeyForComponent", () => {
  it("uses a single key for regular icons", () => {
    expect(
      glowGenKeyForComponent({
        isRobot: false,
        isSpider: false,
        robotPartId: "01",
        spiderPartId: "02",
      }),
    ).toBe("icon");
  });

  it("keys robot and spider parts separately", () => {
    expect(
      glowGenKeyForComponent({
        isRobot: true,
        isSpider: false,
        robotPartId: "03",
        spiderPartId: "01",
      }),
    ).toBe("robot:03");
    expect(
      glowGenKeyForComponent({
        isRobot: false,
        isSpider: true,
        robotPartId: "01",
        spiderPartId: "04",
      }),
    ).toBe("spider:04");
  });
});

describe("resolveGlowGenSettings", () => {
  it("defaults to 4px glow without compositing when unset", () => {
    expect(resolveGlowGenSettings({}, "icon")).toEqual({
      enabled: false,
      thickness: 4,
      compositeLayers: false,
    });
  });
});

describe("glowMakerPlistOffset", () => {
  it("folds primary trim into the glow offset the same way the merger does", () => {
    expect(
      glowMakerPlistOffset({ x: 2, y: -4 }, { left: 4, top: 2, right: 0, bottom: 6 }),
    ).toEqual({
      x: 4,
      y: -2,
    });
  });

  it("keeps a centered primary offset when trim is even", () => {
    expect(
      glowMakerPlistOffset({ x: 1.5, y: 0 }, { left: 2, top: 2, right: 2, bottom: 2 }),
    ).toEqual({
      x: 1.5,
      y: 0,
    });
  });
});

describe("isGlowMakerOwnedFrame", () => {
  it("locks a glow frame once generate is enabled or a generated sprite exists", () => {
    expect(
      isGlowMakerOwnedFrame(
        "player_01_glow_001.png",
        [{ enabled: true, glowFrameName: "player_01_glow_001.png" }],
        [],
      ),
    ).toBe(true);
    expect(
      isGlowMakerOwnedFrame("player_01_glow_001.png", [], [
        { frameName: "player_01_glow_001.png" },
      ]),
    ).toBe(true);
    expect(
      isGlowMakerOwnedFrame(
        "player_01_glow_001.png",
        [{ enabled: false, glowFrameName: "player_01_glow_001.png" }],
        [],
      ),
    ).toBe(false);
  });
});

describe("glowMakerOwnedOffset", () => {
  it("does not take over plist until a generated glow sprite exists", () => {
    expect(
      glowMakerOwnedOffset(
        "player_01_glow_001.png",
        [
          {
            enabled: true,
            glowFrameName: "player_01_glow_001.png",
            glowOffset: { x: 3, y: -1 },
          },
        ],
        [],
      ),
    ).toBeNull();
  });

  it("prefers the live Glow Maker offset over a stale generated frame offset", () => {
    expect(
      glowMakerOwnedOffset(
        "player_01_glow_001.png",
        [
          {
            enabled: true,
            glowFrameName: "player_01_glow_001.png",
            glowOffset: { x: 3, y: -1 },
          },
        ],
        [{ frameName: "player_01_glow_001.png", spriteOffset: { x: 9, y: 9 } }],
      ),
    ).toEqual({ x: 3, y: -1 });
  });
});
