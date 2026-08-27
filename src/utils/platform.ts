/** Runtime / shell detection for desktop vs Android (and `?shell=mobile` preview). */

type RuntimeWindow = {
  location?: { search?: string };
  navigator?: { userAgent?: string };
};

function runtimeGlobal(): (typeof globalThis & { localStorage?: Storage }) | undefined {
  return typeof globalThis === "undefined" ? undefined : globalThis;
}

function runtimeWindow(): RuntimeWindow | undefined {
  const root = runtimeGlobal() as { window?: RuntimeWindow } | undefined;
  return root?.window;
}

function runtimeNavigator(): { userAgent?: string } | undefined {
  const fromWindow = runtimeWindow()?.navigator;
  if (fromWindow) {
    return fromWindow;
  }
  return (runtimeGlobal() as { navigator?: { userAgent?: string } } | undefined)
    ?.navigator;
}

function runtimeDocument(): { documentElement?: { dataset: DOMStringMap } } | undefined {
  return (runtimeGlobal() as { document?: { documentElement?: { dataset: DOMStringMap } } } | undefined)
    ?.document;
}

export const isTauriRuntime = (): boolean => {
  const win = runtimeWindow() as (RuntimeWindow & { __TAURI_INTERNALS__?: unknown }) | undefined;
  return Boolean(win && "__TAURI_INTERNALS__" in win);
};

export const isAndroidPlatform = (): boolean => {
  const userAgent = runtimeNavigator()?.userAgent;
  if (!userAgent) {
    return false;
  }
  return /android/i.test(userAgent);
};

export const isMacPlatform = (): boolean => {
  const userAgent = runtimeNavigator()?.userAgent;
  if (!userAgent) {
    return false;
  }
  return /Mac OS X|Macintosh/i.test(userAgent) && !/iPhone|iPad|iPod/i.test(userAgent);
};

export const isLinuxPlatform = (): boolean => {
  const userAgent = runtimeNavigator()?.userAgent;
  if (!userAgent) {
    return false;
  }
  return /Linux/i.test(userAgent) && !/android/i.test(userAgent);
};

export const isDesktopPlatform = (): boolean => {
  return isTauriRuntime() && !isAndroidPlatform();
};

/** Example Geometry Dash install path shown in Settings / onboarding. */
export const geometryDashPathPlaceholder = (): string => {
  if (isAndroidPlatform()) {
    return "/storage/emulated/0/Android/media/com.geode.launcher/game/geode";
  }
  if (isMacPlatform()) {
    return "~/Library/Application Support/Steam/steamapps/common/Geometry Dash";
  }
  if (isLinuxPlatform()) {
    return "~/.steam/steam/steamapps/common/Geometry Dash";
  }
  return "C:/Program Files (x86)/Steam/steamapps/common/Geometry Dash";
};

function queryParam(name: string): string | null {
  return new URLSearchParams(runtimeWindow()?.location?.search ?? "").get(name);
}

function shellQueryOverride(): "mobile" | "desktop" | null {
  const value = queryParam("shell");
  if (value === "mobile" || value === "desktop") {
    return value;
  }
  return null;
}

/** Dev/test: `?simulateUpdate=1` or `localStorage.tmSimulateUpdate=1` fakes an available update. */
export const isSimulateUpdateEnabled = (): boolean => {
  const value = queryParam("simulateUpdate")?.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes") {
    return true;
  }
  try {
    const stored = runtimeGlobal()?.localStorage?.getItem("tmSimulateUpdate")?.trim().toLowerCase();
    return stored === "1" || stored === "true" || stored === "yes";
  } catch {
    return false;
  }
};

export const isMobileShell = (): boolean => {
  const override = shellQueryOverride();
  if (override === "mobile") {
    return true;
  }
  if (override === "desktop") {
    return false;
  }
  return isAndroidPlatform();
};

export const applyShellDataset = (): void => {
  const root = runtimeDocument()?.documentElement;
  if (!root) {
    return;
  }
  root.dataset.shell = isMobileShell() ? "mobile" : "desktop";
};
