import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface OverflowMenuProps {
  onClose: () => void;
  children: ReactNode;
}

/**
 * Mobile app bar's ⋮ menu (PLAN-ANDROID.md §3): Contents / Zoom In / Zoom
 * Out / Actual Size / New File, standing in for the desktop native menu bar
 * (which is #[cfg(desktop)]-gated and doesn't exist on Android). Same
 * dismiss-on-outside-click/Escape pattern as LinkPopover, in the same house
 * style, anchored under the app bar's overflow button.
 */
export function OverflowMenu({ onClose, children }: OverflowMenuProps) {
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

  return (
    <div ref={ref} className="overflow-menu" data-testid="overflow-menu">
      {children}
    </div>
  );
}
