/**
 * Suppress the next window `popstate` so nested mobile overlays can call
 * `history.back()` without App.tsx treating it as "leave tool → home".
 */
let suppressNextPopState = false;

export function markSuppressNextMobilePopState(): void {
  suppressNextPopState = true;
}

export function consumeSuppressNextMobilePopState(): boolean {
  if (!suppressNextPopState) {
    return false;
  }
  suppressNextPopState = false;
  return true;
}
