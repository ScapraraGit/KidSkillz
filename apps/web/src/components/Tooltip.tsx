import * as RT from "@radix-ui/react-tooltip";
import clsx from "clsx";
import type { ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RT.Provider delayDuration={250} skipDelayDuration={100}>
      {children}
    </RT.Provider>
  );
}

interface TooltipProps {
  label: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  children: ReactNode;
  disabled?: boolean;
  asChild?: boolean;
}

export function Tooltip({
  label,
  side = "top",
  align = "center",
  children,
  disabled,
  asChild = true,
}: TooltipProps) {
  if (disabled || !label) return <>{children}</>;
  return (
    <RT.Root>
      <RT.Trigger asChild={asChild}>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          align={align}
          sideOffset={6}
          className={clsx(
            "z-[60] max-w-xs rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg",
            "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
          )}
        >
          {label}
          <RT.Arrow className="fill-slate-900" />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
