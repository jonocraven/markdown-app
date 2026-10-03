import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";

interface Props {
  path: string;
  source: string;
  renderedDoc: unknown;
  onClose: () => void;
}

/** Find visible text in the open document without changing React's rendered nodes. */
export function DocumentFind({ path, source, renderedDoc, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Range[]>([]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setQuery(""); setMatches([]); setIndex(0); }, [path]);

  useEffect(() => {
    const root = document.querySelector(".reader");
    if (!root || !query) { setMatches([]); setIndex(0); return; }
    const found: Range[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const needle = query.toLocaleLowerCase();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent?.closest("script, style, .katex-mathml")) continue;
      const text = node.textContent?.toLocaleLowerCase() ?? "";
      let from = 0;
      while ((from = text.indexOf(needle, from)) !== -1) {
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, from + needle.length);
        found.push(range);
        from += needle.length;
      }
    }
    setMatches(found);
    setIndex(0);
  }, [query, source, path, renderedDoc]);

  // CSS highlights do not move keyboard focus away from the search field.
  useEffect(() => {
    const registry = (CSS as unknown as { highlights?: { set: (name: string, value: unknown) => void; delete: (name: string) => void } }).highlights;
    const HighlightClass = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!registry || !HighlightClass) return;
    registry.delete("document-find-current");
    if (matches[index]) registry.set("document-find-current", new HighlightClass(matches[index]));
    return () => registry.delete("document-find-current");
  }, [matches, index]);

  useEffect(() => {
    const match = matches[index];
    if (!match) return;
    // A short delay lets the user finish typing before the document scrolls.
    const timer = window.setTimeout(() => {
      const rect = match.getBoundingClientRect();
      const host = document.querySelector(".doc-scroll-host");
      if (host && rect.height) {
        const hostRect = host.getBoundingClientRect();
        host.scrollTop += rect.top - hostRect.top - hostRect.height / 3;
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [matches, index]);

  const move = (step: number) => {
    if (matches.length) setIndex((current) => (current + step + matches.length) % matches.length);
  };

  return (
    <div className="document-find" role="search" aria-label="Find in document">
      <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter") { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
        }} placeholder="Find in document" aria-label="Find in document" />
      <span className="document-find-count" aria-live="polite">
        {query ? (matches.length ? `${index + 1} of ${matches.length}` : "No matches") : ""}
      </span>
      <button aria-label="Previous match" disabled={!matches.length} onClick={() => move(-1)}><ArrowUp size={16} /></button>
      <button aria-label="Next match" disabled={!matches.length} onClick={() => move(1)}><ArrowDown size={16} /></button>
      <button aria-label="Close find" onClick={onClose}><X size={16} /></button>
    </div>
  );
}
