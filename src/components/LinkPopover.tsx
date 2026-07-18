import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface LinkPopoverProps {
  x: number;
  y: number;
  /** Only used for the data-popover-kind test hook; styling is identical
   * for every kind. "disambiguate"/"create" are the wikilink-routing
   * popovers (PLAN.md §5); "tree-menu"/"tree-delete-confirm" are the file
   * tree's right-click context menu (PLAN.md §4/§7 Phase 6). */
  kind: "disambiguate" | "create" | "tree-menu" | "tree-delete-confirm";
  onClose: () => void;
  children: ReactNode;
}

/** Small popover in the house Monochrome style: mono type, hairline border,
 * paper2 fill. Used for wikilink disambiguation and the broken-wikilink
 * create-file offer (PLAN.md §5). Dismisses on outside click or Escape. */
export function LinkPopover({ x, y, kind, onClose, children }: LinkPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // Keep the popover on-screen even if the click was near the right edge.
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 300),
    top: y,
  };

  return (
    <div
      ref={ref}
      className="link-popover"
      data-testid="link-popover"
      data-popover-kind={kind}
      style={style}
    >
      {children}
    </div>
  );
}
