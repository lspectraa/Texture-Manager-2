import { describe, expect, it } from "vitest";
import { isAppSandboxPath, shortenPathForDisplay, basenameForDisplay } from "./pathDisplay";

describe("pathDisplay", () => {
  describe("isAppSandboxPath", () => {
    it("returns false for empty or falsy paths", () => {
      expect(isAppSandboxPath("")).toBe(false);
      expect(isAppSandboxPath("   ")).toBe(false);
    });

    it("returns false for standard external storage paths", () => {
      expect(isAppSandboxPath("/storage/emulated/0/Download/Textures")).toBe(false);
      expect(isAppSandboxPath("/storage/emulated/0/Documents/Game/Resources")).toBe(false);
      expect(isAppSandboxPath("C:\\Users\\Game\\Resources")).toBe(false);
    });

    it("returns true for Android app internal sandbox paths", () => {
      expect(
        isAppSandboxPath(
          "/data/user/0/com.spectra.texturemanager2/files/game-files/outputs/batch/12345"
        )
      ).toBe(true);
      expect(
        isAppSandboxPath(
          "/data/data/com.spectra.texturemanager2/files/game-files/imports/12345"
        )
      ).toBe(true);
      expect(
        isAppSandboxPath("/storage/emulated/0/Android/data/com.spectra.texturemanager2/files/game-files/staging")
      ).toBe(true);
      expect(isAppSandboxPath("/some/path/game-files/outputs/tool")).toBe(true);
      expect(isAppSandboxPath("/some/path/game-files/imports/my-folder")).toBe(true);
      expect(isAppSandboxPath("/some/path/game-files/staging/temp.png")).toBe(true);
    });
  });

  describe("basenameForDisplay", () => {
    it("extracts the basename correctly", () => {
      expect(basenameForDisplay("/storage/emulated/0/Download/sheet.png")).toBe("sheet.png");
      expect(basenameForDisplay("C:\\Textures\\GJ_GameSheet.plist")).toBe("GJ_GameSheet.plist");
    });
  });

  describe("shortenPathForDisplay", () => {
    it("keeps parent and basename", () => {
      expect(shortenPathForDisplay("/storage/emulated/0/Download/sheet.png")).toBe("Download/sheet.png");
    });
  });
});
