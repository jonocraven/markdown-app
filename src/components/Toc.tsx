import { useEffect, useRef, useState } from "react";
import type { TocEntry } from "../markdown/pipeline";

interface TocProps {
  entries: TocEntry[];
}

/** Contents panel with scroll-spy. Active heading highlighted in ink,
 * rest in graphite. Smooth-scroll click behaviour preserved. */
export function Toc({ entries }: TocProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const headingRefs = useRef<Map<string, Element>>(new Map());

  useEffect(() => {
    if (entries.length === 0) return;

    // Collect all heading elements
    headingRefs.current.clear();
    entries.forEach((entry) => {
      const el = document.getElementById(entry.id);
      if (el) {
        headingRefs.current.set(entry.id, el);
      }
    });

    // The active heading is the LAST one that has scrolled up to (or past)
    // a line near the top of the viewport — i.e. the heading whose section
    // we're currently reading. Pick the heading with the greatest top
    // that's still at or above the threshold (not the smallest/most
    // negative — an earlier version scored by "distance past the
    // threshold" unbounded, which made a heading that had scrolled far off
    // the top of the page always win over the true current section).
    const updateActive = () => {
      const threshold = window.innerHeight * 0.35;
      let bestId: string | null = null;
      let bestTop = -Infinity;

      headingRefs.current.forEach((el, id) => {
        const top = el.getBoundingClientRect().top;
        if (top <= threshold && top > bestTop) {
          bestTop = top;
          bestId = id;
        }
      });

      // Above the first heading (top of document): nothing has crossed the
      // threshold yet, so nothing is active rather than falsely sticking.
      setActiveId(bestId);
    };

    // Listen to scroll events with debouncing
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateActive, 50);
    };

    // Initial check
    updateActive();

    const scrollContainer = document.querySelector(".pane-doc > div");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", onScroll);
      return () => {
        scrollContainer.removeEventListener("scroll", onScroll);
        if (scrollTimeout) clearTimeout(scrollTimeout);
      };
    }
  }, [entries]);

  if (entries.length === 0) return null;

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="chrome">
      <p className="chrome-label">Contents</p>
      {entries.map((entry) => (
        <button
          key={entry.id}
          className={`toc-item toc-depth-${entry.depth} ${activeId === entry.id ? "toc-active" : ""}`}
          onClick={() => scrollTo(entry.id)}
        >
          {entry.text}
        </button>
      ))}
    </nav>
  );
}
