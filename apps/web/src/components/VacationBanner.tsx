import { Card } from "./ui";

interface Props {
  endsAt?: string | null;
  note?: string | null;
}

export function VacationBanner({ endsAt, note }: Props) {
  const ends = endsAt ? new Date(endsAt) : null;
  return (
    <Card className="bg-sky-50 border-sky-200">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🏖️</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sky-900">Vacation mode is on</div>
          <div className="text-sm text-sky-800">
            {note ? `${note} · ` : ""}
            Streaks are frozen and tasks are off the clock
            {ends ? ` until ${ends.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}.
          </div>
        </div>
      </div>
    </Card>
  );
}
