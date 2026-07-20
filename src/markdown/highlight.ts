import type { Root, Element } from "hast";
import { visit } from "unist-util-visit";
import { toString as hastToString } from "hast-util-to-string";
import type { Highlighter, BundledLanguage } from "shiki";

/**
 * Shiki highlighting as an async rehype step. A curated language set loads
 * up front (PLAN.md §8 — bundle size); anything else lazy-loads on first
 * sight and falls back to plain text if unknown. Mermaid fences are left
 * untouched for the client-side Mermaid renderer.
 *
 * Dual-themed (vitesse-light + vitesse-dark, dark-mode addendum): codeToHast
 * emits both palettes as CSS custom properties on every token span
 * (--shiki-light/--shiki-dark plus the light default inline as `color`), so
 * a theme switch is a pure CSS override (reader.css) rather than a
 * re-highlight. The background is overridden to paper-3 in CSS, and
 * saturation muting lives in the theme choice itself so a page of prose
 * with one code block still reads as monochrome in either theme.
 */
const CURATED: BundledLanguage[] = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "python",
  "rust",
  "bash",
  "json",
  "yaml",
  "html",
  "css",
  "sql",
  "swift",
  "markdown",
];

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: ["vitesse-light", "vitesse-dark"],
        langs: CURATED,
      }),
    );
  }
  return highlighterPromise;
}

function langOf(code: Element): string | null {
  const cls = code.properties?.className;
  if (!Array.isArray(cls)) return null;
  for (const c of cls) {
    if (typeof c === "string" && c.startsWith("language-")) {
      return c.slice("language-".length);
    }
  }
  return null;
}

export default function rehypeShikiHighlight() {
  return async (tree: Root) => {
    const targets: { pre: Element; code: Element; lang: string }[] = [];

    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "pre") return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const lang = langOf(code);
      if (!lang || lang === "mermaid") return;
      targets.push({ pre: node, code, lang });
    });

    if (targets.length === 0) return;

    const highlighter = await getHighlighter();

    for (const { pre, code, lang } of targets) {
      let useLang = lang;
      if (!highlighter.getLoadedLanguages().includes(lang)) {
        try {
          await highlighter.loadLanguage(lang as BundledLanguage);
        } catch {
          useLang = "text";
        }
      }
      const source = hastToString(code).replace(/\n$/, "");
      const highlighted = highlighter.codeToHast(source, {
        lang: useLang,
        themes: { light: "vitesse-light", dark: "vitesse-dark" },
        defaultColor: "light",
      });
      // codeToHast returns a root whose child is <pre><code>…</code></pre>;
      // graft the highlighted <code> in place so our own <pre> styling and
      // the language class survive. The outer <pre>'s "shiki" class also
      // needs to travel across — it's what reader.css's dark-mode override
      // targets to reach the per-token --shiki-dark colours. Note:
      // codeToHast's raw output uses the literal HTML attribute name
      // "class" (a space-separated string), not hast's usual normalised
      // "className" (a string array) — has to be converted, or
      // hast-util-to-jsx-runtime won't recognise it as the same property
      // when it later turns this tree into React elements.
      const newPre = highlighted.children[0];
      let shikiClassName: string[] | undefined;
      if (newPre?.type === "element") {
        const rawClass = newPre.properties?.class;
        if (typeof rawClass === "string") {
          shikiClassName = rawClass.split(" ").filter(Boolean);
        }
        const newCode = newPre.children[0];
        if (newCode?.type === "element") {
          newCode.properties = {
            ...newCode.properties,
            className: code.properties?.className,
          };
          pre.children = [newCode];
        }
      }
      pre.properties = {
        ...pre.properties,
        className: shikiClassName,
        "data-lang": lang,
      };
    }
  };
}
