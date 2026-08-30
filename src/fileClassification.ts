import type { TreeNode } from "./ipc";

/** File-manager behaviour is determined in one place so Markdown checks do
 * not drift between the browser, rows and link routing. */
export type FileKind = "directory" | "markdown" | "external";

export function isMarkdownPath(path: string): boolean {
  return /\.(?:md|markdown)$/i.test(path);
}

export function classifyTreeNode(node: Pick<TreeNode, "name" | "isDir">): FileKind {
  if (node.isDir) return "directory";
  return isMarkdownPath(node.name) ? "markdown" : "external";
}
