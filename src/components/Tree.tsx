import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Folder } from "lucide-react";
import type { TreeNode } from "../ipc";
import { LinkPopover } from "./LinkPopover";

interface TreeProps {
  nodes: TreeNode[];
  currentPath: string | null;
  onOpen: (path: string) => void;
  onRenameFile: (path: string, newName: string) => void;
  onDeleteFile: (path: string) => void;
}

type ContextMenuState = { path: string; name: string; x: number; y: number; confirmDelete: boolean };

const stripExt = (name: string) => name.replace(/\.(md|markdown)$/, "");

/**
 * File browser, styled after Finder's column view: each directory level gets
 * its own vertical list, laid out left-to-right, with the whole strip
 * scrolling horizontally as you drill deeper. `chain` holds the sequence of
 * directory paths drilled into beyond the root (so columns.length ===
 * chain.length + 1). It resyncs from `currentPath`'s own ancestry whenever a
 * file is opened from elsewhere (a wikilink, the quick switcher, search) —
 * exactly like Finder snapping its columns to a file revealed by Spotlight —
 * and otherwise just grows/shrinks as the user clicks folders in a column.
 */
export function Tree({ nodes, currentPath, onOpen, onRenameFile, onDeleteFile }: TreeProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [chain, setChain] = useState<string[]>([]);

  const nodeByPath = useMemo(() => new Map(nodes.map((n) => [n.path, n])), [nodes]);

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

  const ancestorsOf = (path: string | null): string[] => {
    const result: string[] = [];
    let cur = path ? (nodeByPath.get(path)?.parent ?? null) : null;
    while (cur) {
      result.unshift(cur);
      cur = nodeByPath.get(cur)?.parent ?? null;
    }
    return result;
  };

  // A file opened from outside the tree (link click, quick switcher, search)
  // should reveal itself in the columns, just like Finder does.
  useEffect(() => {
    setChain(ancestorsOf(currentPath));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, nodes]);

  const fileParent = currentPath ? (nodeByPath.get(currentPath)?.parent ?? null) : null;
  const columnParents: (string | null)[] = [null, ...chain];

  const openFolder = (columnIndex: number, path: string) => {
    setChain((prev) => [...prev.slice(0, columnIndex), path]);
  };

  const openFile = (columnIndex: number, path: string) => {
    setChain((prev) => prev.slice(0, columnIndex));
    onOpen(path);
  };

  const openMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    setMenu({
      path: node.path,
      name: stripExt(node.name),
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

  return (
    <nav className="chrome" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <p className="chrome-label">Files</p>
      <div className="tree-columns" style={{ flex: 1, minHeight: 0 }}>
        {columnParents.map((parent, columnIndex) => {
          const items = childrenOf.get(parent) ?? [];
          if (items.length === 0) return null;
          const selectedPath = columnParents[columnIndex + 1] ??
            (parent === fileParent ? currentPath : null);

          return (
            <div className="tree-column" key={parent ?? "__root"}>
              {items.map((node) =>
                renamingPath === node.path ? (
                  <input
                    key={node.path}
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
                    key={node.path}
                    className={`tree-item tree-col-item${node.path === selectedPath ? " selected" : ""}`}
                    aria-current={node.path === selectedPath}
                    onClick={() =>
                      node.isDir ? openFolder(columnIndex, node.path) : openFile(columnIndex, node.path)
                    }
                    onContextMenu={(e) => (node.isDir ? undefined : openMenu(e, node))}
                  >
                    {node.isDir ? (
                      <Folder size={12} strokeWidth={1.5} />
                    ) : (
                      <FileText size={12} strokeWidth={1.5} />
                    )}
                    <span className="tree-col-item-label">{stripExt(node.name)}</span>
                    {node.isDir && <ChevronRight size={12} strokeWidth={1.5} className="chevron" />}
                  </button>
                ),
              )}
            </div>
          );
        })}
      </div>

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
