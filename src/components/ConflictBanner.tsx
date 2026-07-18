interface ConflictBannerProps {
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  onShowBoth: () => void;
}

/**
 * Non-modal conflict banner (PLAN.md §4/§8): shown when a write rejects
 * because the file changed on disk since it was last read (Drive sync,
 * another editor, or the browser-mode __markdownReaderSimulateExternalEdit
 * hook).
 * House Monochrome style — mono label, hairline ink border, paper3 fill, no
 * colour. The editor (or reader) underneath stays fully usable; this is a
 * strip, not an overlay.
 */
export function ConflictBanner({ onKeepMine, onTakeTheirs, onShowBoth }: ConflictBannerProps) {
  return (
    <div className="conflict-banner" role="alert" data-testid="conflict-banner">
      <p className="conflict-banner-label">File changed on disk</p>
      <p className="conflict-banner-text">
        Someone else — Drive sync, another editor, or another app window — changed this file while
        you were working on it. Nothing you've done here has been lost.
      </p>
      <div className="conflict-banner-actions">
        <button className="conflict-banner-button" onClick={onKeepMine}>
          Keep mine
        </button>
        <button className="conflict-banner-button" onClick={onTakeTheirs}>
          Take theirs
        </button>
        <button className="conflict-banner-button" onClick={onShowBoth}>
          Show both
        </button>
      </div>
    </div>
  );
}
