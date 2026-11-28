import { describe, expect, it } from "vitest";
import {
  applyHsvDeltaToRgb,
  buildHsvTrackGradient,
  hsvToRgb,
  rgbToHsv,
  type RgbColor,
} from "./hsvSlider";

const toByte = (color: RgbColor): number[] => color.map((channel) => Math.round(channel * 255));

/** Geode identity base from the TM2 redesign spec: #3EEFD0 / rgb(62, 239, 208). */
const GEODE_BASE: RgbColor = [62 / 255, 239 / 255, 208 / 255];

describe("hsvSlider math (TM2 redesign live-HSV acceptance)", () => {
  it("recolors the Geode base at hue 80° / sat +40% / val +20% to rgb(81, 51, 242)", () => {
    const out = applyHsvDeltaToRgb(GEODE_BASE, { hueDeg: 80, satDelta: 0.4, valDelta: 0.2 });
    expect(toByte(out)).toEqual([81, 51, 242]);
  });

  it("is the identity at 0° / 0% / 0%", () => {
    const out = applyHsvDeltaToRgb(GEODE_BASE, { hueDeg: 0, satDelta: 0, valDelta: 0 });
    expect(toByte(out)).toEqual([62, 239, 208]);
  });

  it("round-trips rgb → hsv → rgb", () => {
    const [h, s, v] = rgbToHsv(...GEODE_BASE);
    expect(toByte(hsvToRgb(h, s, v))).toEqual([62, 239, 208]);
  });

  it("paints the slider track with 13 stops from 0% to 100%", () => {
    const gradient = buildHsvTrackGradient(
      GEODE_BASE,
      { hueDeg: 80, satDelta: 0.4, valDelta: 0.2 },
      "hueDeg",
      -180,
      180,
    );
    const stops = gradient.replace(/^linear-gradient\(90deg, /, "").replace(/\)$/, "").split(/,\s(?=rgb)/);
    expect(stops).toHaveLength(13);
    expect(stops[0]).toMatch(/ 0%$/);
    expect(stops[12]).toMatch(/ 100%$/);
  });
});
