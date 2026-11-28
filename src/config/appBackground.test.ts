import { describe, expect, it } from "vitest";
import { parseShellBackdropOverride, resolveShellBackdropMode } from "./appBackground";

describe("shell backdrop mode", () => {
  it("shows game art when an image is loaded", () => {
    expect(resolveShellBackdropMode(true, null)).toBe("art");
  });

  it("falls back to the procedural Path landscape when game art is missing", () => {
    expect(resolveShellBackdropMode(false, null)).toBe("procedural");
  });

  it("honours the ?bg= review override", () => {
    expect(resolveShellBackdropMode(true, "placeholder")).toBe("placeholder");
    expect(resolveShellBackdropMode(true, "procedural")).toBe("procedural");
  });

  it("only accepts known override values", () => {
    expect(parseShellBackdropOverride("placeholder")).toBe("placeholder");
    expect(parseShellBackdropOverride("procedural")).toBe("procedural");
    expect(parseShellBackdropOverride("game")).toBeNull();
    expect(parseShellBackdropOverride(null)).toBeNull();
  });
});
