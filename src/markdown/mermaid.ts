/**
 * Client-side Mermaid rendering, themed to the Monochrome tokens.
 * Lazy: the mermaid bundle is only imported when a document actually
 * contains a mermaid fence (PLAN.md §8), and rendering happens after the
 * prose has painted.
 *
 * Dark mode: colours are read live from the CSS custom properties
 * (tokens.css) rather than baked in, so a render always matches whichever
 * theme is active at that moment. Because Mermaid renders to a static SVG
 * (unlike Shiki's dual-theme CSS-variable trick), a theme *change* after
 * the fact needs an explicit re-render — retintMermaidBlocks does that;
 * Reader.tsx calls it on the theme-changed event (src/theme.ts).
 */
let mermaidModulePromise: Promise<typeof import("mermaid")> | null = null;

async function loadMermaidModule() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid");
  }
  return mermaidModulePromise;
}

function currentThemeVariables() {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  const paper = v("--paper");
  const paper2 = v("--paper-2");
  const paper3 = v("--paper-3");
  const ink = v("--ink");
  const graphite = v("--graphite");

  return {
    background: paper,
    primaryColor: paper2,
    primaryBorderColor: ink,
    primaryTextColor: ink,
    secondaryColor: paper3,
    secondaryBorderColor: ink,
    secondaryTextColor: ink,
    tertiaryColor: paper,
    tertiaryBorderColor: ink,
    tertiaryTextColor: ink,
    lineColor: ink,
    textColor: ink,
    titleColor: ink,
    arrowheadColor: ink,
    defaultLinkColor: ink,
    // Explicit node/cluster fills — belt-and-braces alongside primaryColor
    // so a future theme swap can't silently regress this.
    mainBkg: paper2,
    nodeBkg: paper2,
    nodeBorder: ink,
    clusterBkg: paper3,
    clusterBorder: ink,
    edgeLabelBackground: paper,
    noteBkgColor: paper3,
    noteBorderColor: graphite,
    noteTextColor: ink,
  };
}

/** (Re)initialise with the current theme's colours. Cheap — safe to call
 * before every render rather than once, so a theme switch is picked up. */
async function getMermaid() {
  const m = await loadMermaidModule();
  // "base" is the one theme where every colour is driven directly from
  // themeVariables (no baked-in palette to fight); "neutral" still
  // hard-codes node fills to a fixed pale grey regardless of overrides.
  // See PLAN.md §6 — Mermaid must read as monochrome, never the library's
  // default grey.
  m.default.initialize({
    startOnLoad: false,
    theme: "base",
    fontFamily: "'Jost', system-ui, sans-serif",
    themeVariables: currentThemeVariables(),
  });
  return m;
}

let counter = 0;

/** Render every ```mermaid fence inside `container` in place. The raw
 * source is kept on the holder (data-mermaid-source) so retintMermaidBlocks
 * can redraw it later without needing the original fence, which this
 * replaces. */
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
      holder.dataset.mermaidSource = source;
      holder.innerHTML = svg;
      pre.replaceWith(holder);
    } catch {
      // Leave the fence as visible source rather than a broken diagram.
      delete pre.dataset.mermaidDone;
    }
  }
}

/** Re-render already-rendered Mermaid blocks with the current theme's
 * colours — called after a light/dark switch so open documents don't keep
 * showing diagrams drawn for the previous theme. */
export async function retintMermaidBlocks(container: HTMLElement): Promise<void> {
  const holders = container.querySelectorAll<HTMLElement>(
    ".mermaid-block[data-mermaid-source]",
  );
  if (holders.length === 0) return;

  const mermaid = (await getMermaid()).default;

  for (const holder of Array.from(holders)) {
    const source = holder.dataset.mermaidSource;
    if (!source) continue;
    try {
      const { svg } = await mermaid.render(`mdreader-mermaid-${counter++}`, source);
      holder.innerHTML = svg;
    } catch {
      // Leave the previous render in place rather than blanking it.
    }
  }
}
