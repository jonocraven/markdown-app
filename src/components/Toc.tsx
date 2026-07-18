import type { TocEntry } from "../markdown/pipeline";

interface TocProps {
  entries: TocEntry[];
}

/** Contents panel. Scroll-spy (active-section highlight) lands in Phase 1
 * polish — the smooth-scroll behaviour is already here. */
export function Toc({ entries }: TocProps) {
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
          className={`toc-item toc-depth-${entry.depth}`}
          onClick={() => scrollTo(entry.id)}
        >
          {entry.text}
        </button>
      ))}
    </nav>
  );
}
