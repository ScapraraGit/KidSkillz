import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Save the element that opened the modal so focus returns there on close.
  // Without this, keyboard users land back at <body> after closing.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Move focus into the dialog on open — first focusable element, or the dialog
    // container itself as a fallback so screen readers announce it.
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? dialogRef.current)?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Esc closes; Tab/Shift+Tab is constrained to focusable descendants so focus
  // can't escape the dialog into the page beneath.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-lg max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div className="p-5 overflow-y-auto min-h-0 flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-2 shrink-0 flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
