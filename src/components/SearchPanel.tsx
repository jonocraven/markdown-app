/**
 * Full-text search panel (⇧⌘F / Ctrl+Shift+F).
 * Grouped-by-file results with line numbers, click-to-navigate-and-scroll.
 * House style: mono input ≥16px, hairline border, paper ground, results with
 * matching text highlighted, brief pulse on scroll landing.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import { vault, type SearchHit } from "../vault";
import { useAppStore } from "../stores/appStore";

interface SearchPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SearchPanel({ open, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const { navigate } = useAppStore();

  // Debounced search
  const performSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const hits = await vault.search(q);
        setResults(hits);
      } catch (err) {
        console.error("[markdown-reader] search failed:", err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      performSearch(query);
    }, 200);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query, performSearch]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  // Group results by file
  const groupedResults = Array.from(
    results.reduce((acc, hit) => {
      if (!acc.has(hit.path)) {
        acc.set(hit.path, []);
      }
      acc.get(hit.path)!.push(hit);
      return acc;
    }, new Map<string, SearchHit[]>()),
  );

  const handleResultClick = useCallback(
    (hit: SearchHit) => {
      navigate(hit.path);
      // Schedule scroll-to-line after navigation renders
      setTimeout(() => {
        scrollToLine(hit.line);
      }, 50);
      onClose();
    },
    [navigate, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <div className="search-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="search-input"
          />
        </div>
        <button
          onClick={onClose}
          className="search-close"
          aria-label="Close search"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      <div className="search-results">
        {results.length === 0 && query && !searching && (
          <div className="search-empty">No results</div>
        )}
        {searching && <div className="search-empty">Searching…</div>}
        {results.length > 0 && (
          <div className="search-hit-count">
            {results.length} {results.length === 1 ? "match" : "matches"}
          </div>
        )}

        {groupedResults.map(([filePath, hits]: [string, SearchHit[]]) => (
          <div key={filePath} className="search-file-group">
            <div className="search-file-path">{filePath}</div>
            {hits.map((hit: SearchHit, idx: number) => (
              <button
                key={`${filePath}:${idx}`}
                className="search-hit"
                onClick={() => handleResultClick(hit)}
              >
                <div className="search-hit-line">
                  <span className="search-hit-number">{hit.line}</span>
                  <span className="search-hit-text">{hit.text}</span>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Scroll to a specific line in the rendered document.
 * Walk through rendered blocks in order, counting lines, until we reach the
 * target line, then scroll that element into view and apply a brief
 * highlight pulse.
 */
function scrollToLine(lineNumber: number) {
  const reader = document.querySelector(".reader");
  if (!reader) return;

  let currentLine = 0;
  let targetElement: HTMLElement | null = null;

  // Walk through all top-level block elements, counting lines
  for (const el of reader.children) {
    if (!(el instanceof HTMLElement)) continue;

    // Get the raw text of this element (excluding nested elements)
    const rawText = (el as HTMLElement).textContent ?? "";
    const linesInElement = rawText.split("\n").length;

    if (currentLine + linesInElement >= lineNumber) {
      // The target line is in this element
      targetElement = el as HTMLElement;
      break;
    }

    currentLine += linesInElement;
  }

  if (!targetElement) {
    // Fallback: scroll proportionally
    const totalLines = (reader.textContent ?? "").split("\n").length;
    const scrollHost = document.querySelector(".pane-doc") as HTMLElement;
    if (scrollHost) {
      const fraction = Math.max(0, Math.min(1, (lineNumber - 1) / totalLines));
      const max = scrollHost.scrollHeight - scrollHost.clientHeight;
      scrollHost.scrollTop = fraction * max;
    }
    return;
  }

  // Scroll target into view
  targetElement.scrollIntoView({ behavior: "smooth", block: "start" });

  // Add brief highlight pulse
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  targetElement.classList.add("search-scroll-pulse");
  if (!reduceMotion) {
    setTimeout(() => {
      targetElement?.classList.remove("search-scroll-pulse");
    }, 600); // matches CSS animation duration
  } else {
    targetElement.classList.remove("search-scroll-pulse");
  }
}
