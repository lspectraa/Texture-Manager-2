export const HOME_SPLASH_INTERVAL_MS = 20000;
export const HOME_SPLASH_FADE_MS = 220;

export const HOME_SPLASH_GROUPS = [
  "general",
  "morning",
  "afternoon",
  "evening",
  "night",
  "monday",
  "friday",
  "weekend",
] as const;

export type HomeSplashGroup = (typeof HOME_SPLASH_GROUPS)[number];

function timeOfDayGroup(hour: number): Exclude<HomeSplashGroup, "general" | "monday" | "friday" | "weekend"> {
  if (hour >= 5 && hour < 12) {
    return "morning";
  }
  if (hour >= 12 && hour < 17) {
    return "afternoon";
  }
  if (hour >= 17 && hour < 22) {
    return "evening";
  }
  return "night";
}

export function homeSplashGroupsForDate(now: Date): HomeSplashGroup[] {
  const groups: HomeSplashGroup[] = ["general", timeOfDayGroup(now.getHours())];
  const day = now.getDay();

  if (day === 1) {
    groups.push("monday");
  } else if (day === 5) {
    groups.push("friday");
  } else if (day === 0 || day === 6) {
    groups.push("weekend");
  }

  return groups;
}

export function collectHomeSplashTitles(
  groups: readonly HomeSplashGroup[],
  resolve: (group: HomeSplashGroup) => readonly string[],
): string[] {
  const titles: string[] = [];
  for (const group of groups) {
    for (const title of resolve(group)) {
      const trimmed = title.trim();
      if (trimmed.length > 0 && !titles.includes(trimmed)) {
        titles.push(trimmed);
      }
    }
  }
  return titles;
}
