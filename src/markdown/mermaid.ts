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
      m.default.initialize({
        startOnLoad: false,
        theme: "neutral",
        fontFamily: "'Jost', system-ui, sans-serif",
        themeVariables: {
          background: "#FAFADF",
          primaryColor: "#F5F0E4",
          primaryBorderColor: "#1A1A16",
          primaryTextColor: "#1A1A16",
          secondaryColor: "#F2F2D2",
          tertiaryColor: "#FAFADF",
          lineColor: "#1A1A16",
          textColor: "#1A1A16",
          noteBkgColor: "#F2F2D2",
          noteBorderColor: "#5E5E54",
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
      const { svg } = await mermaid.render(`folio-mermaid-${counter++}`, source);
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
