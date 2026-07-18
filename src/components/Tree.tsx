import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, FileText } from "lucide-react";
import type { TreeNode } from "../ipc";

interface TreeProps {
  nodes: TreeNode[];
  currentPath: string | null;
  onOpen: (path: string) => void;
}

/** File tree sidebar. Expansion memory persists per root in Phase 2 via
 * tauri-plugin-store; session-local for now. */
export function Tree({ nodes, currentPath, onOpen }: TreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderLevel = (parent: string | null, depth: number): React.ReactNode =>
    (childrenOf.get(parent) ?? []).map((node) => (
      <div key={node.path} style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
        {node.isDir ? (
          <>
            <button className="tree-item" onClick={() => toggle(node.path)}>
              {collapsed.has(node.path) ? (
                <ChevronRight size={12} strokeWidth={1.5} style={{ verticalAlign: -1 }} />
              ) : (
                <ChevronDown size={12} strokeWidth={1.5} style={{ verticalAlign: -1 }} />
              )}{" "}
              {node.name}
            </button>
            {!collapsed.has(node.path) && renderLevel(node.path, depth + 1)}
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
