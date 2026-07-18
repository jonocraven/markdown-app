import { PanelLeft, Search, Command, Pencil, Eye, MoreVertical } from "lucide-react";

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
        {path && (
          <button
            className={`app-bar-btn${editing ? " active" : ""}`}
            onClick={onToggleEditing}
            aria-label={editing ? "Back to reading" : "Edit"}
          >
            {editing ? <Eye size={18} strokeWidth={1.5} /> : <Pencil size={18} strokeWidth={1.5} />}
          </button>
        )}
        <button className="app-bar-btn" onClick={onOpenOverflow} aria-label="More">
          <MoreVertical size={19} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
