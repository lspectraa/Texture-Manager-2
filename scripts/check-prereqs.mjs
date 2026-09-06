#!/usr/bin/env node
/**
 * Cross-platform prerequisite check (Node / npm / Rust).
 * Replaces the Windows-only PowerShell script for macOS and Linux.
 */
import { spawnSync } from "node:child_process";

function hasCommand(name) {
  const result = spawnSync(name, ["--version"], {
    encoding: "utf8",
    shell: false,
  });
  // Some tools (e.g. winget) may exit non-zero but still exist; check PATH via `which`/`where`.
  if (result.error && result.error.code === "ENOENT") return false;
  return true;
}

function commandVersion(name, args = ["--version"]) {
  const result = spawnSync(name, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr || "").trim().split("\n")[0];
}

function nodeMajor() {
  const raw = commandVersion("node", ["--version"]);
  if (!raw) return null;
  const match = raw.match(/^v?(\d+)/);
  return match ? Number(match[1]) : null;
}

function status(label, ok) {
  console.log(`${ok ? "[OK]" : "[MISSING]"} ${label}`);
}

console.log("Texture Manager 2 prerequisite check");
console.log("-------------------------------------");

const hasNode = hasCommand("node");
const hasNpm = hasCommand("npm");
const hasRustc = hasCommand("rustc");
const hasCargo = hasCommand("cargo");
const hasWinget = process.platform === "win32" && hasCommand("winget");
const major = hasNode ? nodeMajor() : null;
const nodeOk = hasNode && major !== null && major >= 24;

status("node (>=24)", nodeOk);
status("npm", hasNpm);
status("rustc", hasRustc);
status("cargo", hasCargo);
if (process.platform === "win32") {
  status("winget", hasWinget);
}
if (process.platform === "darwin") {
  const hasXcodeSelect = hasCommand("xcode-select");
  status("xcode-select (CLT)", hasXcodeSelect);
}

if (hasNode) console.log(commandVersion("node", ["--version"]));
if (hasNpm) console.log(commandVersion("npm", ["--version"]));
if (hasRustc) console.log(commandVersion("rustc", ["--version"]));
if (hasCargo) console.log(commandVersion("cargo", ["--version"]));
if (hasWinget) console.log(commandVersion("winget", ["--version"]));

const missing = [];
if (!hasNode) {
  missing.push("Node.js 24+");
} else if (!nodeOk) {
  missing.push(`Node.js 24+ (found v${major})`);
}
if (!hasNpm) missing.push("npm");
if (!hasRustc || !hasCargo) missing.push("Rust toolchain (rustup/rustc/cargo)");

if (missing.length > 0) {
  console.log("");
  console.log("Missing prerequisites:");
  for (const item of missing) console.log(` - ${item}`);
  console.log("");
  if (process.platform === "darwin") {
    console.log("Install hints (macOS):");
    console.log(" - Xcode CLT: xcode-select --install");
    console.log(" - Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh");
    console.log(" - Node 24+: brew install node@24   (or nvm/fnm with .nvmrc)");
  } else if (process.platform === "win32") {
    console.log("Install hints (Windows):");
    console.log(" - Rust: winget install Rustlang.Rustup");
    console.log(" - Node 24: winget install OpenJS.NodeJS");
  } else {
    console.log("Install hints:");
    console.log(" - Rust: https://rustup.rs");
    console.log(" - Node 24+: https://nodejs.org (or nvm/fnm with .nvmrc)");
  }
  console.log("");
  console.log("After install, restart terminal and rerun:");
  console.log(" npm run check:env");
  process.exit(1);
}

console.log("");
console.log("All required Phase 0 prerequisites are installed.");
