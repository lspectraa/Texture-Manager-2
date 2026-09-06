import { describe, expect, it } from "vitest";
import {
  glowGenBodyLayer,
  glowGenKeyForComponent,
  glowGenSettingsSignature,
  glowGenSourceLayers,
  glowGenSourceToken,
  glowMakerOwnedOffset,
  glowMakerPlistOffset,
  glowOffsetForCompositeSource,
  isExcludedFromGlowComposite,
  isGlowMakerOwnedFrame,
  resolveGlowGenSettings,
  type GlowGenNamedLayer,
} from "./iconEditorGeneratedGlow";

const fakeCanvas = (width: number, height: number): HTMLCanvasElement =>
  ({ width, height }) as HTMLCanvasElement;

const namedLayer = (
  name: string,
  canvas: HTMLCanvasElement | null,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): GlowGenNamedLayer => ({ name, canvas, offset });

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
  it("defaults to 4px glow with compositing when unset at UHD scale", () => {
    expect(resolveGlowGenSettings({}, "icon")).toEqual({
      enabled: false,
      thickness: 4,
      compositeLayers: true,
    });
  });

  it("scales only the default UI thickness for HD and low tiers", () => {
    expect(resolveGlowGenSettings({}, "icon", 2)).toEqual({
      enabled: false,
      thickness: 2,
      compositeLayers: true,
    });
    expect(resolveGlowGenSettings({}, "icon", 4)).toEqual({
      enabled: false,
      thickness: 1,
      compositeLayers: true,
    });
  });

  it("uses saved thickness as-is without tier conversion", () => {
    expect(
      resolveGlowGenSettings({ icon: { enabled: true, thickness: 6, compositeLayers: false } }, "icon", 4),
    ).toEqual({
      enabled: true,
      thickness: 6,
      compositeLayers: false,
    });
  });
});

describe("glowGenSettingsSignature", () => {
  it("is empty when glow generation is off", () => {
    expect(
      glowGenSettingsSignature({
        icon: { enabled: false, thickness: 4, compositeLayers: true },
      }),
    ).toBe("");
  });

  it("changes when enabled glow settings change", () => {
    const enabled = glowGenSettingsSignature({
      icon: { enabled: true, thickness: 4, compositeLayers: true },
    });
    const thicker = glowGenSettingsSignature({
      icon: { enabled: true, thickness: 6, compositeLayers: true },
    });
    expect(enabled).not.toBe("");
    expect(thicker).not.toBe(enabled);
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

describe("isExcludedFromGlowComposite", () => {
  it("rejects existing glow and bird/UFO capsule frames", () => {
    expect(isExcludedFromGlowComposite("bird_14_glow_001.png")).toBe(true);
    expect(isExcludedFromGlowComposite("bird_14_3_001.png")).toBe(true);
    expect(isExcludedFromGlowComposite("player_01_001.png")).toBe(false);
    expect(isExcludedFromGlowComposite("player_01_2_001.png")).toBe(false);
    expect(isExcludedFromGlowComposite("player_01_extra_001.png")).toBe(false);
  });
});

describe("glowGenBodyLayer", () => {
  it("drops glow and capsule canvases so they cannot enter the composite", () => {
    const canvas = fakeCanvas(4, 4);
    expect(glowGenBodyLayer("bird_14_glow_001.png", canvas, { x: 3, y: 1 }).canvas).toBeNull();
    expect(glowGenBodyLayer("bird_14_3_001.png", canvas, { x: 3, y: 1 }).canvas).toBeNull();
    expect(glowGenBodyLayer("bird_14_2_001.png", canvas, { x: 3, y: 1 }).canvas).toBe(canvas);
  });
});

describe("glowOffsetForCompositeSource", () => {
  it("keeps the primary offset when the primary is centered in the source", () => {
    expect(
      glowOffsetForCompositeSource({ x: 2, y: -1 }, 10, 8, 5, 4),
    ).toEqual({ x: 2, y: -1 });
  });

  it("shifts the glow so a composite that extends left still sits on the primary node", () => {
    expect(
      glowOffsetForCompositeSource({ x: 0, y: 0 }, 12, 8, 8, 4),
    ).toEqual({ x: -2, y: 0 });
  });
});

describe("glowGenSourceToken", () => {
  const primaryCanvas = fakeCanvas(8, 8);
  const secondaryCanvas = fakeCanvas(6, 6);
  const extraCanvas = fakeCanvas(4, 4);
  const primary = namedLayer("player_01_001.png", primaryCanvas, { x: 1, y: 0 });
  const secondary = namedLayer("player_01_2_001.png", secondaryCanvas, { x: 2, y: -1 });
  const extra = namedLayer("player_01_extra_001.png", extraCanvas);

  it("ignores secondary and extra when compositing is off", () => {
    const base = glowGenSourceToken({
      compositeLayers: false,
      primary,
      secondary,
      extra,
    });
    const movedSecondary = glowGenSourceToken({
      compositeLayers: false,
      primary,
      secondary: { ...secondary, offset: { x: 9, y: 9 } },
      extra,
    });
    const replacedExtra = glowGenSourceToken({
      compositeLayers: false,
      primary,
      secondary,
      extra: namedLayer("player_01_extra_001.png", fakeCanvas(4, 4)),
    });
    expect(movedSecondary).toBe(base);
    expect(replacedExtra).toBe(base);
  });

  it("changes when the primary sprite or offset changes without compositing", () => {
    const base = glowGenSourceToken({
      compositeLayers: false,
      primary,
      secondary,
      extra,
    });
    const moved = glowGenSourceToken({
      compositeLayers: false,
      primary: { ...primary, offset: { x: 4, y: 0 } },
      secondary,
      extra,
    });
    const replaced = glowGenSourceToken({
      compositeLayers: false,
      primary: namedLayer("player_01_001.png", fakeCanvas(8, 8), primary.offset),
      secondary,
      extra,
    });
    expect(moved).not.toBe(base);
    expect(replaced).not.toBe(base);
  });

  it("changes when any body layer changes while compositing", () => {
    const base = glowGenSourceToken({
      compositeLayers: true,
      primary,
      secondary,
      extra,
    });
    const movedSecondary = glowGenSourceToken({
      compositeLayers: true,
      primary,
      secondary: { ...secondary, offset: { x: 8, y: 0 } },
      extra,
    });
    const replacedPrimary = glowGenSourceToken({
      compositeLayers: true,
      primary: namedLayer("player_01_001.png", fakeCanvas(8, 8), primary.offset),
      secondary,
      extra,
    });
    expect(movedSecondary).not.toBe(base);
    expect(replacedPrimary).not.toBe(base);
  });
});

describe("glowGenSourceLayers", () => {
  it("includes secondary in the composite stack when a canvas is present", () => {
    const primaryCanvas = fakeCanvas(8, 8);
    const secondaryCanvas = fakeCanvas(6, 6);
    const layers = glowGenSourceLayers({
      compositeLayers: true,
      primary: namedLayer("player_01_001.png", primaryCanvas),
      secondary: namedLayer("player_01_2_001.png", secondaryCanvas, { x: 2, y: 0 }),
      extra: namedLayer("player_01_extra_001.png", null),
    });
    expect(layers).toEqual([
      { canvas: secondaryCanvas, offset: { x: 2, y: 0 } },
      { canvas: primaryCanvas, offset: { x: 0, y: 0 } },
    ]);
  });

  it("uses only the primary when compositing is off", () => {
    const primaryCanvas = fakeCanvas(8, 8);
    const secondaryCanvas = fakeCanvas(6, 6);
    expect(
      glowGenSourceLayers({
        compositeLayers: false,
        primary: namedLayer("player_01_001.png", primaryCanvas, { x: 1, y: 2 }),
        secondary: namedLayer("player_01_2_001.png", secondaryCanvas),
        extra: namedLayer("player_01_extra_001.png", null),
      }),
    ).toEqual([{ canvas: primaryCanvas, offset: { x: 1, y: 2 } }]);
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
