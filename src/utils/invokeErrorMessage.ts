/** Extract a user-facing message from a Tauri invoke rejection. */
export function invokeErrorMessage(err: unknown, fallback: string): string {
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
  return fallback;
}
