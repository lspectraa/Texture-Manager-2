import type { EnglishResources } from "./locales/en";

/** Recursively replace string leaves so other locales can differ in text. */
export type LocaleCatalog<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends ReadonlyArray<infer U>
      ? ReadonlyArray<LocaleCatalog<U>>
      : LocaleCatalog<T[K]>;
};

export type AppLocaleResources = LocaleCatalog<EnglishResources>;

export type AppNamespace =
  | "common"
  | "navigation"
  | "onboarding"
  | "settings"
  | "tools"
  | "iconEditor"
  | "reports"
  | "errors";
