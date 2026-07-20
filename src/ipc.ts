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

export interface DirEntry {
  path: string; // absolute
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

/** Android's native dialog picker returns unusable content:// SAF URIs
 * (PLAN-ANDROID.md §2), so folder picking there uses an in-app browser
 * (FolderPickerDialog) instead of ipc.pickRoot. WebView reliably reports
 * "Android" in the UA string — no native plugin needed for this check. */
export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

export const ipc = {
  pickRoot: () => invoke<RootInfo | null>("pick_root"),
  setRoot: (path: string) => invoke<RootInfo>("set_root", { path }),
  listDirs: (path: string) => invoke<DirEntry[]>("list_dirs", { path }),
  currentRoot: () => invoke<RootInfo | null>("current_root"),
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
  /** Files opened via the OS — Files app "Open With", a .md double-click,
   * drag-onto-app (macOS) — see src-tauri/src/lib.rs's RunEvent::Opened
   * handler. `unsupported` counts URLs that couldn't convert to a real
   * path (e.g. an Android content:// share from an app like Drive). */
  onOpenFile: (
    handler: (payload: { paths: string[]; unsupported: number }) => void,
  ): Promise<UnlistenFn> =>
    listen<{ paths: string[]; unsupported: number }>("open-file", (event) =>
      handler(event.payload),
    ),
};
