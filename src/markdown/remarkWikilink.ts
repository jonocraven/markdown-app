import type { Root, PhrasingContent, Text } from "mdast";
import { visit } from "unist-util-visit";

/**
 * Turns [[target]] and [[target|display]] into link nodes carrying a
 * `data-wikilink` attribute. Resolution (stem → path) happens at click time
 * against the Rust link index, not at parse time — the pipeline stays pure.
 */
const WIKILINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

export default function remarkWikilink() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      // Don't rewrite inside existing links.
      if (parent.type === "link" || parent.type === "linkReference") return;

      const value = node.value;
      WIKILINK.lastIndex = 0;
      if (!WIKILINK.test(value)) return;
      WIKILINK.lastIndex = 0;

      const out: PhrasingContent[] = [];
      let last = 0;
      let match: RegExpExecArray | null;

      while ((match = WIKILINK.exec(value)) !== null) {
        const [whole, target, display] = match;
        if (match.index > last) {
          out.push({ type: "text", value: value.slice(last, match.index) });
        }
        out.push({
          type: "link",
          url: "",
          data: {
            hProperties: { "data-wikilink": target.trim() },
          },
          children: [{ type: "text", value: (display ?? target).trim() }],
        });
        last = match.index + whole.length;
      }
      if (last < value.length) {
        out.push({ type: "text", value: value.slice(last) });
      }

      parent.children.splice(index, 1, ...out);
      return index + out.length;
    });
  };
}
