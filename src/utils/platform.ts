/** Runtime / shell detection for desktop vs Android (and `?shell=mobile` preview). */

type RuntimeWindow = {
  location?: { search?: string };
  navigator?: { userAgent?: string };
};

function runtimeGlobal(): typeof globalThis | undefined {
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

export const isDesktopPlatform = (): boolean => {
  return isTauriRuntime() && !isAndroidPlatform();
};

function shellQueryOverride(): "mobile" | "desktop" | null {
  const value = new URLSearchParams(runtimeWindow()?.location?.search ?? "").get("shell");
  if (value === "mobile" || value === "desktop") {
    return value;
  }
  return null;
}

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
