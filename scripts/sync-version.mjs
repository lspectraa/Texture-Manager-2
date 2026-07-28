#!/usr/bin/env node
/**
 * Sync package.json version (single source of truth) into Cargo.toml and tauri.conf.json.
 * Frontend reads the version from package.json directly — do not hardcode it elsewhere.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = join(root, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = String(packageJson.version ?? "").trim();

if (!version) {
  throw new Error("package.json is missing a version");
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(
    `package.json version must be numeric SemVer major.minor.patch (got '${version}'). WiX/MSI rejects prerelease tags.`,
  );
}

function readTextNoBom(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function writeTextNoBom(path, text) {
  writeFileSync(path, text, { encoding: "utf8" });
}

function setFileVersion(path, mutator) {
  const text = readTextNoBom(path);
  const next = mutator(text);
  if (next !== text) {
    writeTextNoBom(path, next);
    console.log(`Updated ${path} -> ${version}`);
    return;
  }

  const raw = readFileSync(path);
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    writeTextNoBom(path, text);
    console.log(`Stripped UTF-8 BOM from ${path}`);
  } else {
    console.log(`Unchanged ${path}`);
  }
}

setFileVersion(join(root, "src-tauri", "Cargo.toml"), (text) =>
  text.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`),
);

setFileVersion(join(root, "src-tauri", "tauri.conf.json"), (text) =>
  text.replace(/^(\s*"version"\s*:\s*)"[^"]+"/m, `$1"${version}"`),
);

console.log(`Version sync complete: ${version} (source: package.json)`);
