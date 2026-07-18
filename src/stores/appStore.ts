import { create } from "zustand";
import type { TreeNode } from "../ipc";
import { persistGet, persistSet } from "../persist";

/**
 * App state, kept deliberately boring. "Navigation" is setting currentPath;
 * back/forward is a plain stack pair. No router. Persisted state
 * (pane visibility, tree expansion, favourites) uses tauri-plugin-store with
 * localStorage fallback via persist.ts.
 */
interface AppState {
  rootPath: string | null;
  rootName: string | null;
  tree: TreeNode[];
  currentPath: string | null;
  editing: boolean;

  // History
  back: string[];
  forward: string[];

  // The folder currently shown in the sidebar's file browser (root-relative,
  // "" at the vault root) — lifted up out of Tree.tsx so Favourites can jump
  // the browser to a pinned folder without prop-drilling a callback through
  // App.tsx.
  browserDir: string;

  // Panes (persisted via tauri-plugin-store / localStorage)
  showTree: boolean;
  showToc: boolean;

  // Pinned files/folders (persisted), root-relative paths, most-recent-last.
  favourites: string[];

  setRoot: (path: string, name: string) => void;
  setTree: (tree: TreeNode[]) => void;
  navigate: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  renamePath: (oldPath: string, newPath: string) => void;
  removePath: (path: string) => void;
  toggleEditing: () => void;
  setEditing: (editing: boolean) => void;
  togglePane: (pane: "tree" | "toc") => void;
  setBrowserDir: (dir: string) => void;
  toggleFavourite: (path: string) => void;
  hydratePersistedState: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  rootPath: null,
  rootName: null,
  tree: [],
  currentPath: null,
  editing: false,
  back: [],
  forward: [],
  browserDir: "",
  showTree: true,
  showToc: true,
  favourites: [],

  setRoot: (path, name) =>
    set({ rootPath: path, rootName: name, currentPath: null, browserDir: "", back: [], forward: [] }),

  setTree: (tree) => set({ tree }),

  navigate: (path) => {
    const { currentPath, back } = get();
    if (path === currentPath) return;
    set({
      currentPath: path,
      back: currentPath ? [...back, currentPath] : back,
      forward: [],
      editing: false,
    });
  },

  goBack: () => {
    const { back, forward, currentPath } = get();
    const prev = back[back.length - 1];
    if (!prev) return;
    set({
      currentPath: prev,
      back: back.slice(0, -1),
      forward: currentPath ? [currentPath, ...forward] : forward,
      editing: false,
    });
  },

  goForward: () => {
    const { back, forward, currentPath } = get();
    const next = forward[0];
    if (!next) return;
    set({
      currentPath: next,
      forward: forward.slice(1),
      back: currentPath ? [...back, currentPath] : back,
      editing: false,
    });
  },

  // File-ops housekeeping (PLAN.md §4/§7 Phase 6): a rename/delete never
  // pushes history — it fixes up currentPath and the existing back/forward
  // stacks (and favourites) in place so ⌘[/⌘] and pinned items keep working
  // across the change.
  renamePath: (oldPath, newPath) =>
    set((s) => ({
      currentPath: s.currentPath === oldPath ? newPath : s.currentPath,
      back: s.back.map((p) => (p === oldPath ? newPath : p)),
      forward: s.forward.map((p) => (p === oldPath ? newPath : p)),
      favourites: s.favourites.map((p) => (p === oldPath ? newPath : p)),
    })),

  removePath: (path) =>
    set((s) => {
      const favourites = s.favourites.filter((p) => p !== path);
      if (favourites.length !== s.favourites.length) {
        persistSet("markdownReader.favourites", favourites);
      }
      return {
        currentPath: s.currentPath === path ? null : s.currentPath,
        back: s.back.filter((p) => p !== path),
        forward: s.forward.filter((p) => p !== path),
        favourites,
      };
    }),

  toggleEditing: () => set((s) => ({ editing: !s.editing })),
  setEditing: (editing) => set({ editing }),

  togglePane: (pane) =>
    set((s) => {
      const key = pane === "tree" ? "showTree" : "showToc";
      const value = !s[key];
      persistSet(`markdownReader.${key}`, value);
      return { [key]: value };
    }),

  setBrowserDir: (dir) => set({ browserDir: dir }),

  toggleFavourite: (path) =>
    set((s) => {
      const favourites = s.favourites.includes(path)
        ? s.favourites.filter((p) => p !== path)
        : [...s.favourites, path];
      persistSet("markdownReader.favourites", favourites);
      return { favourites };
    }),

  hydratePersistedState: async () => {
    const showTree = await persistGet("markdownReader.showTree", true);
    const showToc = await persistGet("markdownReader.showToc", true);
    const favourites = await persistGet<string[]>("markdownReader.favourites", []);
    set({ showTree, showToc, favourites });
  },
}));
