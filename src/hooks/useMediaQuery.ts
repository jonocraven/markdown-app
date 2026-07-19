import { useEffect, useState } from "react";

/** Tracks a CSS media query in JS — used to gate mobile-only interactive
 * behaviour (the drawer scrim, closing on file-select) that can't be
 * expressed in CSS alone. Keep the query string in sync with base.css's
 * mobile shell breakpoint. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
