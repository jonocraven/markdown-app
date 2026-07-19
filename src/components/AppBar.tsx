import { PanelLeft, Search, Command, Pencil, MoreVertical } from "lucide-react";

interface AppBarProps {
  /** File stem (extensionless basename), Jost light — null when nothing's
   * open (empty-state root). */
  title: string | null;
  /** Root-relative path shown in small mono caps beneath the title. */
  path: string | null;
  editing: boolean;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onOpenQuickSwitcher: () => void;
  onToggleEditing: () => void;
  onOpenOverflow: () => void;
}

/**
 * Mobile app bar (PLAN-ANDROID.md §3): replaces the desktop three-pane
 * shell's tree pane / footer chrome / native menu bar with a single top bar
 * — drawer button, centred title+path, and actions (search, quick open,
 * edit toggle, overflow). Every action here calls the SAME App.tsx handlers
 * the desktop menu/shortcuts use (zoomIn/zoomOut/handleToggleEditing/etc) —
 * this component only supplies the touch surface.
 *
 * While editing, the pencil/eye icon is replaced by a mono-caps "Done" text
 * button (§3 "Editor") — but it's wired to the SAME onToggleEditing prop the
 * eye icon used, i.e. App.tsx's handleToggleEditing, which already (a)
 * flushes any dirty draft through performSave (the exact function ⌘S's
 * handleSaveNow calls too — no new write path) and (b) turns editing off.
 * There's no separate "Done" handler in App.tsx; this is a presentation-only
 * change.
 */
export function AppBar({
  title,
  path,
  editing,
  onOpenDrawer,
  onOpenSearch,
  onOpenQuickSwitcher,
  onToggleEditing,
  onOpenOverflow,
}: AppBarProps) {
  return (
    <header className="app-bar">
      <button className="app-bar-btn" onClick={onOpenDrawer} aria-label="Open file tree">
        <PanelLeft size={19} strokeWidth={1.5} />
      </button>

      <div className="app-bar-title-block">
        <p className="app-bar-title">{title ?? "Markdown Reader"}</p>
        {path && <p className="app-bar-subtitle">{path}</p>}
      </div>

      <div className="app-bar-actions">
        <button className="app-bar-btn" onClick={onOpenSearch} aria-label="Search">
          <Search size={18} strokeWidth={1.5} />
        </button>
        <button className="app-bar-btn" onClick={onOpenQuickSwitcher} aria-label="Quick open">
          <Command size={18} strokeWidth={1.5} />
        </button>
        {path && editing && (
          <button className="app-bar-btn app-bar-done" onClick={onToggleEditing} aria-label="Done">
            Done
          </button>
        )}
        {path && !editing && (
          <button className="app-bar-btn" onClick={onToggleEditing} aria-label="Edit">
            <Pencil size={18} strokeWidth={1.5} />
          </button>
        )}
        <button className="app-bar-btn" onClick={onOpenOverflow} aria-label="More">
          <MoreVertical size={19} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
