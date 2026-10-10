import { describe, expect, it } from "vitest";
import {
  ALL_BANDS,
  CHROMATIC_BANDS,
  GOLD_CENTER_DEG,
  applyColorRecipeToRgba,
  hsvToRgb,
  identityRecipe,
  rgbToHsv,
  type ColorRecipe,
} from "./menuRecolorColor";

function withChromatic(hueDeg: number, satDelta = 0, valDelta = 0): ColorRecipe {
  const recipe = identityRecipe();
  for (const [band] of CHROMATIC_BANDS) {
    recipe.bands[band] = { hueDeg, satDelta, valDelta };
  }
  return recipe;
}

function circularDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

describe("menu recolor band apply", () => {
  it("gray lock does not take a random hue", () => {
    const recipe = withChromatic(120, 1, 0);
    recipe.locks.neutral = true;
    expect(applyColorRecipeToRgba(180, 180, 180, 255, recipe, 1)).toEqual([180, 180, 180, 255]);
  });

  it("gold lock freezes an amber pixel", () => {
    const recipe = withChromatic(80, 0.4, 0.2);
    recipe.locks.gold = true;
    const gold = goldPixel();
    expect(applyColorRecipeToRgba(gold[0], gold[1], gold[2], 255, recipe, 1)).toEqual([
      gold[0],
      gold[1],
      gold[2],
      255,
    ]);
  });

  it("hue wraps past zero", () => {
    const recipe = withChromatic(-30);
    recipe.locks.gold = true;
    const [r, g, b] = applyColorRecipeToRgba(255, 0, 0, 255, recipe, 1);
    const [h, s] = rgbToHsv(r / 255, g / 255, b / 255);
    expect(s).toBeGreaterThan(0.5);
    expect(circularDist(h, 330 / 360)).toBeLessThan(0.02);
  });

  it("keeps alpha and leaves transparent pixels untouched", () => {
    const recipe = withChromatic(90);
    expect(applyColorRecipeToRgba(255, 0, 0, 0, recipe, 1)).toEqual([255, 0, 0, 0]);
    const shifted = applyColorRecipeToRgba(255, 0, 0, 200, recipe, 1);
    expect(shifted[3]).toBe(200);
    expect(shifted.slice(0, 3)).not.toEqual([255, 0, 0]);
  });

  it("stores an empty point list", () => {
    const recipe = identityRecipe();
    expect(recipe.points).toEqual([]);
    expect(ALL_BANDS).toHaveLength(10);
  });

  it("honors a narrower green band size", () => {
    const recipe = identityRecipe();
    recipe.locks.gold = true;
    recipe.bands.green.hueDeg = 40;
    recipe.bands.green.radiusDeg = 20;
    recipe.bands.green.radiusLowDeg = 20;
    recipe.bands.green.radiusHighDeg = 20;
    const [r, g, b] = hsvToRgb(165 / 360, 1, 1);
    const source: [number, number, number, number] = [
      Math.round(r * 255),
      Math.round(g * 255),
      Math.round(b * 255),
      255,
    ];
    expect(applyColorRecipeToRgba(source[0], source[1], source[2], 255, recipe, 1)).toEqual(source);
  });

  it("sizes the two sides of a band independently", () => {
    const recipe = identityRecipe();
    recipe.locks.gold = true;
    recipe.bands.green.hueDeg = 40;
    recipe.bands.green.radiusLowDeg = 56;
    recipe.bands.green.radiusHighDeg = 20;
    const [hr, hg, hb] = hsvToRgb(165 / 360, 1, 1);
    const high: [number, number, number, number] = [
      Math.round(hr * 255),
      Math.round(hg * 255),
      Math.round(hb * 255),
      255,
    ];
    expect(applyColorRecipeToRgba(high[0], high[1], high[2], 255, recipe, 1)).toEqual(high);
    const [lr, lg, lb] = hsvToRgb(80 / 360, 1, 1);
    const low: [number, number, number, number] = [
      Math.round(lr * 255),
      Math.round(lg * 255),
      Math.round(lb * 255),
      255,
    ];
    expect(applyColorRecipeToRgba(low[0], low[1], low[2], 255, recipe, 1)).not.toEqual(low);
  });

  it("lets the wider green band reach hue 165 without moving yellow", () => {
    const recipe = identityRecipe();
    recipe.locks.gold = true;
    recipe.bands.green.hueDeg = 40;
    const [r, g, b] = hsvToRgb(165 / 360, 1, 1);
    const source: [number, number, number, number] = [
      Math.round(r * 255),
      Math.round(g * 255),
      Math.round(b * 255),
      255,
    ];
    expect(applyColorRecipeToRgba(source[0], source[1], source[2], 255, recipe, 1)).not.toEqual(source);
    const [yr, yg, yb] = hsvToRgb(60 / 360, 1, 1);
    const yellow: [number, number, number, number] = [
      Math.round(yr * 255),
      Math.round(yg * 255),
      Math.round(yb * 255),
      255,
    ];
    expect(applyColorRecipeToRgba(yellow[0], yellow[1], yellow[2], 255, recipe, 1)).toEqual(yellow);
  });

  it("uses Lightroom Color Mixer hue centers", () => {
    expect(CHROMATIC_BANDS.map(([id, deg]) => [id, deg])).toEqual([
      ["red", 0],
      ["orange", 30],
      ["yellow", 60],
      ["green", 120],
      ["aqua", 180],
      ["blue", 225],
      ["purple", 285],
      ["magenta", 330],
    ]);
  });
});

function goldPixel(): [number, number, number] {
  const [r, g, b] = hsvToRgb(GOLD_CENTER_DEG / 360, 0.9, 0.95);
  return [
    Math.round(Math.max(0, Math.min(1, r)) * 255),
    Math.round(Math.max(0, Math.min(1, g)) * 255),
    Math.round(Math.max(0, Math.min(1, b)) * 255),
  ];
}
