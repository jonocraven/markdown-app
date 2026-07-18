/**
 * Client-side Mermaid rendering, themed to the Monochrome tokens.
 * Lazy: the mermaid bundle is only imported when a document actually
 * contains a mermaid fence (PLAN.md §8), and rendering happens after the
 * prose has painted.
 */
let mermaidPromise: Promise<typeof import("mermaid")> | null = null;

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      // "base" is the one theme where every colour is driven directly from
      // themeVariables (no baked-in palette to fight); "neutral" still
      // hard-codes node fills to a fixed pale grey regardless of overrides.
      // See PLAN.md §6 — Mermaid must read as monochrome cream/ink, never
      // the library's default grey.
      m.default.initialize({
        startOnLoad: false,
        theme: "base",
        fontFamily: "'Jost', system-ui, sans-serif",
        themeVariables: {
          background: "#FAFADF",
          primaryColor: "#F5F0E4",
          primaryBorderColor: "#1A1A16",
          primaryTextColor: "#1A1A16",
          secondaryColor: "#F2F2D2",
          secondaryBorderColor: "#1A1A16",
          secondaryTextColor: "#1A1A16",
          tertiaryColor: "#FAFADF",
          tertiaryBorderColor: "#1A1A16",
          tertiaryTextColor: "#1A1A16",
          lineColor: "#1A1A16",
          textColor: "#1A1A16",
          titleColor: "#1A1A16",
          arrowheadColor: "#1A1A16",
          defaultLinkColor: "#1A1A16",
          // Explicit node/cluster fills — belt-and-braces alongside
          // primaryColor so a future theme swap can't silently regress this.
          mainBkg: "#F5F0E4",
          nodeBkg: "#F5F0E4",
          nodeBorder: "#1A1A16",
          clusterBkg: "#F2F2D2",
          clusterBorder: "#1A1A16",
          edgeLabelBackground: "#FAFADF",
          noteBkgColor: "#F2F2D2",
          noteBorderColor: "#5E5E54",
          noteTextColor: "#1A1A16",
        },
      });
      return m;
    });
  }
  return mermaidPromise;
}

let counter = 0;

/** Render every ```mermaid fence inside `container` in place. */
export async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const fences = container.querySelectorAll<HTMLElement>(
    "pre > code.language-mermaid",
  );
  if (fences.length === 0) return;

  const mermaid = (await getMermaid()).default;

  for (const code of fences) {
    const pre = code.parentElement;
    if (!pre || pre.dataset.mermaidDone) continue;
    pre.dataset.mermaidDone = "1";
    const source = code.textContent ?? "";
    try {
      const { svg } = await mermaid.render(`mdreader-mermaid-${counter++}`, source);
      const holder = document.createElement("div");
      holder.className = "mermaid-block";
      holder.innerHTML = svg;
      pre.replaceWith(holder);
    } catch {
      // Leave the fence as visible source rather than a broken diagram.
      delete pre.dataset.mermaidDone;
    }
  }
}
