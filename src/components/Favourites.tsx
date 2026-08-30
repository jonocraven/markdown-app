import { useMemo } from "react";
import { FileText, Folder } from "lucide-react";
import type { TreeNode } from "../ipc";
import { useAppStore } from "../stores/appStore";
import { stripMdExt } from "../pathUtils";
import { classifyTreeNode } from "../fileClassification";

interface FavouritesProps {
  nodes: TreeNode[];
  currentPath: string | null;
  onOpenFile: (path: string) => void;
  onOpenExternal: (path: string) => void;
}

/** Pinned files and folders (Tree.tsx's context menu — "Add to Favourites"),
 * shown above the file browser so frequently-used notes and folders don't
 * need re-navigating to every time. A pinned file opens it directly; a
 * pinned folder jumps the browser below straight to it via the shared
 * `browserDir` store field. Hidden entirely once there are no favourites,
 * rather than showing an empty section. */
export function Favourites({ nodes, currentPath, onOpenFile, onOpenExternal }: FavouritesProps) {
  const favourites = useAppStore((s) => s.favourites);
  const browserDir = useAppStore((s) => s.browserDir);
  const setBrowserDir = useAppStore((s) => s.setBrowserDir);
  const toggleFavourite = useAppStore((s) => s.toggleFavourite);

  const nodeByPath = useMemo(() => new Map(nodes.map((n) => [n.path, n])), [nodes]);
  const items = useMemo(
    () =>
      favourites
        .map((path) => nodeByPath.get(path))
        .filter((n): n is TreeNode => n !== undefined),
    [favourites, nodeByPath],
  );

  if (items.length === 0) return null;

  return (
    <div className="favourites-section">
      <p className="chrome-label">Favourites</p>
      <div className="favourites-list">
        {items.map((node) => {
          const isSelected = node.isDir ? node.path === browserDir : node.path === currentPath;
          const isExternal = classifyTreeNode(node) === "external";
          const label = isExternal ? node.name : stripMdExt(node.name);
          const className = `tree-item tree-col-item favourite-item${isSelected ? " selected" : ""}${
            isExternal ? " external-file" : ""
          }`;
          return (
            <div className="favourite-row" key={node.path}>
              {isExternal ? (
                <button
                  className={className}
                  aria-label={`${node.name} (opens with the default application)`}
                  onClick={() => onOpenExternal(node.path)}
                >
                  <FileText size={12} strokeWidth={1.5} />
                  <span className="tree-col-item-label">{label}</span>
                </button>
              ) : (
                <button
                  className={className}
                  onClick={() => (node.isDir ? setBrowserDir(node.path) : onOpenFile(node.path))}
                >
                  {node.isDir ? (
                    <Folder size={12} strokeWidth={1.5} />
                  ) : (
                    <FileText size={12} strokeWidth={1.5} />
                  )}
                  <span className="tree-col-item-label">{label}</span>
                </button>
              )}
              <button
                className="favourite-unpin"
                onClick={() => toggleFavourite(node.path)}
                aria-label={`Remove ${stripMdExt(node.name)} from favourites`}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
