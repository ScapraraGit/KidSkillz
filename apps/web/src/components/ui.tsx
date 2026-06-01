import clsx from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode } from "react";
import { InfoButton } from "./InfoButton";
import { isNative, haptic } from "../lib/native";

// On native (touch only) all interactive elements get 44px min-target — iOS HIG
// and Android Material both call out 44pt/48dp. Web keeps compact sizing because
// pointer precision is higher and dense desktop UIs are the dominant use case.
const TOUCH_MIN = isNative() ? "min-h-[44px] min-w-[44px]" : "";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  info?: { title: string; body: ReactNode; tone?: "default" | "onDark" };
}

export function Card({ className, children, info, ...rest }: CardProps) {
  return (
    <div
      className={clsx("relative bg-white rounded-2xl shadow-soft border border-slate-200/60 p-5", className)}
      {...rest}
    >
      {info && (
        <div className="absolute top-2 right-2">
          <InfoButton title={info.title} body={info.body} tone={info.tone} placement="bottom" />
        </div>
      )}
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  // On native the contextual title bar (NativeHeader) already shows the screen
  // title, so a plain-string PageHeader title would be a duplicate — suppress it.
  // A ReactNode title (e.g. the child dashboard's avatar+greeting hero) is NOT a
  // duplicate and always renders. If nothing's left to show, render nothing.
  const hideTitle = isNative() && typeof title === "string";
  if (hideTitle && !subtitle && !right) return null;
  return (
    // Stack vertically on small screens so the action group below the title
    // gets full width — at sm+ it returns to the desktop side-by-side layout.
    <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {!hideTitle && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
        {subtitle && <p className={clsx("text-slate-500", !hideTitle && "mt-1")}>{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
}

export function Button({ variant = "primary", size = "md", className, onClick, ...rest }: ButtonProps) {
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (isNative()) void haptic("light");
    onClick?.(e);
  }
  return (
    <button
      onClick={handleClick}
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
        TOUCH_MIN,
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-4 py-2 text-sm",
        size === "lg" && "px-5 py-3 text-base",
        variant === "primary" && "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
        variant === "secondary" && "bg-white text-slate-800 hover:bg-slate-50 border border-slate-300",
        variant === "ghost" && "text-slate-700 hover:bg-slate-100",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        variant === "success" && "bg-emerald-600 text-white hover:bg-emerald-700",
        className,
      )}
      {...rest}
    />
  );
}

export function Avatar({ name, color, size = 40 }: { name: string; color?: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{ backgroundColor: color ?? "#6366f1", width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || "?"}
    </div>
  );
}

export function Badge({
  children,
  color = "slate",
}: {
  children: ReactNode;
  color?: "slate" | "brand" | "emerald" | "amber" | "rose";
}) {
  const cls = {
    slate: "bg-slate-100 text-slate-700",
    brand: "bg-brand-100 text-brand-800",
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
  }[color];
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cls)}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      {label && (
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>{label}</span>
          <span>
            {value} / {max}
          </span>
        </div>
      )}
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CreditChip({ amount }: { amount: number }) {
  const positive = amount >= 0;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold",
        positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
    >
      {positive ? "+" : ""}
      {amount} 🪙
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-10 text-slate-500">
      <div className="text-base font-medium text-slate-700">{title}</div>
      {hint && <div className="text-sm mt-1">{hint}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls = clsx(
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500",
  isNative() && "min-h-[44px] text-base",
);

// Pick the right software-keyboard layout. iOS/Android honor inputMode, so a
// number field shows a numeric pad instead of the full QWERTY. Use these as the
// `inputMode` prop on `<input>` for credit overrides, PINs, codes, etc.
export const inputModes = {
  numeric: "numeric" as const,
  decimal: "decimal" as const,
  tel: "tel" as const,
  email: "email" as const,
  search: "search" as const,
  url: "url" as const,
};

// Animated placeholder block for loading states. Matches the slate-200 shimmer
// convention used elsewhere; className lets callers set width + height.
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-lg bg-slate-200", className)} aria-hidden="true" />;
}

// Multi-line skeleton card for when you need a card-shaped loading state.
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      className={clsx("bg-white rounded-2xl shadow-soft border border-slate-200/60 p-5 space-y-3", className)}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={clsx("h-4", i === 0 ? "w-1/3" : i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
