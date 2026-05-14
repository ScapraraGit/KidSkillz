import { useEffect } from "react";
import { Button } from "./ui";
import { formatMmSs, type ActiveTimer } from "../lib/activeTimer";

interface Props {
  timer: ActiveTimer;
  timeLeft: number;
  expired: boolean;
  onCancel: () => void;
  onMinimize: () => void;
}

export function FullscreenTimer({ timer, timeLeft, expired, onCancel, onMinimize }: Props) {
  const pct = expired
    ? 100
    : Math.min(100, Math.round(((timer.durationMs - timeLeft) / timer.durationMs) * 100));

  const bg = expired
    ? "from-emerald-400 to-emerald-600"
    : timeLeft < 60_000
      ? "from-amber-400 to-rose-500"
      : "from-brand-400 to-brand-600";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onMinimize();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onMinimize]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Focus timer"
      className={`fixed inset-0 z-50 bg-gradient-to-br ${bg} text-white flex flex-col`}
    >
      <div className="flex justify-between items-center p-4 sm:p-6">
        <div className="text-sm sm:text-base font-medium opacity-90 truncate pr-3">
          Working on: <span className="font-bold">{timer.taskTitle}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onMinimize} className="!text-white hover:!bg-white/20">
          ⤓ Minimize
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div
          className="font-bold tabular-nums leading-none text-center drop-shadow-lg"
          style={{ fontSize: "clamp(6rem, 28vw, 24rem)" }}
        >
          {expired ? "🏁" : formatMmSs(timeLeft)}
        </div>
        <div className="mt-8 w-full max-w-2xl">
          <div className="h-4 sm:h-6 rounded-full bg-white/25 overflow-hidden">
            <div className="h-full bg-white/90 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 text-center text-lg sm:text-2xl font-medium opacity-95">
            {expired ? "Time's up — finish strong!" : "You got this. Stay focused!"}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 flex justify-center gap-3">
        <Button
          variant="ghost"
          size="lg"
          onClick={onCancel}
          className="!text-white !bg-white/15 hover:!bg-white/25 !border-white/30"
        >
          {expired ? "Dismiss" : "Cancel timer"}
        </Button>
      </div>
    </div>
  );
}
