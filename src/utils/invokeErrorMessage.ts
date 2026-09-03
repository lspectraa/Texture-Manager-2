/** Extract a user-facing message from a Tauri invoke rejection. */
export function invokeErrorMessage(err: unknown, fallback: string): string {
  const raw = (() => {
    if (typeof err === "string" && err.trim()) {
      return err.trim();
    }
    if (err instanceof Error && err.message.trim()) {
      return err.message.trim();
    }
    if (err && typeof err === "object") {
      const record = err as Record<string, unknown>;
      if (typeof record.message === "string" && record.message.trim()) {
        return record.message.trim();
      }
    }
    return "";
  })();
  if (!raw) {
    return fallback;
  }
  return normalizeBackendErrorMessage(raw);
}

/** Strip Rust `AppError` prefixes so UI shows the real message. */
export function normalizeBackendErrorMessage(message: string): string {
  return message
    .replace(/^invalid path:\s*/i, "")
    .replace(/^io error:\s*/i, "")
    .replace(/^parse error:\s*/i, "")
    .replace(/^invalid operation:\s*/i, "")
    .trim();
}

/** Short summary for toolbars; full multi-line text for the detail dialog. */
export function summarizeBackendErrorMessage(message: string): string {
  const normalized = normalizeBackendErrorMessage(message);
  const firstBlock = normalized.split(/\n\n/)[0]?.trim() ?? normalized;
  const firstLine = firstBlock.split("\n")[0]?.trim() ?? firstBlock;
  return firstLine || normalized;
}
