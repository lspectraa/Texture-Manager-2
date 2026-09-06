import { describe, expect, it } from "vitest";
import {
  contentScaleForPlistPath,
  glowThicknessForContentScale,
  graphicsTierFromPlistPath,
  graphicsTierFromStem,
  tierContentScale,
} from "./iconEditorGraphicsTier";

describe("iconEditorGraphicsTier", () => {
  it("detects tier from stem suffix", () => {
    expect(graphicsTierFromStem("player_01-uhd")).toBe("uhd");
    expect(graphicsTierFromStem("player_01-hd")).toBe("hd");
    expect(graphicsTierFromStem("player_01")).toBe("low");
  });

  it("detects tier from plist path", () => {
    expect(graphicsTierFromPlistPath("/gd/Resources/icons/ship_01-hd.plist")).toBe("hd");
    expect(graphicsTierFromPlistPath("C:\\GD\\Resources\\icons\\ufo_02-uhd.plist")).toBe("uhd");
  });

  it("maps tiers to preview content scale", () => {
    expect(tierContentScale("uhd")).toBe(1);
    expect(tierContentScale("hd")).toBe(2);
    expect(tierContentScale("low")).toBe(4);
  });

  it("combines plist path to content scale", () => {
    expect(contentScaleForPlistPath("/icons/robot_01.plist")).toBe(4);
    expect(contentScaleForPlistPath("/icons/robot_01-hd.plist")).toBe(2);
    expect(contentScaleForPlistPath("/icons/robot_01-uhd.plist")).toBe(1);
  });

  it("converts UHD-equivalent glow width to native tier pixels", () => {
    expect(glowThicknessForContentScale(4, 1)).toBe(4);
    expect(glowThicknessForContentScale(4, 2)).toBe(2);
    expect(glowThicknessForContentScale(4, 4)).toBe(1);
    expect(glowThicknessForContentScale(5, 2)).toBe(3);
  });
});
