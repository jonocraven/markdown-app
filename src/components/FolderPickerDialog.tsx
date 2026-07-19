/**
 * Android-only replacement for the native folder-picker dialog (its SAF
 * picker returns content:// URIs the std::fs-based Rust core can't use —
 * see PLAN-ANDROID.md §2). Same house style as NewFileDialog (backdrop +
 * centred panel), browsing with Tree.tsx's own breadcrumb/list classes
 * starting at /storage/emulated/0.
 */
import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import { ipc, type DirEntry } from "../ipc";

const STORAGE_ROOT = "/storage/emulated/0";

interface FolderPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onChoose: (path: string) => void;
}

export function FolderPickerDialog({ open, onClose, onChoose }: FolderPickerDialogProps) {
  const [dir, setDir] = useState(STORAGE_ROOT);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setDir(STORAGE_ROOT);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    ipc
      .listDirs(dir)
      .then((list) => {
        if (!cancelled) {
          setEntries(list);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setEntries([]);
          setError(
            e && typeof e === "object" && "message" in e
              ? String((e as { message: unknown }).message)
              : "Could not read this folder.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, dir]);

  if (!open) return null;

  const crumbs = (() => {
    const rel = dir.startsWith(STORAGE_ROOT) ? dir.slice(STORAGE_ROOT.length) : dir;
    const segments = rel.split("/").filter(Boolean);
    const trail: { label: string; path: string }[] = [{ label: "Internal storage", path: STORAGE_ROOT }];
    let acc = STORAGE_ROOT;
    for (const seg of segments) {
      acc = `${acc}/${seg}`;
      trail.push({ label: seg, path: acc });
    }
    return trail;
  })();

  return (
    <>
      <div className="quick-switcher-backdrop" onClick={onClose} />
      <div className="new-file-dialog folder-picker-dialog" role="dialog" aria-label="Choose folder">
        <p className="link-popover-label">Choose folder</p>

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

        <div className="tree-list folder-picker-list">
          {error ? (
            <p className="new-file-error">{error}</p>
          ) : entries.length === 0 ? (
            <p className="tree-empty">Empty folder</p>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.path}
                className="tree-item tree-col-item"
                onClick={() => setDir(entry.path)}
              >
                <Folder size={12} strokeWidth={1.5} />
                <span className="tree-col-item-label">{entry.name}</span>
              </button>
            ))
          )}
        </div>

        <div className="link-popover-actions">
          <button className="link-popover-button" onClick={() => onChoose(dir)}>
            Choose this folder
          </button>
          <button className="link-popover-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
