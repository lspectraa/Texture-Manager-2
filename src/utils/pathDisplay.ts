/**
 * Shorten absolute paths in user-facing strings (UI / CSV) without destroying
 * debuggability — keeps basename or parent/basename.
 */
export function shortenPathForDisplay(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return trimmed;
  }
  const parts = trimmed.split(/[/\\]/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return trimmed;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

const WIN_ABS = /(?:[A-Za-z]:\\|\\\\[^\\\s]+)[^\s"'<>|]*/g;
const UNIX_ABS = /(?:^|[\s("'=])(\/(?:Users|home|tmp|var|opt|mnt|media|Volumes)\/[^\s"'<>|]+)/g;

/** Replace absolute path substrings in free-form error / issue text. */
export function redactAbsolutePathsInText(text: string): string {
  if (!text) {
    return text;
  }
  let out = text.replace(WIN_ABS, (match) => shortenPathForDisplay(match));
  out = out.replace(UNIX_ABS, (full, path: string) => {
    const prefix = full.slice(0, full.length - path.length);
    return `${prefix}${shortenPathForDisplay(path)}`;
  });
  return out;
}
