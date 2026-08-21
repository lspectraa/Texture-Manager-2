import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyShellDataset,
  isAndroidPlatform,
  isDesktopPlatform,
  isMobileShell,
  isTauriRuntime,
} from "./platform";

function installBrowserGlobals(options: {
  userAgent?: string;
  search?: string;
} = {}): { dataset: Record<string, string> } {
  let search = options.search ?? "";
  const dataset: Record<string, string> = {};
  vi.stubGlobal("window", {
    location: {
      get search() {
        return search;
      },
    },
    history: {
      replaceState(_data: unknown, _title: string, url: string) {
        const queryIndex = url.indexOf("?");
        search = queryIndex >= 0 ? url.slice(queryIndex) : "";
      },
    },
  });
  vi.stubGlobal("document", {
    documentElement: { dataset },
  });
  vi.stubGlobal("navigator", {
    userAgent: options.userAgent ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  });
  return { dataset };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("platform detection", () => {
  it("treats missing Tauri internals as a browser runtime", () => {
    installBrowserGlobals();
    expect(isTauriRuntime()).toBe(false);
  });

  it("detects Android from the user agent", () => {
    installBrowserGlobals({
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36",
    });
    expect(isAndroidPlatform()).toBe(true);
    expect(isMobileShell()).toBe(true);
    expect(isDesktopPlatform()).toBe(false);
  });

  it("honors ?shell=mobile for desktop preview", () => {
    installBrowserGlobals({ search: "?shell=mobile" });
    expect(isMobileShell()).toBe(true);
  });

  it("honors ?shell=desktop even on an Android UA", () => {
    installBrowserGlobals({
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36",
      search: "?shell=desktop",
    });
    expect(isMobileShell()).toBe(false);
  });

  it("writes data-shell on the document root", () => {
    const { dataset } = installBrowserGlobals({ search: "?shell=mobile" });
    applyShellDataset();
    expect(dataset.shell).toBe("mobile");
  });
});
