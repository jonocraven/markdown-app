/**
 * System-back-button contract (PLAN-ANDROID.md §3).
 *
 * Mirrors two kinds of app-level state into the WebView's own
 * `window.history` so Android's hardware back button — which the OS/WebView
 * turns into an ordinary `history.back()` — walks Markdown Reader the way a
 * browser's back button would:
 *
 *   - "nav"     pushed whenever the store's `currentPath` changes (a real
 *               document navigation, whichever of navigate()/goBack()/
 *               goForward() produced it — see appStore.ts's own history
 *               comment for the back/forward stacks this mirrors).
 *   - "overlay" pushed whenever a mobile overlay opens (drawer, TOC sheet,
 *               search takeover, quick switcher, overflow menu — see the
 *               isMobile branch of App.tsx).
 *
 * Every pushed entry carries a small tagged object in `history.state`
 * rather than relying on stack position, so the popstate handler can act on
 * what a popped-to entry actually IS instead of assuming the store's
 * back/forward arrays and the WebView's own history stay perfectly in sync
 * — they're independent stacks that can drift (see "known drift" below).
 *
 * popstate contract: if a mobile overlay is open when the hardware back
 * fires, close it and stop — the browser already popped that overlay's
 * entry, so this only needs to reconcile the React state, never touch
 * navigation. Otherwise defer to the store's own goBack(), which is a
 * no-op once its back stack is empty (the history root) — a further
 * hardware back from there is a native/OS concern (exiting the app) that
 * this module doesn't try to own.
 *
 * Direct (non-popstate) overlay dismissal — scrim tap, Escape, an overflow
 * item that doesn't itself navigate — calls history.back() itself to
 * consume the entry it pushed on open, via popOverlay()/navigateFromOverlay
 * below. That's race-free exactly when nothing else in the same user
 * action also pushes history (see each function's own comment) — the one
 * case that ISN'T race-free is SearchPanel/QuickSwitcher selecting a
 * result: they call the store's navigate() themselves (already pushing a
 * "nav" entry) before their onClose fires, so App.tsx's mobile onClose for
 * those two never calls back() — closing is a pure React-state change, and
 * the overlay's own pushed entry is left in place. This is the one known,
 * accepted drift: it costs one extra (silently absorbed — see the
 * "overlay" tag check below) hardware-back press per search/switcher open
 * that closes that way, never a wrong navigation or a crash.
 *
 * Desktop is unaffected in practice: ⌘[/⌘] and the footer buttons call the
 * store's goBack()/goForward() directly (unchanged), which still triggers
 * the "nav" mirror push here — harmless, since nothing in this app or the
 * five desktop Playwright scripts ever fires a browser popstate.
 */
import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "./stores/appStore";

type HistoryState =
  | { mdr: true; kind: "root" }
  | { mdr: true; kind: "nav"; path: string }
  | { mdr: true; kind: "overlay" };

function isMdrState(state: unknown): state is HistoryState {
  return !!state && typeof state === "object" && (state as { mdr?: unknown }).mdr === true;
}

interface HistoryBridgeParams {
  /** True whenever ANY mobile overlay is currently shown (drawer, TOC
   * sheet, overflow, and — only while isMobile — search/quick switcher).
   * Read via a ref internally so the popstate listener always sees the
   * latest value without re-subscribing on every render. */
  overlayOpen: boolean;
  /** Closes whichever overlay is open. Must be a PURE React-state setter —
   * never call history.back()/forward() from inside it, since both the
   * popstate path (browser already moved) and the direct-dismiss helpers
   * below (which call history.back() themselves, once) own that. */
  closeOverlay: () => void;
}

export function useHistoryBridge({ overlayOpen, closeOverlay }: HistoryBridgeParams) {
  const overlayOpenRef = useRef(overlayOpen);
  overlayOpenRef.current = overlayOpen;
  const closeOverlayRef = useRef(closeOverlay);
  closeOverlayRef.current = closeOverlay;

  // Suppresses the mirror-push effect below for exactly one currentPath
  // change — set right before this module itself drives that change
  // (goBack() from a popstate, or the replaceState collapse in
  // navigateFromOverlay) so the echo isn't pushed a second time.
  const suppressNextNavPushRef = useRef(false);
  // Suppresses the popstate handler for exactly one event — set right
  // before this module calls history.back() itself (popOverlay /
  // navigateFromOverlay's no-op branch), so consuming our OWN pushed
  // overlay entry doesn't get reinterpreted as a hardware back press.
  const suppressNextPopRef = useRef(false);

  // Tag whichever entry the app loaded on, once, so "landed with no/foreign
  // state" reads as the root rather than as drift.
  useEffect(() => {
    if (!isMdrState(history.state)) {
      history.replaceState({ mdr: true, kind: "root" } satisfies HistoryState, "");
    }
  }, []);

  // Mirror every currentPath change into a pushed "nav" entry — whichever
  // of navigate()/goBack()/goForward() produced it.
  useEffect(() => {
    let prevPath = useAppStore.getState().currentPath;
    return useAppStore.subscribe((state) => {
      if (state.currentPath === prevPath) return;
      prevPath = state.currentPath;
      if (suppressNextNavPushRef.current) {
        suppressNextNavPushRef.current = false;
        return;
      }
      if (state.currentPath) {
        history.pushState({ mdr: true, kind: "nav", path: state.currentPath } satisfies HistoryState, "");
      }
    });
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (suppressNextPopRef.current) {
        suppressNextPopRef.current = false;
        return;
      }
      if (overlayOpenRef.current) {
        // Hardware back while a mobile overlay is showing: the browser has
        // already popped that overlay's entry — just reconcile our UI.
        closeOverlayRef.current();
        return;
      }
      const state = event.state;
      if (isMdrState(state) && state.kind === "overlay") {
        // Drift guard: landed on a stale "overlay" entry (its overlay was
        // dismissed some other way without consuming this entry — see the
        // module comment's "known drift"). Nothing to close, nothing to
        // navigate — absorb this one pop silently rather than guessing;
        // the next back press lands on a real "nav"/"root" entry instead.
        return;
      }
      if (useAppStore.getState().back.length > 0) {
        suppressNextNavPushRef.current = true;
        useAppStore.getState().goBack();
      }
      // else: at the history root — nothing left for this module to do;
      // a further hardware back is the native shell's to handle (app exit).
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  /** Call right after opening any mobile overlay (setXOpen(true)). */
  const pushOverlay = useCallback(() => {
    history.pushState({ mdr: true, kind: "overlay" } satisfies HistoryState, "");
  }, []);

  /** Race-free direct dismiss for an overlay that does NOT also navigate in
   * the same action (scrim tap, Escape, an overflow item like Zoom that
   * just closes the menu). Closes the React state, then consumes the
   * entry pushOverlay() pushed on open. */
  const popOverlay = useCallback(() => {
    closeOverlayRef.current();
    suppressNextPopRef.current = true;
    history.back();
  }, []);

  /** One overlay replacing another in the same action (currently: the
   * overflow menu's "Contents" item closing the overflow and opening the
   * TOC sheet) — a synchronous replaceState swap, never back()+pushState,
   * so there's no risk of the two racing. */
  const swapOverlay = useCallback(() => {
    history.replaceState({ mdr: true, kind: "overlay" } satisfies HistoryState, "");
  }, []);

  /** The drawer/Favourites file-tap path: WE call the store's navigate()
   * here (unlike SearchPanel/QuickSwitcher, which call it themselves before
   * their onClose fires — see the module comment), so this can collapse the
   * overlay's pushed entry directly into the new nav entry with a single
   * synchronous replaceState instead of back() then pushState — avoiding
   * the async race a real back() would introduce against the pushState the
   * mirror effect above would otherwise fire immediately after it. */
  const navigateFromOverlay = useCallback((path: string) => {
    closeOverlayRef.current();
    const changed = useAppStore.getState().currentPath !== path;
    if (changed) {
      suppressNextNavPushRef.current = true;
      useAppStore.getState().navigate(path);
      history.replaceState({ mdr: true, kind: "nav", path } satisfies HistoryState, "");
    } else {
      // Already the open document — no navigation occurs, so this is just
      // a plain dismiss; consume the overlay's entry the same way popOverlay does.
      suppressNextPopRef.current = true;
      history.back();
    }
  }, []);

  return { pushOverlay, popOverlay, swapOverlay, navigateFromOverlay };
}
