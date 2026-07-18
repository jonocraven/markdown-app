/**
 * Platform detection for Android-only UI branches (PLAN-ANDROID.md §3/§6):
 * the in-app FolderBrowser, and later the responsive shell/touch phases.
 *
 * `isAndroid()` checks the WebView's userAgent for "Android" — dependency-
 * free, since Tauri's WebView always reports the real platform. This
 * container has no Android device/emulator, so a dev/test override lets
 * the browser-mode Chromium test bed (this repo's only test bed for
 * anything short of a Mac) exercise the Android-only UI:
 *
 *   - append `?platform=android` to the URL, or
 *   - set `localStorage["mdreader.platform"] = "android"`
 *
 * The override is read once at module load (not reactive — a page reload
 * picks up a change). Neither override is reachable in a real Tauri build's
 * ordinary usage; they exist purely for Playwright/manual browser testing.
 */

function readOverride(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("platform");
    if (fromQuery) return fromQuery;
  } catch {
    // no window/location — shouldn't happen in a browser context, but don't throw
  }
  try {
    return localStorage.getItem("mdreader.platform");
  } catch {
    return null;
  }
}

const platformOverride = readOverride();

export function isAndroid(): boolean {
  if (platformOverride) return platformOverride === "android";
  return /Android/i.test(navigator.userAgent);
}

/** True on a touch-first device (no hover, coarse pointer) — used by the
 * later touch-ergonomics work (PLAN-ANDROID.md §3: long-press context
 * menus, always-visible copy buttons, 44px targets). */
export function isCoarsePointer(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}
