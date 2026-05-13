import { Card, Button } from "./ui";
import { formatMmSs, type ActiveTimer } from "../lib/activeTimer";

interface Props {
  timer: ActiveTimer;
  timeLeft: number;
  expired: boolean;
  onCancel: () => void;
}

export function ActiveTimerCard({ timer, timeLeft, expired, onCancel }: Props) {
  const pct = expired ? 100 : Math.min(100, Math.round(((timer.durationMs - timeLeft) / timer.durationMs) * 100));
  const tone = expired ? "bg-emerald-50 border-emerald-200" : timeLeft < 60_000 ? "bg-amber-50 border-amber-200" : "bg-brand-50 border-brand-200";

  return (
    <Card
      className={tone}
      info={{
        title: "Focus timer",
        body: "Work on the task while the clock runs. Beat the timer for bragging rights — no penalty if you don't.",
      }}
    >
      <div className="flex items-center gap-4">
        <div className="text-5xl font-bold tabular-nums shrink-0">
          {expired ? "🏁" : formatMmSs(timeLeft)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-500">{expired ? "Time's up — finish strong!" : "Working on"}</div>
          <div className="font-semibold truncate">{timer.taskTitle}</div>
          <div className="mt-2 h-2 rounded-full bg-white/60 overflow-hidden">
            <div
              className={"h-full transition-all duration-500 " + (expired ? "bg-emerald-500" : "bg-brand-500")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {expired ? "Dismiss" : "Cancel"}
        </Button>
      </div>
    </Card>
  );
}
