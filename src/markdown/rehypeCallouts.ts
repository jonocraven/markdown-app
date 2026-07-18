import type { Root, Element, Text } from "hast";
import { visit } from "unist-util-visit";

const KINDS = ["note", "tip", "important", "warning", "caution"] as const;
const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/;

/**
 * GitHub-style alerts: a blockquote whose first paragraph starts with
 * [!NOTE] etc becomes <div class="callout" data-callout="note"> with a
 * mono label. Monochrome by design — kind is conveyed by label and border
 * weight, never colour (PLAN.md §6).
 */
export default function rehypeCallouts() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "blockquote") return;

      const firstPara = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "p",
      );
      if (!firstPara) return;

      const firstText = firstPara.children[0];
      if (firstText?.type !== "text") return;

      const match = firstText.value.match(MARKER);
      if (!match) return;

      const kind = match[1].toLowerCase() as (typeof KINDS)[number];
      if (!KINDS.includes(kind)) return;

      // Strip the marker (and a leading line break left behind by it).
      firstText.value = firstText.value.slice(match[0].length).replace(/^\n/, "");
      if (firstText.value === "") {
        firstPara.children.shift();
        const next = firstPara.children[0];
        if (next?.type === "element" && next.tagName === "br") {
          firstPara.children.shift();
        }
      }
      if (firstPara.children.length === 0) {
        node.children = node.children.filter((c) => c !== firstPara);
      }

      const label: Element = {
        type: "element",
        tagName: "p",
        properties: { className: ["callout-title"] },
        children: [{ type: "text", value: match[1] } satisfies Text],
      };

      node.tagName = "div";
      node.properties = {
        ...node.properties,
        className: ["callout"],
        "data-callout": kind,
      };
      node.children.unshift(label);
    });
  };
}
