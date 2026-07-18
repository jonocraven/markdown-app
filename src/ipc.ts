/**
 * Typed wrappers over the Tauri IPC commands (mirrors src-tauri/src/commands.rs).
 * All disk access goes through here; the frontend never touches paths itself.
 * `isTauri()` lets the UI run in plain `vite dev` (browser) against the
 * bundled sample document for typography work.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface RootInfo {
  path: string;
  name: string;
}

/** A directory entry returned by `list_dirs` — the Android in-app folder
 * browser's read-only listing (PLAN-ANDROID.md §2), used before a root
 * exists. `path` is absolute, unlike TreeNode's root-relative paths. */
export interface DirEntry {
  name: string;
  path: string;
}

export interface TreeNode {
  path: string; // relative to root
  name: string;
  isDir: boolean;
  parent: string | null; // relative path of parent dir, null at root
}

export interface FileContent {
  content: string;
  mtimeMs: number;
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

export interface LinkIndexEntry {
  stem: string;
  path: string;
}

export type FsChange = {
  kind: "created" | "modified" | "deleted";
  paths: string[];
};

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export const ipc = {
  pickRoot: () => invoke<RootInfo | null>("pick_root"),
  currentRoot: () => invoke<RootInfo | null>("current_root"),
  /** Android's in-app folder browser commits a choice through this instead
   * of pick_root (see src-tauri/src/commands.rs's set_root). */
  setRoot: (path: string) => invoke<RootInfo>("set_root", { path }),
  /** Read-only subdirectory listing for the Android folder browser — does
   * NOT go through the vault root (there may not be one yet). */
  listDirs: (path: string) => invoke<DirEntry[]>("list_dirs", { path }),
  readTree: () => invoke<TreeNode[]>("read_tree"),
  readFile: (path: string) => invoke<FileContent>("read_file", { path }),
  writeFile: (path: string, content: string, expectedMtimeMs: number) =>
    invoke<FileContent>("write_file", { path, content, expectedMtimeMs }),
  createFile: (path: string) => invoke<FileContent>("create_file", { path }),
  renameFile: (from: string, to: string) => invoke<void>("rename_file", { from, to }),
  deleteFile: (path: string) => invoke<void>("delete_file", { path }),
  search: (query: string) => invoke<SearchHit[]>("search", { query }),
  buildLinkIndex: () => invoke<LinkIndexEntry[]>("build_link_index"),
  watchRoot: () => invoke<void>("watch_root"),
  onFsChanged: (handler: (change: FsChange) => void): Promise<UnlistenFn> =>
    listen<FsChange>("fs-changed", (event) => handler(event.payload)),
  /** Native menu bar clicks — see src-tauri/src/lib.rs's on_menu_event,
   * which relays every custom item's id verbatim (predefined items like
   * about/quit/undo/redo are handled natively and never reach here). */
  onMenuEvent: (handler: (id: string) => void): Promise<UnlistenFn> =>
    listen<string>("menu", (event) => handler(event.payload)),
};
