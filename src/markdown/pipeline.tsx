import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import rehypeReact from "rehype-react";
import { visit } from "unist-util-visit";
import { toString as hastToString } from "hast-util-to-string";
import { parse as parseYaml } from "yaml";
import type { Root as MdastRoot } from "mdast";
import type { Root as HastRoot, Element } from "hast";

import remarkWikilink from "./remarkWikilink";
import rehypeCallouts from "./rehypeCallouts";
import rehypeShikiHighlight from "./highlight";
import { CodeBlock, TaskCheckbox } from "../components/ReaderBlocks";

export interface TocEntry {
  depth: number;
  id: string;
  text: string;
}

export interface RenderedDoc {
  element: ReactNode;
  toc: TocEntry[];
  wordCount: number;
  frontmatter: Record<string, unknown> | null;
}

/** Pull the YAML frontmatter node out into `holder` (remark side). */
function remarkExtractFrontmatter(holder: { value: Record<string, unknown> | null }) {
  return () => (tree: MdastRoot) => {
    const first = tree.children[0];
    if (first?.type === "yaml") {
      try {
        const parsed = parseYaml(first.value);
        holder.value =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
      } catch {
        holder.value = null;
      }
    }
  };
}

/**
 * Number every task checkbox in document order (hast side). Write-back in
 * Phase 4 maps data-task-index n to the nth `[ ]`/`[x]` marker in the
 * source, which is the same ordering by construction.
 */
function rehypeIndexTasks() {
  return (tree: HastRoot) => {
    let i = 0;
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "input" && node.properties?.type === "checkbox") {
        node.properties["data-task-index"] = i++;
      }
    });
  };
}

/** Collect h1–h4 ids/text for the TOC panel (hast side, after slug). */
function rehypeCollectToc(holder: { value: TocEntry[] }) {
  return () => (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      const m = /^h([1-4])$/.exec(node.tagName);
      if (!m || typeof node.properties?.id !== "string") return;
      holder.value.push({
        depth: Number(m[1]),
        id: node.properties.id,
        text: hastToString(node),
      });
    });
  };
}

export async function renderMarkdown(source: string): Promise<RenderedDoc> {
  const frontmatter = { value: null as Record<string, unknown> | null };
  const toc = { value: [] as TocEntry[] };

  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkExtractFrontmatter(frontmatter))
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkWikilink)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeCollectToc(toc))
    .use(rehypeKatex)
    .use(rehypeCallouts)
    .use(rehypeIndexTasks)
    .use(rehypeShikiHighlight)
    .use(rehypeReact, {
      Fragment,
      jsx,
      jsxs,
      components: {
        pre: CodeBlock,
        input: TaskCheckbox,
      },
    });

  const file = await processor.process(source);

  const body = source.replace(/^---\n[\s\S]*?\n---\n/, "");
  const words = body.trim().length === 0 ? 0 : body.trim().split(/\s+/).length;

  return {
    element: file.result as ReactNode,
    toc: toc.value,
    wordCount: words,
    frontmatter: frontmatter.value,
  };
}
