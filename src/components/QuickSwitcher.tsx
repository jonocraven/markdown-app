/**
 * Quick file switcher (⌘P / Ctrl+P).
 * Fuzzy filename match against the link index.
 * House style: centred overlay, paper ground, hairline border, mono input ≥16px.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { vault, type LinkIndexEntry as VaultLinkIndexEntry } from "../vault";
import { useAppStore } from "../stores/appStore";

interface QuickSwitcherProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Simple fuzzy subsequence scoring: count characters in order, with bonuses
 * for word boundaries and stem starts (uppercase letters).
 */
function scoreMatch(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  let score = 0;
  let qIdx = 0;
  let prevMatchIdx = -1;

  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      // Found a matching character
      score += 10;

      // Bonus for word boundary (uppercase in original text)
      if (i > 0 && text[i] === text[i].toUpperCase() && text[i] !== text[i].toLowerCase()) {
        score += 5;
      }

      // Bonus for stem start (first character after a dash/underscore/space)
      if (i > 0 && /[-_\s]/.test(t[i - 1])) {
        score += 5;
      }

      // Bonus for consecutive matches (reduced gap penalty)
      if (i === prevMatchIdx + 1) {
        score += 2;
      }

      prevMatchIdx = i;
      qIdx++;
    }
  }

  // Only return a score if all query characters were found in order
  return qIdx === q.length ? score : 0;
}

interface ScoredEntry extends VaultLinkIndexEntry {
  score: number;
}

export function QuickSwitcher({ open, onClose }: QuickSwitcherProps) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<ScoredEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { navigate } = useAppStore();
  const listRef = useRef<HTMLDivElement>(null);

  // Load link index on mount
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    vault.linkIndex().then((index) => {
      if (cancelled) return;
      const scored = index
        .map((entry) => ({
          ...entry,
          score: 1, // default score; will be updated on query change
        }))
        .sort((a, b) => {
          // Sort by stem length (shorter stems first — more likely to be what user wants)
          return a.stem.length - b.stem.length;
        });
      setEntries(scored);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  // Filter and score on query change
  const filtered = query
    ? entries
        .map((entry) => ({
          ...entry,
          score: scoreMatch(query, entry.stem),
        }))
        .filter((e) => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
    : entries.slice(0, 12);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelected(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[selected];
      if (item instanceof HTMLElement) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selected]);

  const handleSelect = useCallback(
    (path: string) => {
      navigate(path);
      onClose();
      setQuery("");
    },
    [navigate, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      setQuery("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      handleSelect(filtered[selected].path);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop: click to close */}
      <div className="quick-switcher-backdrop" onClick={onClose} />

      <div className="quick-switcher">
        <input
          ref={inputRef}
          type="text"
          placeholder="Open file…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="quick-switcher-input"
        />

        {filtered.length > 0 && (
          <div className="quick-switcher-list" ref={listRef}>
            {filtered.map((entry, idx) => (
              <button
                key={entry.path}
                className={`quick-switcher-item ${idx === selected ? "selected" : ""}`}
                onClick={() => handleSelect(entry.path)}
              >
                <div className="quick-switcher-stem">{entry.stem}</div>
                <div className="quick-switcher-path">{entry.path}</div>
              </button>
            ))}
          </div>
        )}

        {query && filtered.length === 0 && (
          <div className="quick-switcher-empty">No matches</div>
        )}
      </div>
    </>
  );
}
