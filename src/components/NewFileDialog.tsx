/**
 * ⌘N / menu "New File" dialog. Small centred house-style overlay (same
 * family as QuickSwitcher: paper ground, hairline border, mono input
 * ≥16px), asking for a name and showing which folder it will land in
 * (the current file's folder, or the root if nothing is open).
 */
import { useEffect, useRef, useState } from "react";

interface NewFileDialogProps {
  open: boolean;
  /** Root-relative folder the new file will be created in, "" for the root. */
  folder: string;
  /** Set by the caller when a create attempt fails (e.g. name collision). */
  error?: string | null;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function NewFileDialog({ open, folder, error, onClose, onCreate }: NewFileDialogProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  const destination = folder ? `${folder}/` : "the root";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = name.trim();
      if (trimmed) onCreate(trimmed);
    }
  };

  return (
    <>
      <div className="quick-switcher-backdrop" onClick={onClose} />
      <div className="new-file-dialog" role="dialog" aria-label="New file">
        <p className="link-popover-label">New file</p>
        <input
          ref={inputRef}
          type="text"
          placeholder="File name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="new-file-input"
        />
        <p className="new-file-destination">Will be created in {destination}</p>
        {error && <p className="new-file-error">{error}</p>}
        <div className="link-popover-actions">
          <button
            className="link-popover-button"
            onClick={() => {
              const trimmed = name.trim();
              if (trimmed) onCreate(trimmed);
            }}
          >
            Create
          </button>
          <button className="link-popover-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
