import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const platform = process.env.TAURI_ENV_PLATFORM;
const isMobileDev = platform === "android" || platform === "ios";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    // Mobile WebViews cannot reach host-only localhost; bind LAN when developing for Android/iOS.
    host: isMobileDev ? (host || "0.0.0.0") : host || false,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // Bind HMR on the host (0.0.0.0). WebView client URLs are rewritten in index.html
    // (10.0.2.2 for emulator, or TAURI_DEV_HOST for physical devices).
    hmr: isMobileDev
      ? {
          protocol: "ws",
          port: 1421,
          clientPort: 1421,
        }
      : host
        ? {
            protocol: "ws",
            host,
            port: 1421,
            clientPort: 1421,
          }
        : undefined,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows"
        ? "chrome105"
        : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
