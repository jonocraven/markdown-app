/**
 * Storage facade. Tauri mode delegates every call to `ipc` (the real
 * Rust-backed root on disk). Browser mode — this container's only test bed,
 * with no WKWebView/GTK window to open — serves an in-memory vault built
 * from every file under samples/ via `import.meta.glob`, so navigation,
 * link resolution and history behave identically without a Tauri window.
 *
 * App.tsx and src/linkRouter.ts call this facade, never `ipc` or
 * `isTauri()` directly, so the branching lives in exactly one place.
 */
import { ipc, isTauri, type LinkIndexEntry, type TreeNode } from "./ipc";

// Eagerly inline every sample .md file as raw text, keyed by its path
// relative to samples/ (which stands in for the vault root in browser mode).
const modules = import.meta.glob("../samples/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const browserFiles = new Map<string, string>();
for (const [modPath, content] of Object.entries(modules)) {
  const rel = modPath.replace(/^\.\.\/samples\//, "");
  browserFiles.set(rel, content);
}

function stemOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.(md|markdown)$/i, "").toLowerCase();
}

/** Build a TreeNode[] (same shape read_tree returns) from a flat list of
 * root-relative file paths, synthesising directory nodes as needed. */
function buildTree(paths: string[]): TreeNode[] {
  const dirsSeen = new Set<string>();
  const nodes: TreeNode[] = [];

  for (const path of [...paths].sort()) {
    const segments = path.split("/");
    let acc = "";
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const parent = acc || null;
      acc = acc ? `${acc}/${seg}` : seg;
      if (!dirsSeen.has(acc)) {
        dirsSeen.add(acc);
        nodes.push({ path: acc, name: seg, isDir: true, parent });
      }
    }
    const name = segments[segments.length - 1];
    const parent = segments.length > 1 ? segments.slice(0, -1).join("/") : null;
    nodes.push({ path, name, isDir: false, parent });
  }
  return nodes;
}

export const vault = {
  /** Whole-vault file listing as a tree (for the sidebar). */
  async listTree(): Promise<TreeNode[]> {
    if (isTauri()) return ipc.readTree();
    return buildTree(Array.from(browserFiles.keys()));
  },

  async readFile(path: string): Promise<{ content: string; mtimeMs: number }> {
    if (isTauri()) return ipc.readFile(path);
    const content = browserFiles.get(path);
    if (content === undefined) {
      throw new Error(`folio: file not found in browser vault: ${path}`);
    }
    return { content, mtimeMs: 0 };
  },

  /** Case-normalised stem → path index, for wikilink resolution. Mirrors
   * ipc.buildLinkIndex()'s shape exactly (lowercased stem, root-relative
   * path) so link resolution logic doesn't need to know which mode it's in. */
  async linkIndex(): Promise<LinkIndexEntry[]> {
    if (isTauri()) return ipc.buildLinkIndex();
    return Array.from(browserFiles.keys()).map((path) => ({ stem: stemOf(path), path }));
  },

  async exists(path: string): Promise<boolean> {
    if (isTauri()) {
      const index = await ipc.buildLinkIndex();
      return index.some((e) => e.path === path);
    }
    return browserFiles.has(path);
  },

  /** Create a new file (the broken-wikilink "create" flow). Tauri mode
   * writes through the one sanctioned path, ipc.writeFile — write_file
   * skips its mtime conflict check when the file doesn't exist yet
   * (src-tauri/src/commands.rs), so expectedMtimeMs: 0 is safe for a brand
   * new path. Browser mode just adds it to the in-memory map. */
  async createFile(path: string, content: string): Promise<void> {
    if (isTauri()) {
      await ipc.writeFile(path, content, 0);
      return;
    }
    browserFiles.set(path, content);
  },
};
