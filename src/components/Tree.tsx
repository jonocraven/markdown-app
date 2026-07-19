import { useEffect, useMemo, useRef, useState } from "react";
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

// Long-press-to-context-menu (PLAN-ANDROID.md §3 "Touch specifics"): a
// ~500ms hold on a row opens the SAME menu right-click opens on desktop,
// via onPointerDown/Move/Up/Cancel below — cancelled if the finger travels
// more than this many px (a scroll, not a press-and-hold) or lifts before
// the threshold (an ordinary tap). Gated on pointerType === "touch" so it
// never fires for a mouse (which already has onContextMenu) or a coarse-but-
// mouse-driven device.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_THRESHOLD_PX = 10;

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

  // Long-press state (see LONG_PRESS_MS above). Refs, not state: nothing
  // needs to re-render while a press is building up.
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

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

  const openMenuAt = (x: number, y: number, node: TreeNode) => {
    setMenu({
      path: node.path,
      name: stripMdExt(node.name),
      isDir: node.isDir,
      x,
      y,
      confirmDelete: false,
    });
  };

  const openMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY, node);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleRowPointerDown = (e: React.PointerEvent, node: TreeNode) => {
    if (e.pointerType !== "touch") return; // mouse/pen already have onContextMenu
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      const start = pointerStartRef.current;
      openMenuAt(start?.x ?? e.clientX, start?.y ?? e.clientY, node);
    }, LONG_PRESS_MS);
  };

  const handleRowPointerMove = (e: React.PointerEvent) => {
    const start = pointerStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD_PX) clearLongPressTimer();
  };

  const handleRowPointerEnd = () => {
    clearLongPressTimer();
    pointerStartRef.current = null;
  };

  /** The row's tap/navigate action — suppressed for the tap that follows a
   * long-press-opened menu (the pointerup/click that ends the same touch
   * gesture the timer fired during), so long-press never ALSO navigates. */
  const handleRowActivate = (node: TreeNode) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (node.isDir) setDir(node.path);
    else onOpen(node.path);
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
                onClick={() => handleRowActivate(node)}
                onContextMenu={(e) => openMenu(e, node)}
                onPointerDown={(e) => handleRowPointerDown(e, node)}
                onPointerMove={handleRowPointerMove}
                onPointerUp={handleRowPointerEnd}
                onPointerCancel={handleRowPointerEnd}
                onPointerLeave={handleRowPointerEnd}
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

      {/* This context menu (opened by right-click on desktop, long-press on
          touch — see handleRowPointerDown above) is deliberately NOT wired
          through useHistoryBridge's pushOverlay/popOverlay. historyBridge.ts
          documents the tracked "overlay" set as drawer / TOC sheet / search /
          quick switcher / overflow menu — the mobile takeovers App.tsx
          renders conditionally on isMobile. LinkPopover (this component, and
          the wikilink disambiguate/create popovers in App.tsx) already
          dismisses itself on outside click/Escape on desktop without ever
          touching history, and long-press doesn't change that: it's a
          popover anchored to a point, not a mobile-shell takeover, so a
          hardware back press should just fall through to whatever this
          module's popstate handler would otherwise do (walk nav history),
          same as it does today when a disambiguate popover happens to be
          open. Matching that existing pattern here is the point. */}
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
