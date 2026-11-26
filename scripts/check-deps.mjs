#!/usr/bin/env node
/**
 * Local dependency checks. Publish is the only GitHub Actions trigger;
 * run this by hand instead of a pull_request workflow.
 *
 *   npm run check:deps
 *
 * Needs rustc, cargo, and `cargo audit` (`cargo install cargo-audit`).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = path.join(root, "src-tauri");
const allowlistPath = path.join(tauriDir, "allowed-duplicate-crates.txt");

function fail(message) {
  console.error(`[check:deps] ${message}`);
  process.exit(1);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    fail(`${command} failed to start: ${result.error.message}`);
  }
  return result;
}

function parseRustc(text) {
  const match = text.match(/rustc (\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

function parseRustVersion(text) {
  const match = text.match(/^rust-version\s*=\s*"(\d+)\.(\d+)(?:\.(\d+))?"/m);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

function versionLess(left, right) {
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i];
  }
  return false;
}

function compareVersions(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

function duplicatesFromTree(text) {
  const versions = new Map();
  for (const line of text.split("\n")) {
    const match = line.match(/^(\d+)([A-Za-z_][\w-]*) v(\S+)/);
    if (!match || match[1] !== "0") continue;
    const name = match[2];
    const version = match[3];
    const list = versions.get(name) ?? new Set();
    list.add(version);
    versions.set(name, list);
  }
  const duplicates = new Map();
  for (const [name, list] of versions) {
    if (list.size > 1) {
      duplicates.set(name, [...list].sort(compareVersions));
    }
  }
  return duplicates;
}

function readAllowlist(text) {
  const allow = new Map();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [name, ...versions] = line.split(/\s+/);
    allow.set(name, versions);
  }
  return allow;
}

const cargoToml = fs.readFileSync(path.join(tauriDir, "Cargo.toml"), "utf8");
const required = parseRustVersion(cargoToml);
if (!required) fail("src-tauri/Cargo.toml has no rust-version");

const rustc = run("rustc", ["--version"], root);
if (rustc.status !== 0) {
  fail(rustc.stderr || "rustc --version failed");
}
const actual = parseRustc(rustc.stdout || "");
if (!actual) fail(`could not parse rustc version: ${rustc.stdout}`);
if (versionLess(actual, required)) {
  fail(
    `rustc ${actual.join(".")} is older than the MSRV ${required.join(".")} in src-tauri/Cargo.toml`,
  );
}
console.log(
  `[check:deps] rustc ${actual.join(".")} meets MSRV ${required.join(".")}`,
);

const tauriVersions = run(
  process.execPath,
  [path.join(root, "scripts/check-tauri-versions.mjs")],
  root,
);
process.stdout.write(tauriVersions.stdout || "");
process.stderr.write(tauriVersions.stderr || "");
if (tauriVersions.status !== 0) process.exit(tauriVersions.status ?? 1);

const tree = run(
  "cargo",
  ["tree", "-d", "--locked", "--target", "all", "--prefix", "depth", "--format", "{p}"],
  tauriDir,
);
if (tree.status !== 0) {
  process.stderr.write(tree.stderr || "");
  fail("cargo tree -d --locked failed");
}
const found = duplicatesFromTree(tree.stdout || "");
const allowed = readAllowlist(fs.readFileSync(allowlistPath, "utf8"));
const foundNames = [...found.keys()].sort();
const allowedNames = [...allowed.keys()].sort();
const problems = [];
for (const name of new Set([...foundNames, ...allowedNames])) {
  const left = found.get(name);
  const right = allowed.get(name);
  const rightSorted = right ? [...right].sort(compareVersions) : null;
  if (!left) problems.push(`${name} is in the allowlist but is no longer duplicated`);
  else if (!rightSorted) problems.push(`${name} is a new duplicate (${left.join(", ")})`);
  else if (left.join(" ") !== rightSorted.join(" ")) {
    problems.push(
      `${name}: lockfile has ${left.join(", ")}; allowlist has ${rightSorted.join(", ")}`,
    );
  }
}
if (problems.length > 0) {
  fail(
    `duplicate crate mismatch (src-tauri/allowed-duplicate-crates.txt):\n - ${problems.join("\n - ")}`,
  );
}
console.log(`[check:deps] ${found.size} known duplicate crates`);

const audit = run("cargo", ["audit", "--deny", "warnings"], tauriDir);
process.stdout.write(audit.stdout || "");
process.stderr.write(audit.stderr || "");
if (audit.status !== 0) {
  fail("cargo audit reported an advisory that is not in src-tauri/.cargo/audit.toml");
}

const npmAudit = run("npm", ["audit", "--omit=dev"], root);
process.stdout.write(npmAudit.stdout || "");
process.stderr.write(npmAudit.stderr || "");
if (npmAudit.status !== 0) fail("npm audit --omit=dev failed");

console.log("[check:deps] ok");
