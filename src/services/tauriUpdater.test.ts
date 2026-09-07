import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkForAppUpdate,
  getAppPackageVersion,
  withTimeout,
} from "./tauriUpdater";

describe("tauriUpdater", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("withTimeout", () => {
    it("resolves when promise resolves before timeout", async () => {
      const result = await withTimeout(
        Promise.resolve("success"),
        1000,
        "timed out",
      );
      expect(result).toBe("success");
    });

    it("rejects when promise rejects before timeout", async () => {
      await expect(
        withTimeout(Promise.reject(new Error("original error")), 1000, "timed out"),
      ).rejects.toThrow("original error");
    });

    it("rejects with timeout message when promise exceeds timeout", async () => {
      vi.useFakeTimers();
      const neverResolves = new Promise((resolve) => {
        void resolve;
      });
      const timeoutPromise = withTimeout(neverResolves, 500, "Operation timed out");

      vi.advanceTimersByTime(501);

      await expect(timeoutPromise).rejects.toThrow("Operation timed out");
    });
  });

  describe("outside Tauri runtime", () => {
    it("returns unsupported status", async () => {
      vi.stubGlobal("window", {});
      const result = await checkForAppUpdate();
      expect(result).toEqual({ status: "unsupported" });
    });

    it("returns package version fallback", async () => {
      vi.stubGlobal("window", {});
      const version = await getAppPackageVersion();
      expect(typeof version).toBe("string");
      expect(version.length).toBeGreaterThan(0);
    });
  });

  describe("simulated update mode", () => {
    it("returns simulated available update when simulateUpdate query param is set", async () => {
      vi.stubGlobal("window", {
        location: { search: "?simulateUpdate=1" },
      });
      const result = await checkForAppUpdate();
      expect(result.status).toBe("available");
      if (result.status === "available") {
        expect(result.update.notes).toContain("Simulated update");
      }
    });
  });

  describe("Android update checks", () => {
    function setupAndroidMocks(invokeMock: (cmd: string) => Promise<unknown>) {
      const mockInternals = {
        invoke: invokeMock,
      };
      vi.stubGlobal("window", {
        __TAURI_INTERNALS__: mockInternals,
        navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" },
      });
      vi.stubGlobal("__TAURI_INTERNALS__", mockInternals);
    }

    it("returns available update when android_check_app_update finds a newer version", async () => {
      const invokeMock = vi.fn().mockImplementation((cmd: string) => {
        if (cmd === "plugin:app|version") {
          return Promise.resolve("0.4.0");
        }
        if (cmd === "android_check_app_update") {
          return Promise.resolve({
            status: "available",
            currentVersion: "0.4.0",
            version: "0.4.1",
            notes: "Test notes",
            date: "2026-09-06T00:00:00Z",
            url: "https://github.com/lspectraa/Texture-Manager-2/releases/download/v0.4.1/app.apk",
            sha256: "e".repeat(64),
          });
        }
        return Promise.reject(new Error(`Unhandled command: ${cmd}`));
      });
      setupAndroidMocks(invokeMock);

      const result = await checkForAppUpdate();
      expect(result.status).toBe("available");
      if (result.status === "available") {
        expect(result.update.version).toBe("0.4.1");
        expect(result.update.currentVersion).toBe("0.4.0");
        expect(result.update.notes).toBe("Test notes");
      }
    });

    it("returns upToDate status when app is up to date", async () => {
      const invokeMock = vi.fn().mockImplementation((cmd: string) => {
        if (cmd === "plugin:app|version") {
          return Promise.resolve("0.4.1");
        }
        if (cmd === "android_check_app_update") {
          return Promise.resolve({
            status: "upToDate",
            currentVersion: "0.4.1",
          });
        }
        return Promise.reject(new Error(`Unhandled command: ${cmd}`));
      });
      setupAndroidMocks(invokeMock);

      const result = await checkForAppUpdate();
      expect(result).toEqual({
        status: "upToDate",
        currentVersion: "0.4.1",
      });
    });

    it("returns error status with message when android_check_app_update fails", async () => {
      const invokeMock = vi.fn().mockImplementation((cmd: string) => {
        if (cmd === "plugin:app|version") {
          return Promise.resolve("0.4.1");
        }
        if (cmd === "android_check_app_update") {
          return Promise.reject(new Error("Failed to fetch update manifest: network unreachable"));
        }
        return Promise.reject(new Error(`Unhandled command: ${cmd}`));
      });
      setupAndroidMocks(invokeMock);

      const result = await checkForAppUpdate();
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.message).toContain("network unreachable");
        expect(result.currentVersion).toBe("0.4.1");
      }
    });

    it("returns error status when android_check_app_update times out", async () => {
      vi.useFakeTimers();
      const invokeMock = vi.fn().mockImplementation((cmd: string) => {
        if (cmd === "plugin:app|version") {
          return Promise.resolve("0.4.1");
        }
        if (cmd === "android_check_app_update") {
          return new Promise(() => {}); // never resolves
        }
        return Promise.reject(new Error(`Unhandled command: ${cmd}`));
      });
      setupAndroidMocks(invokeMock);

      const checkPromise = checkForAppUpdate();
      await vi.advanceTimersByTimeAsync(26_000);

      const result = await checkPromise;
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.message).toContain("timed out");
      }
    });
  });
});
