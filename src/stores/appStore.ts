import { create } from "zustand";
import type { TreeNode } from "../ipc";

/**
 * App state, kept deliberately boring. "Navigation" is setting currentPath;
 * back/forward is a plain stack pair. No router.
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

  // Panes (persisted to localStorage for now; tauri-plugin-store in Phase 2)
  showTree: boolean;
  showToc: boolean;

  setRoot: (path: string, name: string) => void;
  setTree: (tree: TreeNode[]) => void;
  navigate: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  toggleEditing: () => void;
  togglePane: (pane: "tree" | "toc") => void;
}

const persistedBool = (key: string, fallback: boolean) => {
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "1";
};

export const useAppStore = create<AppState>((set, get) => ({
  rootPath: null,
  rootName: null,
  tree: [],
  currentPath: null,
  editing: false,
  back: [],
  forward: [],
  showTree: persistedBool("folio.showTree", true),
  showToc: persistedBool("folio.showToc", true),

  setRoot: (path, name) =>
    set({ rootPath: path, rootName: name, currentPath: null, back: [], forward: [] }),

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

  toggleEditing: () => set((s) => ({ editing: !s.editing })),

  togglePane: (pane) =>
    set((s) => {
      const key = pane === "tree" ? "showTree" : "showToc";
      const value = !s[key];
      localStorage.setItem(`folio.${key}`, value ? "1" : "0");
      return { [key]: value };
    }),
}));
