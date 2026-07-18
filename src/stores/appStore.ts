import { create } from "zustand";
import type { TreeNode } from "../ipc";
import { persistGet, persistSet } from "../persist";

/**
 * App state, kept deliberately boring. "Navigation" is setting currentPath;
 * back/forward is a plain stack pair. No router. Persisted state
 * (pane visibility, tree expansion) uses tauri-plugin-store with
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

  // Panes (persisted via tauri-plugin-store / localStorage)
  showTree: boolean;
  showToc: boolean;

  // Tree expansion state (persisted, keyed by root path)
  collapsedNodes: Set<string>;

  setRoot: (path: string, name: string) => void;
  setTree: (tree: TreeNode[]) => void;
  navigate: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  toggleEditing: () => void;
  togglePane: (pane: "tree" | "toc") => void;
  setCollapsedNodes: (nodes: Set<string>) => void;
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
  showTree: true,
  showToc: true,
  collapsedNodes: new Set(),

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
      persistSet(`folio.${key}`, value);
      return { [key]: value };
    }),

  setCollapsedNodes: (nodes) => set({ collapsedNodes: nodes }),

  hydratePersistedState: async () => {
    const showTree = await persistGet("folio.showTree", true);
    const showToc = await persistGet("folio.showToc", true);
    const collapsedNodesArray = await persistGet<string[]>("folio.collapsedNodes", []);
    set({
      showTree,
      showToc,
      collapsedNodes: new Set(collapsedNodesArray),
    });
  },
}));
