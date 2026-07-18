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
  readTree: () => invoke<TreeNode[]>("read_tree"),
  readFile: (path: string) => invoke<FileContent>("read_file", { path }),
  writeFile: (path: string, content: string, expectedMtimeMs: number) =>
    invoke<FileContent>("write_file", { path, content, expectedMtimeMs }),
  search: (query: string) => invoke<SearchHit[]>("search", { query }),
  buildLinkIndex: () => invoke<LinkIndexEntry[]>("build_link_index"),
  watchRoot: () => invoke<void>("watch_root"),
  onFsChanged: (handler: (change: FsChange) => void): Promise<UnlistenFn> =>
    listen<FsChange>("fs-changed", (event) => handler(event.payload)),
};
