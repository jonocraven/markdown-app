/**
 * Storage facade. Tauri mode delegates every call to `ipc` (the real
 * Rust-backed root on disk). Browser mode — this container's only test bed,
 * with no WKWebView/GTK window to open — serves an in-memory vault built
 * from every file under samples/ via `import.meta.glob`, so navigation,
 * link resolution, history and now writes/conflicts behave identically
 * without a Tauri window.
 *
 * App.tsx and src/linkRouter.ts call this facade, never `ipc` or
 * `isTauri()` directly, so the branching lives in exactly one place.
 */
import { ipc, isTauri, type DirEntry, type LinkIndexEntry, type TreeNode, type SearchHit } from "./ipc";

// Re-export these types so callers can import from vault instead of ipc
export type { DirEntry, LinkIndexEntry, SearchHit };

/** Starting point for the Android in-app folder browser — the root of
 * Android's All Files Access grant (PLAN-ANDROID.md §2/§6). Real on-device;
 * also the root of the fake directory tree browser mode serves below. */
export const ANDROID_ROOT = "/storage/emulated/0";

/** Browser-mode-only fake directory tree, so FolderPickerDialog.tsx (the
 * Android-only in-app folder picker) has something to list in Chromium,
 * which has no real Android filesystem. Not reachable today — the picker
 * only renders when isAndroid() is true, and browser mode never reports a
 * real Android UA — but harmless to keep for a future dev-mode override.
 * Keyed by absolute path, values are child directory names (not files:
 * list_dirs/listDirs only ever returns directories). */
const FAKE_ANDROID_DIRS: Record<string, string[]> = {
  [ANDROID_ROOT]: ["Documents", "Download", "Pictures"],
  [`${ANDROID_ROOT}/Documents`]: ["Notes"],
  [`${ANDROID_ROOT}/Documents/Notes`]: [],
  [`${ANDROID_ROOT}/Download`]: [],
  [`${ANDROID_ROOT}/Pictures`]: [],
};

// Eagerly inline every sample .md file as raw text, keyed by its path
// relative to samples/ (which stands in for the vault root in browser mode).
const modules = import.meta.glob("../samples/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

interface BrowserFile {
  content: string;
  mtimeMs: number;
}

// Monotonic counter standing in for real filesystem mtimes in browser mode.
// Always increases (even across writes within the same millisecond), so the
// conflict-detection semantics below are exercisable and deterministic in
// Playwright without a real clock/filesystem.
let nextBrowserMtime = 1;

const browserFiles = new Map<string, BrowserFile>();
for (const [modPath, content] of Object.entries(modules)) {
  const rel = modPath.replace(/^\.\.\/samples\//, "");
  browserFiles.set(rel, { content, mtimeMs: nextBrowserMtime++ });
}

function stemOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.(md|markdown)$/i, "").toLowerCase();
}

/** Case-preserving filename stem (unlike stemOf, which lowercases for
 * link-index matching) — used for the default `# Title` heading a new file
 * is created with, mirroring the Rust side's `file_stem()` verbatim. */
function rawStemOf(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.(md|markdown)$/i, "");
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

/**
 * The write path's conflict error shape — mirrors src-tauri's
 * `CommandError::Conflict` (`#[serde(rename_all = "camelCase", tag = "kind")]`
 * in src-tauri/src/commands.rs), so a Tauri `invoke` rejection and the
 * browser-mode simulation below are handled identically by every caller.
 */
export interface ConflictError {
  kind: "conflict";
  currentMtimeMs: number;
}

export function isConflictError(err: unknown): err is ConflictError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { kind?: unknown }).kind === "conflict" &&
    typeof (err as { currentMtimeMs?: unknown }).currentMtimeMs === "number"
  );
}

export type ExternalChange = {
  kind: "created" | "modified" | "deleted";
  paths: string[];
};
type ExternalChangeHandler = (change: ExternalChange) => void;

// Browser-mode-only pseudo-watcher: there is no real fs watcher without a
// Tauri window, so the dev hook below drives this listener set directly.
const externalChangeListeners = new Set<ExternalChangeHandler>();

/** Bump a browser file's mtime and content without going through the write
 * path — simulates Drive sync or another editor touching the file while
 * Markdown Reader has it open, so the conflict banner (and the live-reload
 * path) are exercisable in Chromium. Dev/test-only; see the `window` hook
 * below. */
function simulateExternalEdit(path: string, content: string): void {
  const existing = browserFiles.get(path);
  const mtimeMs = Math.max(nextBrowserMtime++, (existing?.mtimeMs ?? 0) + 1);
  browserFiles.set(path, { content, mtimeMs });
  const change: ExternalChange = { kind: existing ? "modified" : "created", paths: [path] };
  externalChangeListeners.forEach((fn) => fn(change));
}

declare global {
  interface Window {
    /** Playwright-only hook (browser/vite-preview mode): simulate the file
     * at `path` changing on disk out from under an open editor, to exercise
     * the conflict banner without a real Tauri window. Does not exist in
     * Tauri mode. */
    __markdownReaderSimulateExternalEdit?: (path: string, content: string) => void;
  }
}

if (!isTauri()) {
  window.__markdownReaderSimulateExternalEdit = simulateExternalEdit;
}

export const vault = {
  /** Whole-vault file listing as a tree (for the sidebar). */
  async listTree(): Promise<TreeNode[]> {
    if (isTauri()) return ipc.readTree();
    return buildTree(Array.from(browserFiles.keys()));
  },

  /** Android-only in-app folder picker's subdirectory listing (see
   * FolderPickerDialog.tsx) — an absolute path in, absolute child paths out.
   * Deliberately independent of the vault root (there may not be one yet).
   * Browser mode serves the FAKE_ANDROID_DIRS tree above, sorted the same
   * way the Rust side sorts (case-insensitive by name). */
  async listDirs(path: string): Promise<DirEntry[]> {
    if (isTauri()) return ipc.listDirs(path);
    const children = FAKE_ANDROID_DIRS[path] ?? [];
    return [...children]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ name, path: `${path}/${name}` }));
  },

  /** Commit a folder chosen via the Android FolderPickerDialog as the vault
   * root (mirrors ipc.setRoot's Rust semantics — src-tauri/src/commands.rs's
   * set_root). Browser-mode stub: no real Android filesystem to repoint the
   * vault to, so it just resolves with a synthesised RootInfo. */
  async setRoot(path: string): Promise<{ path: string; name: string }> {
    if (isTauri()) return ipc.setRoot(path);
    const name = path.split("/").filter(Boolean).pop() ?? path;
    return { path, name };
  },

  async readFile(path: string): Promise<{ content: string; mtimeMs: number }> {
    if (isTauri()) return ipc.readFile(path);
    const file = browserFiles.get(path);
    if (file === undefined) {
      throw new Error(`markdown-reader: file not found in browser vault: ${path}`);
    }
    return { content: file.content, mtimeMs: file.mtimeMs };
  },

  /**
   * Conflict-checked write — the ONLY write path (PLAN.md §8, CLAUDE.md).
   * Tauri mode delegates straight to `write_file` (atomic temp-file+rename
   * with an mtime check on the Rust side). Browser mode simulates the exact
   * same semantics against the in-memory map: rejects with a
   * `ConflictError` (see `isConflictError`) if the stored mtime has moved
   * since `expectedMtimeMs` was read, otherwise stores the new content under
   * a freshly bumped mtime and returns it — so the conflict banner is fully
   * exercisable in Chromium with no Tauri window.
   */
  async writeFile(
    path: string,
    content: string,
    expectedMtimeMs: number,
  ): Promise<{ content: string; mtimeMs: number }> {
    if (isTauri()) return ipc.writeFile(path, content, expectedMtimeMs);
    const existing = browserFiles.get(path);
    if (existing && existing.mtimeMs !== expectedMtimeMs) {
      const err: ConflictError = { kind: "conflict", currentMtimeMs: existing.mtimeMs };
      throw err;
    }
    const mtimeMs = Math.max(nextBrowserMtime++, (existing?.mtimeMs ?? 0) + 1);
    browserFiles.set(path, { content, mtimeMs });
    return { content, mtimeMs };
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

  /** Create a new file with caller-supplied content (the broken-wikilink
   * "create" flow, which title-cases the wikilink text rather than using
   * the plain filename stem — see linkRouter.ts). Tauri mode writes through
   * the one sanctioned path, ipc.writeFile — write_file skips its mtime
   * conflict check when the file doesn't exist yet (src-tauri/src/
   * commands.rs), so expectedMtimeMs: 0 is safe for a brand new path.
   * Browser mode just adds it to the in-memory map. */
  async createFileWithContent(path: string, content: string): Promise<void> {
    if (isTauri()) {
      await ipc.writeFile(path, content, 0);
      return;
    }
    browserFiles.set(path, { content, mtimeMs: nextBrowserMtime++ });
  },

  /** Create a new file (⌘N / the New File dialog and menu item): a minimal
   * `# Title\n` derived from the filename stem, refusing if the path
   * already exists. Mirrors ipc.createFile's Rust semantics — see
   * src-tauri/src/commands.rs's create_file, which reuses the same
   * atomic-write helper as write_file. */
  async createFile(path: string): Promise<{ content: string; mtimeMs: number }> {
    if (isTauri()) return ipc.createFile(path);
    if (browserFiles.has(path)) {
      const err: ConflictError = { kind: "conflict", currentMtimeMs: browserFiles.get(path)!.mtimeMs };
      throw err;
    }
    const content = `# ${rawStemOf(path)}\n`;
    const mtimeMs = nextBrowserMtime++;
    browserFiles.set(path, { content, mtimeMs });
    return { content, mtimeMs };
  },

  /** Rename/move a file within the vault. Refuses if the target already
   * exists. Mirrors ipc.renameFile's Rust semantics (both paths resolved
   * and checked against the root there). */
  async renameFile(from: string, to: string): Promise<void> {
    if (isTauri()) {
      await ipc.renameFile(from, to);
      return;
    }
    if (!browserFiles.has(from)) {
      throw new Error(`markdown-reader: file not found in browser vault: ${from}`);
    }
    if (browserFiles.has(to)) {
      throw new Error(`markdown-reader: target already exists: ${to}`);
    }
    const file = browserFiles.get(from)!;
    browserFiles.delete(from);
    browserFiles.set(to, file);
  },

  /** Move a file to the system bin (never a hard delete — see
   * src-tauri/src/commands.rs's delete_file, which uses the `trash` crate). */
  async deleteFile(path: string): Promise<void> {
    if (isTauri()) {
      await ipc.deleteFile(path);
      return;
    }
    browserFiles.delete(path);
  },

  /**
   * Subscribe to external file changes: real `fs-changed` events in Tauri
   * mode (Drive sync, another editor), or the `__markdownReaderSimulateExternalEdit`
   * dev hook in browser mode. Unified so App.tsx never has to branch on
   * `isTauri()` for live-reload/conflict-detection. Returns an unsubscribe
   * function (synchronous, unlike the underlying `ipc.onFsChanged`, which is
   * async — this hides that so it's a plain `useEffect` cleanup).
   */
  onExternalChange(handler: ExternalChangeHandler): () => void {
    if (isTauri()) {
      let unlisten: (() => void) | null = null;
      let cancelled = false;
      ipc.onFsChanged(handler).then((f) => {
        if (cancelled) f();
        else unlisten = f;
      });
      return () => {
        cancelled = true;
        unlisten?.();
      };
    }
    externalChangeListeners.add(handler);
    return () => externalChangeListeners.delete(handler);
  },

  /**
   * Full-text search: case-insensitive, regex-with-literal-fallback, capped
   * at 500 hits. Mirrors ipc.search's semantics exactly so link resolution
   * logic doesn't need to know which mode it's in.
   */
  async search(query: string): Promise<Array<{ path: string; line: number; text: string }>> {
    if (isTauri()) return ipc.search(query);

    // Browser mode: search all files in the vault
    const results: Array<{ path: string; line: number; text: string }> = [];
    const MAX_RESULTS = 500;

    // Try as regex; fall back to literal string on invalid regex
    let pattern: RegExp | null = null;
    try {
      pattern = new RegExp(query, "i"); // case-insensitive
    } catch {
      // Invalid regex — treat as literal
      pattern = null;
    }

    for (const [path, file] of browserFiles) {
      if (results.length >= MAX_RESULTS) break;

      const lines = file.content.split("\n");
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        if (results.length >= MAX_RESULTS) break;

        const text = lines[lineNum];
        let matches = false;

        if (pattern) {
          matches = pattern.test(text);
        } else {
          // Literal fallback: case-insensitive substring
          matches = text.toLowerCase().includes(query.toLowerCase());
        }

        if (matches) {
          results.push({ path, line: lineNum + 1, text });
        }
      }
    }

    return results;
  },
};
