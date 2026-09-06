#!/usr/bin/env node
/**
 * Syncs Android app icons from src-tauri/icons/android into src-tauri/gen/android/app/src/main/res.
 * Configures full-bleed adaptive icons with the extracted emblem centered in the safe zone,
 * matching the app's dark theme (#070a17) with zero cropping across all Android launcher shapes.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcAndroidIcons = join(root, "src-tauri", "icons", "android");
const targetRes = join(root, "src-tauri", "gen", "android", "app", "src", "main", "res");

export function syncAndroidIcons() {
  if (!existsSync(srcAndroidIcons) || !existsSync(targetRes)) {
    console.log("Skipping Android icon sync: paths do not exist.");
    return;
  }

  const densities = [
    "mipmap-mdpi",
    "mipmap-hdpi",
    "mipmap-xhdpi",
    "mipmap-xxhdpi",
    "mipmap-xxxhdpi",
  ];

  const iconFiles = [
    "ic_launcher.png",
    "ic_launcher_round.png",
    "ic_launcher_foreground.png",
  ];

  for (const density of densities) {
    const srcDir = join(srcAndroidIcons, density);
    const targetDir = join(targetRes, density);
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    for (const file of iconFiles) {
      const srcFile = join(srcDir, file);
      const targetFile = join(targetDir, file);
      if (existsSync(srcFile)) {
        copyFileSync(srcFile, targetFile);
      }
    }
  }

  // Ensure adaptive icons (API 26+)
  const anydpiDir = join(targetRes, "mipmap-anydpi-v26");
  if (!existsSync(anydpiDir)) {
    mkdirSync(anydpiDir, { recursive: true });
  }

  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;

  writeFileSync(join(anydpiDir, "ic_launcher.xml"), adaptiveXml, "utf8");
  writeFileSync(join(anydpiDir, "ic_launcher_round.xml"), adaptiveXml, "utf8");

  // Ensure values/ic_launcher_background.xml has dark background matching theme
  const valuesDir = join(targetRes, "values");
  if (!existsSync(valuesDir)) {
    mkdirSync(valuesDir, { recursive: true });
  }

  const backgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#070a17</color>
</resources>
`;
  writeFileSync(join(valuesDir, "ic_launcher_background.xml"), backgroundXml, "utf8");

  // Remove old template vector drawables if present to prevent resource conflicts
  const oldDrawableBg = join(targetRes, "drawable", "ic_launcher_background.xml");
  if (existsSync(oldDrawableBg)) {
    rmSync(oldDrawableBg, { force: true });
  }
  const oldDrawableFg = join(targetRes, "drawable-v24", "ic_launcher_foreground.xml");
  if (existsSync(oldDrawableFg)) {
    rmSync(oldDrawableFg, { force: true });
  }

  console.log("Android app icons synced successfully (adaptive icons with centered emblem).");
}

// Run directly if invoked as CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncAndroidIcons();
}
