/**
 * Download ncnn-Vulkan portable packages and place Tauri externalBin + model
 * resources for the current host (or all CI targets).
 *
 * Usage:
 *   node ./scripts/fetch-upscaler-binaries.mjs
 *   node ./scripts/fetch-upscaler-binaries.mjs --all   # Windows + macOS x64/arm64 when available
 *
 * Add a kind to SHIPPED (and tauri.conf.json externalBin) when bundling another sidecar.
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const binariesDir = join(root, "src-tauri", "binaries");
const resourcesDir = join(root, "src-tauri", "resources", "upscaler");

const REALESRGAN_TAG = "v0.2.5.0";
const REALESRGAN_DATE = "20220424";
const WAIFU2X_TAG = "20250915";

const PACKAGES = {
  realesrgan: {
    binaryBaseName: "realesrgan-ncnn-vulkan",
    modelsDest: "models-realesrgan",
    copyOpenMpDll: false,
    notice: [
      "Real-ESRGAN ncnn Vulkan — BSD-3-Clause / MIT (xinntao / nihui)",
      "  https://github.com/xinntao/Real-ESRGAN",
      "  https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan",
    ],
    platforms: {
      windows: {
        url: `https://github.com/xinntao/Real-ESRGAN/releases/download/${REALESRGAN_TAG}/realesrgan-ncnn-vulkan-${REALESRGAN_DATE}-windows.zip`,
        triples: ["x86_64-pc-windows-msvc"],
        exeName: "realesrgan-ncnn-vulkan.exe",
      },
      macos: {
        url: `https://github.com/xinntao/Real-ESRGAN/releases/download/${REALESRGAN_TAG}/realesrgan-ncnn-vulkan-${REALESRGAN_DATE}-macos.zip`,
        triples: ["x86_64-apple-darwin", "aarch64-apple-darwin"],
        exeName: "realesrgan-ncnn-vulkan",
      },
    },
  },
  waifu2x: {
    binaryBaseName: "waifu2x-ncnn-vulkan",
    modelsDest: "models-cunet",
    copyOpenMpDll: true,
    notice: [
      "Waifu2x ncnn Vulkan — MIT (nihui / nagadomi waifu2x)",
      "  https://github.com/nihui/waifu2x-ncnn-vulkan",
      "  https://github.com/nagadomi/waifu2x",
    ],
    platforms: {
      windows: {
        url: `https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/${WAIFU2X_TAG}/waifu2x-ncnn-vulkan-${WAIFU2X_TAG}-windows.zip`,
        triples: ["x86_64-pc-windows-msvc"],
        exeName: "waifu2x-ncnn-vulkan.exe",
      },
      macos: {
        url: `https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/${WAIFU2X_TAG}/waifu2x-ncnn-vulkan-${WAIFU2X_TAG}-macos.zip`,
        triples: ["x86_64-apple-darwin", "aarch64-apple-darwin"],
        exeName: "waifu2x-ncnn-vulkan",
      },
    },
  },
};

/** Only these kinds are downloaded and bundled. */
const SHIPPED = ["waifu2x", "realesrgan"];

function hostPlatform() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  throw new Error(`Unsupported host platform for upscaler binaries: ${process.platform}`);
}

async function download(url, dest) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function extractZip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
  } else {
    execFileSync("unzip", ["-o", zipPath, "-d", destDir], { stdio: "inherit" });
  }
}

function findFileRecursive(dir, name) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      const found = findFileRecursive(full, name);
      if (found) return found;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

function findDirRecursive(dir, name) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === name) return full;
      const found = findDirRecursive(full, name);
      if (found) return found;
    }
  }
  return null;
}

function copyBinary(srcExe, baseName, triples) {
  mkdirSync(binariesDir, { recursive: true });
  for (const triple of triples) {
    const ext = triple.includes("windows") ? ".exe" : "";
    const dest = join(binariesDir, `${baseName}-${triple}${ext}`);
    cpSync(srcExe, dest);
    console.log(`Wrote ${dest}`);
  }
}

function copyModelsFromExtract(extractRoot, destName) {
  const models =
    findDirRecursive(extractRoot, destName) ||
    findDirRecursive(extractRoot, "models") ||
    findDirRecursive(extractRoot, "models-se");
  if (!models) {
    throw new Error(`Could not find model folder under ${extractRoot}`);
  }
  const dest = join(resourcesDir, destName);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(models, dest, { recursive: true });
  console.log(`Wrote models ${dest}`);
}

async function fetchPackage(kind, platformKey) {
  const pkg = PACKAGES[kind];
  if (!pkg) {
    throw new Error(`Unknown upscaler package kind: ${kind}`);
  }
  const cfg = pkg.platforms[platformKey];
  if (!cfg) {
    throw new Error(`No ${kind} package for platform ${platformKey}`);
  }
  const work = join(tmpdir(), `tm2-upscaler-${kind}-${platformKey}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  const zipPath = join(work, basename(cfg.url));
  try {
    await download(cfg.url, zipPath);
    const extractRoot = join(work, "extract");
    extractZip(zipPath, extractRoot);
    const exe = findFileRecursive(extractRoot, cfg.exeName);
    if (!exe) {
      throw new Error(`Executable ${cfg.exeName} not found in ${cfg.url}`);
    }
    copyBinary(exe, pkg.binaryBaseName, cfg.triples);
    copyModelsFromExtract(extractRoot, pkg.modelsDest);
    if (pkg.copyOpenMpDll) {
      const openMp = findFileRecursive(extractRoot, "vcomp140.dll");
      if (openMp) {
        const dllDest = join(binariesDir, "vcomp140.dll");
        cpSync(openMp, dllDest);
        console.log(`Wrote ${dllDest}`);
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function writeNotice() {
  const lines = ["Third-party upscaler binaries", ""];
  for (const kind of SHIPPED) {
    const pkg = PACKAGES[kind];
    if (pkg?.notice) {
      lines.push(...pkg.notice, "");
    }
  }
  writeFileSync(join(binariesDir, "NOTICE"), lines.join("\n"));
}

function removeBinariesWithBaseName(baseName) {
  if (!existsSync(binariesDir)) return;
  for (const entry of readdirSync(binariesDir)) {
    if (entry === baseName || entry.startsWith(`${baseName}-`)) {
      rmSync(join(binariesDir, entry), { force: true });
      console.log(`Removed unshipped ${entry}`);
    }
  }
}

const LEGACY_CLEANUP = [
  { binaryBaseName: "realcugan-ncnn-vulkan", modelsDest: "models-se" },
];

function cleanupUnshipped() {
  const shipped = new Set(SHIPPED);
  for (const [kind, pkg] of Object.entries(PACKAGES)) {
    if (shipped.has(kind)) continue;
    removeBinariesWithBaseName(pkg.binaryBaseName);
    const models = join(resourcesDir, pkg.modelsDest);
    if (existsSync(models)) {
      rmSync(models, { recursive: true, force: true });
      console.log(`Removed unshipped models ${models}`);
    }
  }
  for (const extra of LEGACY_CLEANUP) {
    removeBinariesWithBaseName(extra.binaryBaseName);
    const models = join(resourcesDir, extra.modelsDest);
    if (existsSync(models)) {
      rmSync(models, { recursive: true, force: true });
      console.log(`Removed leftover models ${models}`);
    }
  }
}

async function main() {
  const all = process.argv.includes("--all");
  mkdirSync(binariesDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });
  cleanupUnshipped();

  const platforms = all ? ["windows", "macos"] : [hostPlatform()];
  for (const platform of platforms) {
    for (const kind of SHIPPED) {
      await fetchPackage(kind, platform);
    }
  }

  writeNotice();
  console.log(`Upscaler binaries and models are ready (${SHIPPED.join(", ")}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
