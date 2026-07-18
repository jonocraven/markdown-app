/**
 * Android-only in-app folder browser (PLAN-ANDROID.md §2/§6): replaces the
 * native folder-pick dialog, which returns SAF `content://` URIs on Android
 * that the Rust core can't use (it operates on real `std::fs` paths — see
 * PLAN-ANDROID.md §2). A full-pane single-column drill-down in the house
 * style, reusing Tree.tsx's breadcrumb/list classes and visual language.
 * Starts at ANDROID_ROOT (`/storage/emulated/0`, the root of Android's All
 * Files Access grant) and lists real subdirectories via the new list_dirs
 * command (src/vault.ts's listDirs) — used BEFORE a root exists, so there's
 * no vault tree to browse yet.
 *
 * First-run only: shows an explainer panel about why All Files Access is
 * needed, persisted via src/persist.ts (ANDROID_EXPLAINER_SEEN_KEY) so it
 * appears once per install, in this same surface rather than a separate
 * screen. Non-Android callers never mount this component at all (see
 * App.tsx's isAndroid() branch in pickRoot), so nothing here runs on
 * desktop.
 */
import { useEffect, useState } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { vault, ANDROID_ROOT, type DirEntry } from "../vault";
import { persistGet, persistSet } from "../persist";

const ANDROID_EXPLAINER_SEEN_KEY = "markdownReader.androidExplainerSeen";

/**
 * Deep-links to Android's system "All files access" settings screen for
 * this app, via the opener plugin's openUrl (already a dependency —
 * @tauri-apps/plugin-opener). This is the
 * android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION intent action. The
 * exact intent URI syntax is unverified — this container has no Android
 * manifest/Kotlin to test it against — and may need adjusting once this
 * runs on a real device (PLAN-ANDROID.md §2/§6).
 */
const ALL_FILES_ACCESS_SETTINGS_INTENT =
  "intent://#Intent;action=android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION;end";

interface FolderBrowserProps {
  onChoose: (root: { path: string; name: string }) => void;
  onClose: () => void;
}

export function FolderBrowser({ onChoose, onClose }: FolderBrowserProps) {
  const [dir, setDir] = useState(ANDROID_ROOT);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // null = not yet decided (waiting on the persisted flag); true = show the
  // explainer; false = show the drill-down.
  const [showExplainer, setShowExplainer] = useState<boolean | null>(null);

  useEffect(() => {
    persistGet(ANDROID_EXPLAINER_SEEN_KEY, false).then((seen) => setShowExplainer(!seen));
  }, []);

  useEffect(() => {
    if (showExplainer !== false) return;
    let cancelled = false;
    setLoading(true);
    vault.listDirs(dir).then((list) => {
      if (cancelled) return;
      setEntries(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dir, showExplainer]);

  const dismissExplainer = () => {
    persistSet(ANDROID_EXPLAINER_SEEN_KEY, true);
    setShowExplainer(false);
  };

  const openSettings = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(ALL_FILES_ACCESS_SETTINGS_INTENT);
    } catch (err) {
      console.error("[markdown-reader] failed to open All Files Access settings:", err);
    }
  };

  const crumbs = (() => {
    const rel = dir.startsWith(ANDROID_ROOT) ? dir.slice(ANDROID_ROOT.length) : dir;
    const segments = rel.split("/").filter(Boolean);
    const trail: { label: string; path: string }[] = [{ label: "Storage", path: ANDROID_ROOT }];
    let acc = ANDROID_ROOT;
    for (const seg of segments) {
      acc = `${acc}/${seg}`;
      trail.push({ label: seg, path: acc });
    }
    return trail;
  })();

  const useThisFolder = async () => {
    const root = await vault.setRoot(dir);
    onChoose(root);
  };

  return (
    <div className="folder-browser-overlay" data-testid="folder-browser">
      <div className="folder-browser-panel">
        {showExplainer === null ? null : showExplainer ? (
          <div className="folder-browser-explainer" data-testid="folder-browser-explainer">
            <p className="link-popover-label">All files access</p>
            <p className="folder-browser-explainer-text">
              Markdown Reader needs All Files Access so it can read and write your notes
              at their real location on the device — the same plain folder of .md files
              it uses on desktop. Nothing leaves the device.
            </p>
            <div className="link-popover-actions">
              <button className="link-popover-button" onClick={openSettings}>
                Open settings
              </button>
              <button className="link-popover-button" onClick={dismissExplainer}>
                Continue
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="folder-browser-header">
              <p className="chrome-label" style={{ margin: 0 }}>
                Choose a folder
              </p>
              <button className="link-popover-button" onClick={onClose}>
                Cancel
              </button>
            </div>

            <div className="tree-crumbs folder-browser-crumbs">
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

            <div className="tree-list folder-browser-list">
              {loading ? (
                <p className="tree-empty">Loading…</p>
              ) : entries.length === 0 ? (
                <p className="tree-empty">No folders here</p>
              ) : (
                entries.map((entry) => (
                  <button
                    key={entry.path}
                    className="tree-item tree-col-item"
                    onClick={() => setDir(entry.path)}
                  >
                    <Folder size={12} strokeWidth={1.5} />
                    <span className="tree-col-item-label">{entry.name}</span>
                    <ChevronRight size={12} strokeWidth={1.5} className="chevron" />
                  </button>
                ))
              )}
            </div>

            <div className="folder-browser-actions">
              <button className="save-button folder-browser-use" onClick={useThisFolder}>
                <FolderOpen size={13} strokeWidth={1.5} style={{ verticalAlign: -2 }} /> Use this folder
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
