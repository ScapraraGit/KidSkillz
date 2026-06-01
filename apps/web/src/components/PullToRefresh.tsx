import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import { usePullToRefresh, PULL_THRESHOLD, MAX_PULL } from "../hooks/usePullToRefresh";
import { isNative } from "../lib/native";

// Native-only pull-to-refresh wrapper. On web this is a transparent passthrough.
// Usage:
//   const refresh = async () => { await qc.invalidateQueries(...) };
//   <PullToRefresh onRefresh={refresh}><PageContent /></PullToRefresh>
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const { refreshing, pullDistance } = usePullToRefresh(onRefresh);

  if (!isNative()) return <>{children}</>;

  const indicatorVisible = refreshing || pullDistance > 8;
  // Progress 0→1 as pull approaches threshold; clamp at 1
  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const indicatorY = refreshing ? 0 : pullDistance - MAX_PULL * 0.5;

  return (
    <div className="relative">
      {/* Pull indicator — floats above content, slides in as user pulls */}
      <div
        className={clsx(
          "absolute inset-x-0 flex justify-center z-10 pointer-events-none transition-opacity duration-150",
          indicatorVisible ? "opacity-100" : "opacity-0",
        )}
        // runtime-computed pull distance — cannot be a static CSS class
        // eslint-disable-next-line react/forbid-dom-props
        style={{ top: Math.max(-32, indicatorY) }}
        aria-hidden="true"
      >
        <div className="bg-white rounded-full w-8 h-8 shadow-md border border-slate-200 flex items-center justify-center">
          {refreshing ? (
            <SpinnerIcon className="w-4 h-4 text-brand-600 animate-spin" />
          ) : (
            <ArrowIcon
              className="w-4 h-4 text-brand-600 transition-transform duration-100"
              // runtime progress value — cannot be a static CSS class
              // eslint-disable-next-line react/forbid-dom-props
              style={{ transform: `rotate(${Math.round(progress * 180)}deg)`, opacity: progress }}
            />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function ArrowIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  );
}
