import { useMemo } from "react";
import { ChevronRight, ChevronDown, FileText } from "lucide-react";
import type { TreeNode } from "../ipc";
import { useAppStore } from "../stores/appStore";
import { persistSet } from "../persist";

interface TreeProps {
  nodes: TreeNode[];
  currentPath: string | null;
  onOpen: (path: string) => void;
}

/** File tree sidebar. Expansion state persists via tauri-plugin-store /
 * localStorage (hydrated on app startup). */
export function Tree({ nodes, currentPath, onOpen }: TreeProps) {
  const { collapsedNodes, setCollapsedNodes } = useAppStore();

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, TreeNode[]>();
    for (const node of nodes) {
      const list = map.get(node.parent) ?? [];
      list.push(node);
      map.set(node.parent, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
      );
    }
    return map;
  }, [nodes]);

  const toggle = (path: string) => {
    const next = new Set(collapsedNodes);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setCollapsedNodes(next);
    // Persist the updated state
    persistSet("folio.collapsedNodes", Array.from(next));
  };

  const renderLevel = (parent: string | null, depth: number): React.ReactNode =>
    (childrenOf.get(parent) ?? []).map((node) => (
      <div key={node.path} style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
        {node.isDir ? (
          <>
            <button className="tree-item" onClick={() => toggle(node.path)}>
              {collapsedNodes.has(node.path) ? (
                <ChevronRight size={12} strokeWidth={1.5} style={{ verticalAlign: -1 }} />
              ) : (
                <ChevronDown size={12} strokeWidth={1.5} style={{ verticalAlign: -1 }} />
              )}{" "}
              {node.name}
            </button>
            {!collapsedNodes.has(node.path) && renderLevel(node.path, depth + 1)}
          </>
        ) : (
          <button
            className="tree-item"
            aria-current={node.path === currentPath}
            onClick={() => onOpen(node.path)}
          >
            <FileText size={12} strokeWidth={1.5} style={{ verticalAlign: -1 }} />{" "}
            {node.name.replace(/\.(md|markdown)$/, "")}
          </button>
        )}
      </div>
    ));

  return (
    <nav className="chrome">
      <p className="chrome-label">Files</p>
      {renderLevel(null, 0)}
    </nav>
  );
}
