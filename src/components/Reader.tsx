import { useEffect, useRef, useState } from "react";
import { renderMarkdown, type RenderedDoc } from "../markdown/pipeline";
import { renderMermaidBlocks } from "../markdown/mermaid";

interface ReaderProps {
  source: string;
  path: string;
  /** Link clicks bubble here for routing (in-app / browser / create-file).
   * Phase 3 wires the real router; until then clicks are logged. */
  onLinkClick?: (href: string | null, wikilink: string | null) => void;
  onRendered?: (doc: RenderedDoc) => void;
}

/**
 * The rendered document. Prose paints first; Mermaid renders after mount.
 * One staggered fade-up on load, disabled for reduced motion and for
 * large files (PLAN.md §8).
 */
export function Reader({ source, path, onLinkClick, onRendered }: ReaderProps) {
  const [doc, setDoc] = useState<RenderedDoc | null>(null);
  const containerRef = useRef<HTMLElement>(null);
  const animate = source.length < 1_000_000;

  useEffect(() => {
    let cancelled = false;
    renderMarkdown(source).then((rendered) => {
      if (cancelled) return;
      setDoc(rendered);
      onRendered?.(rendered);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Mermaid after paint; stagger delays per top-level block.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !doc) return;
    if (animate) {
      Array.from(el.children).forEach((child, i) => {
        (child as HTMLElement).style.animationDelay = `${Math.min(i * 60, 900)}ms`;
      });
    }
    void renderMermaidBlocks(el);
  }, [doc, animate]);

  // Single delegated click handler: never let the webview navigate natively.
  const handleClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    e.preventDefault();
    const wikilink = anchor.getAttribute("data-wikilink");
    const href = anchor.getAttribute("href");
    if (onLinkClick) {
      onLinkClick(href, wikilink);
    } else {
      console.log("[folio] link click (routing lands in Phase 3):", { href, wikilink });
    }
  };

  if (!doc) return null;

  const fm = doc.frontmatter;

  return (
    <article
      ref={containerRef}
      className={`reader${animate ? " animate" : ""}`}
      onClick={handleClick}
    >
      <p className="doc-path">{path}</p>
      {fm && Object.keys(fm).length > 0 && (
        <details className="frontmatter">
          <summary>Metadata</summary>
          <dl>
            {Object.entries(fm).map(([key, value]) => (
              <div key={key} style={{ display: "contents" }}>
                <dt>{key}</dt>
                <dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {doc.element}
    </article>
  );
}
