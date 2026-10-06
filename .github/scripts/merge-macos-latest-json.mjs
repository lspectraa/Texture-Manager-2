/**
 * Merge one macOS updater target into the draft release's latest.json.
 *
 * tauri-apps/tauri-action@v0.6.2 (commit 84b9d35) uploadVersionJSON does this
 * inside the action: download latest.json, keep its platforms, set
 * darwin-<arch> and darwin-<arch>-app from the .app.tar.gz URL and .sig,
 * then replace the asset. That read-modify-write is not locked. Windows still
 * uses the action. This script runs only after the verified macOS assets are
 * uploaded, and only once windows-x86_64 is already in the file, then retries
 * if another writer replaces the asset.
 *
 * Run the checks with: SELF_TEST=1 node .github/scripts/merge-macos-latest-json.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const POLL_MS = 20_000;
const MSI_WITHOUT_UPDATER_JSON_MS = 5 * 60_000;
const DEFAULT_MAX_WAIT_MS = 90 * 60_000;
const MERGE_ATTEMPTS = 8;
function settleMs() {
  const raw = process.env.TM_LATEST_JSON_SETTLE_MS;
  if (raw === undefined || raw === "") return 5_000;
  return Number(raw);
}

export function sanitizeAssetName(name) {
  return name
    .trim()
    .replace(/[ ()[\]{}]/g, ".")
    .replace(/\.\./g, ".")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Same rewrite as upload-version-json.ts for draft untagged download URLs. */
export function updaterDownloadUrl(downloadUrl, tagName) {
  return downloadUrl.replace(
    /\/download\/(untagged-[^/]+)\//,
    `/download/${encodeURIComponent(tagName)}/`,
  );
}

export function targetFromArgs(args) {
  const match = String(args ?? "").match(/--target(?:=|\s+)(\S+)/);
  if (!match) {
    throw new Error(`TAURI_ARGS has no --target: ${args}`);
  }
  return match[1];
}

export function archForTarget(target) {
  if (target === "aarch64-apple-darwin") {
    return { assetArch: "aarch64", platformArch: "aarch64" };
  }
  if (target === "x86_64-apple-darwin") {
    return { assetArch: "x64", platformArch: "x86_64" };
  }
  throw new Error(`Unsupported macOS updater target: ${target}`);
}

export function updaterAssetNames(productName, version, assetArch) {
  return {
    tarName: sanitizeAssetName(`${productName}_${assetArch}.app.tar.gz`),
    sigName: sanitizeAssetName(`${productName}_${assetArch}.app.tar.gz.sig`),
    dmgName: sanitizeAssetName(`${productName}_${version}_${assetArch}.dmg`),
  };
}

/**
 * @param {object | null} existing
 * @param {{ version: string, notes: string, pubDate: string, primaryKey: string, bundleKey: string, signature: string, url: string }} patch
 */
export function mergeLatest(existing, patch) {
  const platforms = { ...(existing?.platforms ?? {}) };
  const entry = { signature: patch.signature, url: patch.url };
  platforms[patch.primaryKey] = entry;
  platforms[patch.bundleKey] = entry;
  return {
    version: patch.version,
    notes: existing?.notes ?? patch.notes,
    pub_date: patch.pubDate,
    platforms,
  };
}

export function platformsCover(actual, expected) {
  if (!actual) return false;
  for (const [key, value] of Object.entries(expected)) {
    const got = actual[key];
    if (!got || got.signature !== value.signature || got.url !== value.url) {
      return false;
    }
  }
  return true;
}

function gh(args) {
  try {
    return execFileSync("gh", args, {
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr) : "";
    const stdout = error.stdout ? String(error.stdout) : "";
    throw new Error(
      `gh ${args.join(" ")} failed: ${stderr || stdout || error.message}`,
    );
  }
}

function repoFlag() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is required");
  return ["-R", repo];
}

function listAssets(tag) {
  const raw = gh([
    "release",
    "view",
    tag,
    ...repoFlag(),
    "--json",
    "assets",
  ]);
  const parsed = JSON.parse(raw);
  return parsed.assets ?? [];
}

function downloadLatest(tag) {
  const assets = listAssets(tag);
  if (!assets.some((asset) => asset.name === "latest.json")) {
    return { assets, json: null };
  }
  const dir = mkdtempSync(join(tmpdir(), "tm-latest-"));
  const out = join(dir, "latest.json");
  gh([
    "release",
    "download",
    tag,
    ...repoFlag(),
    "--pattern",
    "latest.json",
    "--output",
    out,
    "--clobber",
  ]);
  return { assets, json: JSON.parse(readFileSync(out, "utf8")) };
}

function uploadLatest(tag, content) {
  const dir = mkdtempSync(join(tmpdir(), "tm-latest-up-"));
  const out = join(dir, "latest.json");
  writeFileSync(out, JSON.stringify(content, null, 2));
  gh(["release", "upload", tag, ...repoFlag(), out, "--clobber"]);
}

function readProductName() {
  const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  if (!conf.productName) throw new Error("tauri.conf.json has no productName");
  return conf.productName;
}

function readAppVersion() {
  const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  if (typeof conf.version === "string" && !conf.version.endsWith(".json")) {
    return conf.version;
  }
  return JSON.parse(readFileSync("package.json", "utf8")).version;
}

function releaseNotes(tag) {
  const raw = gh(["release", "view", tag, ...repoFlag(), "--json", "body"]);
  return JSON.parse(raw).body ?? "";
}

function hasWindowsUpdater(json) {
  const entry = json?.platforms?.["windows-x86_64"];
  return Boolean(entry?.url && entry?.signature);
}

function hasMsiAsset(assets) {
  return assets.some(
    (asset) => asset.name.endsWith(".msi") && !asset.name.endsWith(".msi.sig"),
  );
}

async function waitForWindowsUpdater(tag) {
  const maxWait = Number(
    process.env.TM_LATEST_JSON_MAX_WAIT_MS ?? DEFAULT_MAX_WAIT_MS,
  );
  const started = Date.now();
  let msiSeenAt = null;

  for (;;) {
    const { assets, json } = downloadLatest(tag);
    if (hasWindowsUpdater(json)) {
      console.log("latest.json already contains windows-x86_64");
      return json;
    }

    if (hasMsiAsset(assets) && msiSeenAt === null) {
      msiSeenAt = Date.now();
      console.log("Windows MSI is on the release; waiting for its updater JSON");
    }

    const elapsed = Date.now() - started;
    if (
      msiSeenAt !== null &&
      Date.now() - msiSeenAt >= MSI_WITHOUT_UPDATER_JSON_MS
    ) {
      throw new Error(
        "Windows MSI is on the release but latest.json has no windows-x86_64. Refusing to publish macOS updater JSON that Windows can still overwrite.",
      );
    }
    if (elapsed >= maxWait) {
      throw new Error(
        `Timed out after ${Math.round(elapsed / 1000)}s waiting for windows-x86_64 in latest.json`,
      );
    }

    console.log(
      `Waiting for windows-x86_64 in latest.json (${Math.round(elapsed / 1000)}s elapsed)`,
    );
    await sleep(POLL_MS);
  }
}

async function mergeWithRetry(tag, patch) {
  let last = "";
  for (let attempt = 1; attempt <= MERGE_ATTEMPTS; attempt++) {
    const { json } = downloadLatest(tag);
    if (!hasWindowsUpdater(json)) {
      last = "windows-x86_64 disappeared while merging";
      console.log(`${last} (attempt ${attempt})`);
      await sleep(2000 * attempt);
      continue;
    }

    const merged = mergeLatest(json, {
      ...patch,
      pubDate: new Date().toISOString(),
    });
    uploadLatest(tag, merged);

    const { json: after } = downloadLatest(tag);
    if (
      hasWindowsUpdater(after) &&
      platformsCover(after?.platforms, merged.platforms)
    ) {
      await sleep(settleMs());
      const { json: settled } = downloadLatest(tag);
      if (
        hasWindowsUpdater(settled) &&
        platformsCover(settled?.platforms, merged.platforms)
      ) {
        console.log(
          `latest.json now has ${patch.primaryKey} and ${patch.bundleKey}`,
        );
        return settled;
      }
      last = "latest.json changed during settle";
      console.log(`${last} (attempt ${attempt}); retrying`);
      await sleep(2000 * attempt);
      continue;
    }

    last = "read-back was missing keys just written";
    console.log(`${last} (attempt ${attempt}); retrying`);
    await sleep(2000 * attempt);
  }

  throw new Error(
    `Could not merge ${patch.primaryKey} into latest.json after ${MERGE_ATTEMPTS} attempts: ${last}`,
  );
}

export async function main() {
  const target = targetFromArgs(process.env.TAURI_ARGS);
  const { assetArch, platformArch } = archForTarget(target);
  const productName = readProductName();
  const version = readAppVersion();
  const tag = `v${version}`;
  const names = updaterAssetNames(productName, version, assetArch);
  const sigPath =
    process.env.TM_UPDATER_SIG_PATH ||
    join(
      "src-tauri",
      "target",
      target,
      "release",
      "bundle",
      "macos",
      `${productName}.app.tar.gz.sig`,
    );

  let signature;
  try {
    signature = readFileSync(sigPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      console.warn(
        `No updater signature at ${sigPath}. Skipping latest.json, matching tauri-action when the .sig artifact is absent.`,
      );
      return;
    }
    throw error;
  }
  if (!signature.trim()) {
    throw new Error(`Updater signature at ${sigPath} is empty`);
  }

  const existing = await waitForWindowsUpdater(tag);
  const assets = listAssets(tag);
  const tar = assets.find((asset) => asset.name === names.tarName);
  if (!tar?.url) {
    const found = assets.map((asset) => asset.name).join(", ") || "(none)";
    throw new Error(
      `Release ${tag} has no ${names.tarName}. Assets: ${found}`,
    );
  }

  const url = updaterDownloadUrl(tar.url, tag);
  const primaryKey = `darwin-${platformArch}`;
  const bundleKey = `darwin-${platformArch}-app`;
  console.log(`Merging ${primaryKey} -> ${url}`);

  await mergeWithRetry(tag, {
    version,
    notes: existing?.notes || releaseNotes(tag),
    primaryKey,
    bundleKey,
    signature,
    url,
  });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

export function runSelfTest() {
  const product = "Texture Manager 2";
  const names = updaterAssetNames(product, "0.4.1", "aarch64");
  assertEqual(
    names.tarName,
    "Texture.Manager.2_aarch64.app.tar.gz",
    "tar asset name",
  );
  assertEqual(
    names.sigName,
    "Texture.Manager.2_aarch64.app.tar.gz.sig",
    "sig asset name",
  );
  assertEqual(
    updaterAssetNames(product, "0.4.1", "x64").dmgName,
    "Texture.Manager.2_0.4.1_x64.dmg",
    "dmg asset name",
  );
  assertEqual(
    updaterDownloadUrl(
      "https://github.com/lspectraa/Texture-Manager-2/releases/download/untagged-abc123/Texture.Manager.2_aarch64.app.tar.gz",
      "v0.4.1",
    ),
    "https://github.com/lspectraa/Texture-Manager-2/releases/download/v0.4.1/Texture.Manager.2_aarch64.app.tar.gz",
    "untagged url",
  );
  assertEqual(
    updaterDownloadUrl(
      "https://github.com/lspectraa/Texture-Manager-2/releases/download/v0.4.1/Texture.Manager.2_aarch64.app.tar.gz",
      "v0.4.1",
    ),
    "https://github.com/lspectraa/Texture-Manager-2/releases/download/v0.4.1/Texture.Manager.2_aarch64.app.tar.gz",
    "tagged url",
  );
  assertEqual(
    targetFromArgs("--target aarch64-apple-darwin --bundles dmg"),
    "aarch64-apple-darwin",
    "target parse",
  );
  assertEqual(
    archForTarget("x86_64-apple-darwin").platformArch,
    "x86_64",
    "x64 platform arch",
  );
  assertEqual(
    archForTarget("x86_64-apple-darwin").assetArch,
    "x64",
    "x64 asset arch",
  );

  const signature = "line-one\nline-two\n";
  const windows = {
    signature: "win-sig\n",
    url: "https://github.com/lspectraa/Texture-Manager-2/releases/download/v0.4.1/Texture.Manager.2_0.4.1_x64_en-US.msi",
  };
  const base = {
    version: "0.4.1",
    notes: "release notes",
    pub_date: "2026-10-05T18:29:33.809Z",
    platforms: {
      "windows-x86_64": windows,
      "windows-x86_64-msi": windows,
    },
  };

  const arm = mergeLatest(base, {
    version: "0.4.1",
    notes: "ignored when existing notes are present",
    pubDate: "2026-10-06T00:00:00.000Z",
    primaryKey: "darwin-aarch64",
    bundleKey: "darwin-aarch64-app",
    signature,
    url: "https://example.test/arm.tar.gz",
  });
  if (arm.notes !== "release notes") {
    throw new Error("merge replaced existing notes");
  }
  if (!platformsCover(arm.platforms, base.platforms)) {
    throw new Error("merge dropped windows platforms");
  }
  if (arm.platforms["darwin-aarch64"].signature !== signature) {
    throw new Error("signature was trimmed or altered");
  }
  const roundTrip = JSON.parse(JSON.stringify(arm, null, 2));
  if (roundTrip.platforms["darwin-aarch64"].signature !== signature) {
    throw new Error("signature did not survive JSON.stringify");
  }

  const staleX64 = mergeLatest(base, {
    version: "0.4.1",
    notes: "release notes",
    pubDate: "2026-10-06T00:00:01.000Z",
    primaryKey: "darwin-x86_64",
    bundleKey: "darwin-x86_64-app",
    signature: "x64-sig\n",
    url: "https://example.test/x64.tar.gz",
  });
  const repaired = mergeLatest(staleX64, {
    version: "0.4.1",
    notes: "release notes",
    pubDate: "2026-10-06T00:00:02.000Z",
    primaryKey: "darwin-aarch64",
    bundleKey: "darwin-aarch64-app",
    signature,
    url: "https://example.test/arm.tar.gz",
  });
  for (const key of [
    "windows-x86_64",
    "windows-x86_64-msi",
    "darwin-aarch64",
    "darwin-aarch64-app",
    "darwin-x86_64",
    "darwin-x86_64-app",
  ]) {
    if (!repaired.platforms[key]) {
      throw new Error(`retry merge missing ${key}`);
    }
  }
  if (repaired.platforms["darwin-x86_64"].url !== "https://example.test/x64.tar.gz") {
    throw new Error("retry merge clobbered the other darwin target");
  }

  console.log("merge-macos-latest-json self-test passed");
}

if (process.env.SELF_TEST === "1") {
  runSelfTest();
} else if (process.argv[1] && process.argv[1].endsWith("merge-macos-latest-json.mjs")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
