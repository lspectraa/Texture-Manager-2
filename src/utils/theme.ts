/** Shared with settings domain — keep in sync with `AppTheme` in `domain/settings.ts`. */
export type ThemeMode = "dark" | "light";

/** Alias used by settings / Tauri services. */
export type AppTheme = ThemeMode;

/** localStorage fallback when settings backend is unavailable or not yet loaded. */
export const THEME_STORAGE_KEY = "tm2.theme";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

export function isAppTheme(value: unknown): value is AppTheme {
  return isThemeMode(value);
}

export function getStoredTheme(): ThemeMode | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setStoredTheme(theme: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/**
 * Apply theme to the document root.
 * Sets `document.documentElement.dataset.theme` to `"dark"` | `"light"`.
 * Does not persist — Settings should call `setStoredTheme` (and/or save via Tauri).
 */
export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function readDomTheme(): ThemeMode {
  const raw = document.documentElement.dataset.theme;
  return isThemeMode(raw) ? raw : "dark";
}

/**
 * Resolve preference for first paint: localStorage `tm2.theme`, else dark.
 * Settings UI can later call `applyTheme` + `setStoredTheme` when backend theme loads.
 */
export function initTheme(): ThemeMode {
  const theme = getStoredTheme() ?? "dark";
  applyTheme(theme);
  return theme;
}
