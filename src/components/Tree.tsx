import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Folder } from "lucide-react";
import type { TreeNode } from "../ipc";
import { useAppStore } from "../stores/appStore";
import { dirname, stripMdExt } from "../pathUtils";
import { LinkPopover } from "./LinkPopover";

interface TreeProps {
  nodes: TreeNode[];
  currentPath: string | null;
  onOpen: (path: string) => void;
  onRenameFile: (path: string, newName: string) => void;
  onDeleteFile: (path: string) => void;
}

type ContextMenuState = {
  path: string;
  name: string;
  isDir: boolean;
  x: number;
  y: number;
  confirmDelete: boolean;
};

/**
 * File browser as a single-column drill-down with a breadcrumb — Finder's
 * *column* view needs horizontal room a narrow sidebar doesn't have (deep
 * paths get cut off and you scroll the strip back and forth), so instead one
 * folder fills the full width at a time. `browserDir` (lifted into
 * appStore so Favourites.tsx can drive it too) is the folder currently shown
 * (root-relative, "" at the vault root). Clicking a folder drills in; the
 * breadcrumb jumps straight back to any ancestor in one click. Opening a file
 * from elsewhere (a link, search, the quick switcher) reveals it by snapping
 * `browserDir` to that file's own folder — the browser follows the open
 * document.
 */
export function Tree({ nodes, currentPath, onOpen, onRenameFile, onDeleteFile }: TreeProps) {
  const rootName = useAppStore((s) => s.rootName);
  const dir = useAppStore((s) => s.browserDir);
  const setDir = useAppStore((s) => s.setBrowserDir);
  const favourites = useAppStore((s) => s.favourites);
  const toggleFavourite = useAppStore((s) => s.toggleFavourite);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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

  // Reveal the open document: when a file is opened from anywhere, show the
  // folder that holds it. Manual folder browsing never changes currentPath,
  // so it isn't disturbed by this.
  useEffect(() => {
    if (currentPath) setDir(dirname(currentPath));
  }, [currentPath, setDir]);

  // If the shown folder disappears (deleted/renamed elsewhere), climb to the
  // nearest surviving ancestor rather than showing an empty void.
  useEffect(() => {
    let d = dir;
    while (d !== "" && !(nodeByPath.get(d)?.isDir)) d = dirname(d);
    if (d !== dir) setDir(d);
  }, [nodeByPath, dir, setDir]);

  const items = childrenOf.get(dir === "" ? null : dir) ?? [];

  const crumbs = useMemo(() => {
    const segments = dir ? dir.split("/") : [];
    const trail: { label: string; path: string }[] = [{ label: rootName ?? "Files", path: "" }];
    let acc = "";
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      trail.push({ label: seg, path: acc });
    }
    return trail;
  }, [dir, rootName]);

  const openMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    setMenu({
      path: node.path,
      name: stripMdExt(node.name),
      isDir: node.isDir,
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
      <div className="tree-crumbs">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={crumb.path} className="tree-crumb-group">
              {i > 0 && <span className="tree-crumb-sep">›</span>}
              <button
                className={`tree-crumb${isLast ? " current" : ""}`}
                onClick={() => setDir(crumb.path)}
                disabled={isLast}
              >
                {crumb.label}
              </button>
            </span>
          );
        })}
      </div>

      <div className="tree-list">
        {items.length === 0 ? (
          <p className="tree-empty">Empty folder</p>
        ) : (
          items.map((node) =>
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
                className={`tree-item tree-col-item${node.path === currentPath ? " selected" : ""}`}
                aria-current={node.path === currentPath}
                onClick={() => (node.isDir ? setDir(node.path) : onOpen(node.path))}
                onContextMenu={(e) => openMenu(e, node)}
              >
                {node.isDir ? (
                  <Folder size={12} strokeWidth={1.5} />
                ) : (
                  <FileText size={12} strokeWidth={1.5} />
                )}
                <span className="tree-col-item-label">{stripMdExt(node.name)}</span>
                {node.isDir && <ChevronRight size={12} strokeWidth={1.5} className="chevron" />}
              </button>
            ),
          )
        )}
      </div>

      {menu && !menu.confirmDelete && (
        <LinkPopover x={menu.x} y={menu.y} kind="tree-menu" onClose={() => setMenu(null)}>
          <p className="link-popover-label">{menu.name}</p>
          <button
            className="link-popover-item"
            onClick={() => {
              toggleFavourite(menu.path);
              setMenu(null);
            }}
          >
            {favourites.includes(menu.path) ? "Remove from Favourites" : "Add to Favourites"}
          </button>
          {!menu.isDir && (
            <>
              <button className="link-popover-item" onClick={startRename}>
                Rename
              </button>
              <button
                className="link-popover-item"
                onClick={() => setMenu((m) => (m ? { ...m, confirmDelete: true } : m))}
              >
                Move to Bin
              </button>
            </>
          )}
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
