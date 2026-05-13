import { useEffect, useState } from "react";
import { Card } from "./ui";
import { msUntilEndOfDay, formatHoursMinutes } from "../lib/timeOfDay";

interface Props {
  timezone: string;
  streakDays: number;
  openTasksToday: number;
  /** completionsToday includes APPROVED + PENDING (anything submitted). */
  completionsToday: number;
}

/**
 * Shows a countdown to family-local midnight when the streak is at risk:
 * streak active, tasks remain open today, and kid hasn't submitted any yet.
 */
export function StreakSaver({ timezone, streakDays, openTasksToday, completionsToday }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (streakDays <= 0 || openTasksToday <= 0 || completionsToday > 0) return null;

  const ms = msUntilEndOfDay(timezone, now);
  const urgent = ms < 3 * 3600_000;
  const tone = urgent ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200";

  return (
    <Card
      className={tone}
      info={{
        title: "Streak saver",
        body: "Your streak (consecutive days with at least one finished task) is still safe — but the clock is ticking. Finish one task before midnight in your family's timezone.",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">⏳</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Keep your {streakDays}-day streak!</div>
          <div className="text-sm text-slate-700">
            {formatHoursMinutes(ms)} left to finish one task today.
          </div>
        </div>
      </div>
    </Card>
  );
}
