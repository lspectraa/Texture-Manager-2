/**
 * Download ncnn-Vulkan portable packages and place Tauri externalBin + model
 * resources for the current host (or all CI targets).
 *
 * Usage:
 *   node ./scripts/fetch-upscaler-binaries.mjs
 *   node ./scripts/fetch-upscaler-binaries.mjs --if-missing
 *   node ./scripts/fetch-upscaler-binaries.mjs --all   # Windows + macOS x64/arm64 when available
 *
 * Add a kind to SHIPPED (and tauri.conf.json externalBin) when bundling another sidecar.
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from "node:fs";
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
    modelsKeepPrefix: "realesr-animevideov3",
    copyOpenMpDll: false,
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

function copyModelsFromExtract(extractRoot, destName, keepPrefix) {
  const models =
    findDirRecursive(extractRoot, destName) ||
    findDirRecursive(extractRoot, "models");
  if (!models) {
    throw new Error(`Could not find model folder under ${extractRoot}`);
  }
  const dest = join(resourcesDir, destName);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(models, dest, { recursive: true });
  if (keepPrefix) {
    for (const entry of readdirSync(dest)) {
      if (!entry.startsWith(keepPrefix)) {
        rmSync(join(dest, entry), { force: true, recursive: true });
        console.log(`Removed unused weight ${entry}`);
      }
    }
  }
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
    copyModelsFromExtract(extractRoot, pkg.modelsDest, pkg.modelsKeepPrefix);
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
  const src = join(resourcesDir, "NOTICE");
  if (!existsSync(src)) {
    throw new Error(`Missing committed NOTICE at ${src}`);
  }
  mkdirSync(binariesDir, { recursive: true });
  cpSync(src, join(binariesDir, "NOTICE"));
}

function packageReady(kind, platformKey) {
  const pkg = PACKAGES[kind];
  const cfg = pkg.platforms[platformKey];
  if (!pkg || !cfg) {
    return false;
  }
  for (const triple of cfg.triples) {
    const ext = triple.includes("windows") ? ".exe" : "";
    if (!existsSync(join(binariesDir, `${pkg.binaryBaseName}-${triple}${ext}`))) {
      return false;
    }
  }
  if (!existsSync(join(resourcesDir, pkg.modelsDest))) {
    return false;
  }
  if (pkg.copyOpenMpDll && platformKey === "windows" && !existsSync(join(binariesDir, "vcomp140.dll"))) {
    return false;
  }
  return true;
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
  const ifMissing = process.argv.includes("--if-missing");
  mkdirSync(binariesDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });
  cleanupUnshipped();

  const platforms = all ? ["windows", "macos"] : [hostPlatform()];
  for (const platform of platforms) {
    for (const kind of SHIPPED) {
      if (ifMissing && packageReady(kind, platform)) {
        console.log(`Skipping ${kind} (${platform}): already present`);
        continue;
      }
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
