import { openUrl } from "@tauri-apps/plugin-opener";
import { APP_LINKS } from "../config/appMeta";
import { isTauriRuntime } from "../services/tauriOperations";

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "github.com",
  "www.youtube.com",
  "youtube.com",
  "discord.gg",
  "discord.com",
  "www.discord.com",
]);

/** Hosts derived from known app links plus the static allowlist above. */
function allowedHosts(): Set<string> {
  const hosts = new Set(ALLOWED_EXTERNAL_HOSTS);
  for (const url of Object.values(APP_LINKS)) {
    try {
      hosts.add(new URL(url).hostname.toLowerCase());
    } catch {
      // ignore malformed configured links
    }
  }
  return hosts;
}

export function isAllowedExternalUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (allowedHosts().has(host)) {
    return true;
  }
  // Allow discord CDN-style subdomains if ever linked (matches capability glob).
  return host.endsWith(".discord.com");
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isAllowedExternalUrl(url)) {
    throw new Error(`Refusing to open URL outside the allowlist: ${url}`);
  }

  if (isTauriRuntime()) {
    await openUrl(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
