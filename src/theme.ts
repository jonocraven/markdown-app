/**
 * Dark mode. The design stays the same monochrome-plus-one-accent system
 * (tokens.css) — this module only ever flips which palette is active, via
 * a `data-theme` attribute on <html>. "system" (the default) means no
 * attribute at all, so the `@media (prefers-color-scheme: dark)` block in
 * tokens.css/reader.css follows the OS live, with no JS involved.
 *
 * Source of truth for the *setting* is the persisted store (appStore.ts,
 * via persist.ts — tauri-plugin-store or localStorage depending on
 * platform). This module also mirrors the last-applied value into plain
 * localStorage under THEME_MIRROR_KEY, read synchronously by the inline
 * script in index.html, so the very first paint already has the right
 * attribute — the async persisted store can't be read that early without a
 * flash of the wrong theme.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_MIRROR_KEY = "markdownReader.themeMirror";

const THEME_CHANGE_EVENT = "markdown-reader:theme-changed";

/** Set the `data-theme` attribute, mirror it for next launch's inline
 * script, and notify listeners (Reader.tsx retints Mermaid on this). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  try {
    localStorage.setItem(THEME_MIRROR_KEY, theme);
  } catch {
    // Private browsing / storage disabled — FOUC prevention is best-effort,
    // the persisted store (appStore) is still the real source of truth.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Fires whenever the effective theme changes — an explicit switch, or (for
 * theme === "system") the OS preference itself changing while open. */
export function onThemeChange(handler: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, handler);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
}

let systemWatcherBound = false;

/** Bind (once) a listener for OS-level dark/light changes, so a live switch
 * while the app is open repaints Mermaid even though CSS alone already
 * repaints everything else. Only notifies while the user's setting is
 * "system" — an explicit light/dark choice is never affected by the OS. */
export function watchSystemTheme(getTheme: () => Theme): void {
  if (systemWatcherBound) return;
  systemWatcherBound = true;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if (getTheme() === "system") window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  });
}
