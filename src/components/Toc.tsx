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

    // Determine which heading is most in-view
    const updateActive = () => {
      let bestId: string | null = null;
      let bestRatio = -1;

      headingRefs.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect();
        // Calculate visibility: how much of the element is in the top half of viewport
        const viewportHeight = window.innerHeight;
        const elementTop = rect.top;

        // A heading is "in view" if its top is above the middle of the viewport
        if (elementTop < viewportHeight / 2) {
          // Calculate a ratio based on how close the top is to the middle
          const ratio = Math.max(0, 1 - elementTop / (viewportHeight / 2));
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
      });

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
