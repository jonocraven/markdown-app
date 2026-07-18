import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, FileText } from "lucide-react";
import type { TreeNode } from "../ipc";
import { useAppStore } from "../stores/appStore";
import { persistSet } from "../persist";
import { LinkPopover } from "./LinkPopover";

interface TreeProps {
  nodes: TreeNode[];
  currentPath: string | null;
  onOpen: (path: string) => void;
  onRenameFile: (path: string, newName: string) => void;
  onDeleteFile: (path: string) => void;
}

type ContextMenuState = { path: string; name: string; x: number; y: number; confirmDelete: boolean };

/** File tree sidebar. Expansion state persists via tauri-plugin-store /
 * localStorage (hydrated on app startup). Right-click a file for a context
 * menu (Rename / Move to Bin — PLAN.md §4/§7 Phase 6), styled like the
 * link-routing popovers (paper ground, hairline border, mono small type). */
export function Tree({ nodes, currentPath, onOpen, onRenameFile, onDeleteFile }: TreeProps) {
  const { collapsedNodes, setCollapsedNodes } = useAppStore();
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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

  const openMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    setMenu({
      path: node.path,
      name: node.name.replace(/\.(md|markdown)$/, ""),
      x: e.clientX,
      y: e.clientY,
      confirmDelete: false,
    });
  };

  const startRename = () => {
    if (!menu) return;
    setRenamingPath(menu.path);
    setRenameValue(menu.name);
    setMenu(null);
  };

  const confirmRename = (path: string) => {
    const trimmed = renameValue.trim();
    setRenamingPath(null);
    if (trimmed) onRenameFile(path, trimmed);
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
        ) : renamingPath === node.path ? (
          <input
            autoFocus
            className="tree-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmRename(node.path);
              else if (e.key === "Escape") setRenamingPath(null);
            }}
            onBlur={() => setRenamingPath(null)}
          />
        ) : (
          <button
            className="tree-item"
            aria-current={node.path === currentPath}
            onClick={() => onOpen(node.path)}
            onContextMenu={(e) => openMenu(e, node)}
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

      {menu && !menu.confirmDelete && (
        <LinkPopover x={menu.x} y={menu.y} kind="tree-menu" onClose={() => setMenu(null)}>
          <p className="link-popover-label">{menu.name}</p>
          <button className="link-popover-item" onClick={startRename}>
            Rename
          </button>
          <button
            className="link-popover-item"
            onClick={() => setMenu((m) => (m ? { ...m, confirmDelete: true } : m))}
          >
            Move to Bin
          </button>
        </LinkPopover>
      )}

      {menu && menu.confirmDelete && (
        <LinkPopover x={menu.x} y={menu.y} kind="tree-delete-confirm" onClose={() => setMenu(null)}>
          <p className="link-popover-label">Move to Bin?</p>
          <p className="link-popover-path">{menu.path}</p>
          <div className="link-popover-actions">
            <button
              className="link-popover-button"
              onClick={() => {
                onDeleteFile(menu.path);
                setMenu(null);
              }}
            >
              Confirm
            </button>
            <button className="link-popover-button" onClick={() => setMenu(null)}>
              Cancel
            </button>
          </div>
        </LinkPopover>
      )}
    </nav>
  );
}
