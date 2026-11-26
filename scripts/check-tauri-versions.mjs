#!/usr/bin/env node
/**
 * Tauri crate floors and the npm packages must share major.minor.
 * `tauri` / `tauri-build` in Cargo.toml must be the locked patch, not "2".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`[check:tauri-versions] ${message}`);
  process.exitCode = 1;
}

function majorMinor(version) {
  const match = String(version).match(/^(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`not a version: ${version}`);
  }
  return `${match[1]}.${match[2]}`;
}

function parseCargoLockPackages(text) {
  const packages = new Map();
  const re = /\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/g;
  for (const match of text.matchAll(re)) {
    const [, name, version] = match;
    const list = packages.get(name) ?? [];
    list.push(version);
    packages.set(name, list);
  }
  return packages;
}

function lockedVersion(packages, name) {
  const versions = packages.get(name);
  if (!versions || versions.length !== 1) {
    throw new Error(
      `${name} should appear once in Cargo.lock, found ${versions ? versions.join(", ") : "nothing"}`,
    );
  }
  return versions[0];
}

function cargoTomlVersion(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const table = new RegExp(
    `^${escaped}\\s*=\\s*\\{[^}\\n]*version\\s*=\\s*"([^"]+)"`,
    "m",
  );
  const plain = new RegExp(`^${escaped}\\s*=\\s*"([^"]+)"`, "m");
  const match = text.match(table) ?? text.match(plain);
  return match ? match[1] : null;
}

const cargoToml = fs.readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8");
const cargoLock = fs.readFileSync(path.join(root, "src-tauri/Cargo.lock"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const locked = parseCargoLockPackages(cargoLock);

function npmVersion(name) {
  return packageLock.packages?.[`node_modules/${name}`]?.version ?? null;
}

const tauriLocked = lockedVersion(locked, "tauri");
const tauriBuildLocked = lockedVersion(locked, "tauri-build");
const tauriFloor = cargoTomlVersion(cargoToml, "tauri");
const tauriBuildFloor = cargoTomlVersion(cargoToml, "tauri-build");
const apiVersion = npmVersion("@tauri-apps/api");

if (tauriFloor !== tauriLocked) {
  fail(`Cargo.toml tauri floor is ${tauriFloor}, Cargo.lock has ${tauriLocked}`);
}
if (tauriBuildFloor !== tauriBuildLocked) {
  fail(
    `Cargo.toml tauri-build floor is ${tauriBuildFloor}, Cargo.lock has ${tauriBuildLocked}`,
  );
}
if (!apiVersion) {
  fail("package-lock.json has no @tauri-apps/api");
} else if (majorMinor(tauriLocked) !== majorMinor(apiVersion)) {
  fail(
    `tauri ${tauriLocked} and @tauri-apps/api ${apiVersion} do not share major.minor`,
  );
}

const npmDeps = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies,
};
for (const [npmName, npmRange] of Object.entries(npmDeps)) {
  if (!npmName.startsWith("@tauri-apps/plugin-")) continue;
  const crate = `tauri-${npmName.slice("@tauri-apps/".length)}`;
  const crateVersion = lockedVersion(locked, crate);
  const installed = npmVersion(npmName);
  if (!installed) {
    fail(`${npmName} (${npmRange}) is missing from package-lock.json`);
    continue;
  }
  if (majorMinor(crateVersion) !== majorMinor(installed)) {
    fail(
      `${crate} ${crateVersion} and ${npmName} ${installed} do not share major.minor`,
    );
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("[check:tauri-versions] tauri crate floors match the lockfile and npm major.minor");
