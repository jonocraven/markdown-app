/**
 * Mobile shell detection (PLAN-ANDROID.md §3/§6 Phase A2).
 *
 * True below ~768px viewport width OR whenever isAndroid() is true (a
 * narrow desktop window never gets the touch shell; a wide Android window —
 * e.g. a tablet, or this container's `?platform=android` override run at a
 * desktop viewport — still does, since Android has no desktop-shaped mode).
 *
 * This is the ONE place structural JSX branches on "am I mobile" (App.tsx's
 * isMobile-gated shell). Pure-presentation CSS uses its own
 * `@media (max-width: 768px)` query directly (see src/styles/mobile.css) —
 * the two are intentionally separate mechanisms that agree in the common
 * case (narrow viewport) but can diverge for isAndroid() at a wide
 * viewport; PLAN-ANDROID.md §3 accepts that looseness rather than plumbing
 * a JS-computed class name through every rule.
 *
 * MOBILE_BREAKPOINT_PX is the single source of truth for the JS side —
 * keep it equal to the `768px` literal in mobile.css's media query.
 */
import { useEffect, useState } from "react";
import { isAndroid } from "../platform";

export const MOBILE_BREAKPOINT_PX = 768;

function computeIsMobile(mql: MediaQueryList): boolean {
  return mql.matches || isAndroid();
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return computeIsMobile(window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`));
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const onChange = () => setIsMobile(computeIsMobile(mql));
    onChange();
    // addEventListener is the modern API; Safari <14 needs addListener, but
    // this app targets WKWebView/WebView versions well past that (PLAN.md).
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
