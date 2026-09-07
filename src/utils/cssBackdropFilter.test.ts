/// <reference types="node" />
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("CSS backdrop-filter declaration ordering", () => {
  const appCssPath = path.resolve(__dirname, "../App.css");
  const appCssContent = fs.readFileSync(appCssPath, "utf8");

  it("never places backdrop-filter before -webkit-backdrop-filter in declaration blocks", () => {
    // When backdrop-filter precedes -webkit-backdrop-filter, minifiers like LightningCSS
    // drop the standard backdrop-filter in favor of the vendor prefix, which breaks in WebView2.
    const wrongOrderPattern = /backdrop-filter:\s*[^;\n]+;\s*-webkit-backdrop-filter:/g;
    const matches = appCssContent.match(wrongOrderPattern);
    expect(matches).toBeNull();
  });

  it("ensures every -webkit-backdrop-filter is paired with standard backdrop-filter afterwards", () => {
    // Vendor prefix should come first, followed immediately by standard property.
    const pairedPattern = /-webkit-backdrop-filter:\s*([^;\n]+);\s*(?:(?!\})\s)*backdrop-filter:\s*([^;\n]+);/g;
    const pairedMatches = [...appCssContent.matchAll(pairedPattern)];

    // Count all -webkit-backdrop-filter occurrences in the file (excluding comments)
    const allWebkitMatches = appCssContent
      .split("\n")
      .filter((line: string) => line.includes("-webkit-backdrop-filter") && !line.trim().startsWith("/*") && !line.trim().startsWith("*"));

    expect(allWebkitMatches.length).toBeGreaterThan(0);
    expect(pairedMatches.length).toBe(allWebkitMatches.length);
  });

  it("ensures .tm-glass-frost and .tm-home-card-frost include both vendor and standard backdrop filters", () => {
    expect(appCssContent).toMatch(
      /\.tm-glass-frost\s*\{[^}]*-webkit-backdrop-filter:\s*blur\(var\(--tm-glass-blur\)\)[^;]*;\s*backdrop-filter:\s*blur\(var\(--tm-glass-blur\)\)/,
    );
    expect(appCssContent).toMatch(
      /\.tm-home-card-frost\s*\{[^}]*-webkit-backdrop-filter:\s*blur\(var\(--tm-background-card-blur\)\)[^;]*;\s*backdrop-filter:\s*blur\(var\(--tm-background-card-blur\)\)/,
    );
  });
});
