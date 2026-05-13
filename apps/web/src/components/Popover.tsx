import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type PopoverPlacement = "bottom" | "top" | "right" | "left";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: Element | null;
  placement?: PopoverPlacement;
  closeOnOutside?: boolean;
  className?: string;
  children: ReactNode;
}

export function Popover({
  open,
  onClose,
  anchor,
  placement = "bottom",
  closeOnOutside = true,
  className,
  children,
}: PopoverProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const update = () => setRect(toRect(anchor.getBoundingClientRect()));
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (!closeOnOutside) return;
      if (cardRef.current?.contains(e.target as Node)) return;
      if (anchor && anchor.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose, closeOnOutside, anchor]);

  if (!open || !rect) return null;

  const style = positionFor(rect, placement);

  return (
    <div
      ref={cardRef}
      role="dialog"
      style={style}
      className={clsx(
        "fixed z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-4 max-w-xs text-sm text-slate-700",
        className,
      )}
    >
      {children}
    </div>
  );
}

function toRect(d: DOMRect): Rect {
  return { top: d.top, left: d.left, right: d.right, bottom: d.bottom, width: d.width, height: d.height };
}

function positionFor(rect: Rect, placement: PopoverPlacement): React.CSSProperties {
  const gap = 8;
  const vw = window.innerWidth;
  const margin = 8;
  switch (placement) {
    case "top":
      return {
        left: clamp(rect.left, margin, vw - 320 - margin),
        bottom: window.innerHeight - rect.top + gap,
      };
    case "right":
      return { left: rect.right + gap, top: rect.top };
    case "left":
      return { right: vw - rect.left + gap, top: rect.top };
    case "bottom":
    default:
      return { left: clamp(rect.left, margin, vw - 320 - margin), top: rect.bottom + gap };
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
