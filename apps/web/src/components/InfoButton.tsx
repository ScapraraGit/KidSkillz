import { useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Popover, type PopoverPlacement } from "./Popover";

interface InfoButtonProps {
  title: string;
  body: ReactNode;
  placement?: PopoverPlacement;
  className?: string;
  tone?: "default" | "onDark";
}

export function InfoButton({
  title,
  body,
  placement = "bottom",
  className,
  tone = "default",
}: InfoButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={`What is ${title}?`}
        className={clsx(
          "inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-400",
          tone === "onDark"
            ? "bg-white/20 text-white hover:bg-white/30"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700",
          className,
        )}
      >
        i
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref.current} placement={placement}>
        <div className="font-semibold text-slate-900 mb-1">{title}</div>
        <div className="text-sm text-slate-600">{body}</div>
      </Popover>
    </>
  );
}
