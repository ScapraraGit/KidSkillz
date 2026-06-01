import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";
import { isNative } from "../lib/native";

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
  // Native shell renders as a bottom sheet: pinned to the bottom, full-width,
  // slide-up entry animation, drag-handle affordance, and respects the device
  // home-indicator safe area. Web keeps the centered-dialog layout.
  const native = isNative();
  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 flex bg-slate-900/40",
        native ? "items-end justify-center" : "items-center justify-center px-4",
      )}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={clsx(
          "flex flex-col bg-white shadow-2xl border border-slate-200 focus:outline-none",
          native
            ? "w-full max-h-[92vh] rounded-t-2xl pb-safe animate-sheet-up"
            : "w-full max-w-lg max-h-[92vh] rounded-2xl",
        )}
      >
        {native && (
          <div className="pt-2 pb-1 flex justify-center shrink-0" aria-hidden="true">
            <span className="block h-1.5 w-10 rounded-full bg-slate-300" />
          </div>
        )}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div className="p-5 overflow-y-auto min-h-0 flex-1">{children}</div>
        {footer && (
          <div
            className={clsx(
              "px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0 flex-wrap",
              native ? "" : "rounded-b-2xl",
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
