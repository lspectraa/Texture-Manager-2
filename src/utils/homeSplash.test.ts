import { describe, expect, it } from "vitest";
import {
  collectHomeSplashTitles,
  homeSplashGroupsForDate,
  type HomeSplashGroup,
} from "./homeSplash";

function dateAt(weekday: number, hour: number): Date {
  // 2026-08-16 is a Sunday.
  const date = new Date(2026, 7, 16 + weekday, hour, 0, 0, 0);
  return date;
}

describe("homeSplashGroupsForDate", () => {
  it("includes morning titles on a weekday morning", () => {
    expect(homeSplashGroupsForDate(dateAt(1, 8))).toEqual(["general", "morning", "monday"]);
  });

  it("includes friday evening titles", () => {
    expect(homeSplashGroupsForDate(dateAt(5, 19))).toEqual(["general", "evening", "friday"]);
  });

  it("includes weekend night titles", () => {
    expect(homeSplashGroupsForDate(dateAt(0, 23))).toEqual(["general", "night", "weekend"]);
  });

  it("includes afternoon titles without a weekday tag midweek", () => {
    expect(homeSplashGroupsForDate(dateAt(3, 14))).toEqual(["general", "afternoon"]);
  });
});

describe("collectHomeSplashTitles", () => {
  const catalog: Record<HomeSplashGroup, readonly string[]> = {
    general: ["What would you like to work on?", "Pick a tool and jump in."],
    morning: ["Good morning. What's first?"],
    afternoon: [],
    evening: ["Evening studio time."],
    night: ["Late night texture run?"],
    monday: ["Monday. Ease in with a small edit."],
    friday: [],
    weekend: ["Weekend project time."],
  };

  it("keeps general titles and appends matching extras without blanks or duplicates", () => {
    expect(
      collectHomeSplashTitles(["general", "morning", "monday"], (group) => catalog[group]),
    ).toEqual([
      "What would you like to work on?",
      "Pick a tool and jump in.",
      "Good morning. What's first?",
      "Monday. Ease in with a small edit.",
    ]);
  });
});
