import { Card, ProgressBar, Badge } from "./ui";
import { Tooltip } from "./Tooltip";
import type { ChallengeDTO, ChallengeProgressDTO } from "@chorechamps/shared";

interface Row {
  challenge: ChallengeDTO;
  progress: ChallengeProgressDTO | null;
}

interface Props {
  rows: Row[];
  /** YOUNGER = bigger icons, OLDER = numeric/dense. */
  variant: "YOUNGER" | "OLDER";
}

const KIND_ICON: Record<string, string> = {
  COMPLETE_N_TASKS: "✅",
  EARN_N_CREDITS: "🪙",
  INITIATIVE_N_TIMES: "🌟",
  NO_MISSES: "🎯",
  EARLY_BIRD: "🌅",
};

export function ChallengeSection({ rows, variant }: Props) {
  if (rows.length === 0) return null;
  const today = rows.filter((r) => r.challenge.window === "DAY");
  const week = rows.filter((r) => r.challenge.window === "WEEK");

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {today.length > 0 && (
        <Card
          info={{
            title: "Today's missions",
            body: "Fresh goals that reset every day in your family's timezone. Hit the target before midnight to earn the bonus.",
          }}
        >
          <h3 className="font-semibold mb-3">🎯 Today's missions</h3>
          <ul className="space-y-3">
            {today.map((r) => <ChallengeRow key={r.challenge.id} row={r} variant={variant} />)}
          </ul>
        </Card>
      )}
      {week.length > 0 && (
        <Card
          info={{
            title: "This week's missions",
            body: "Longer goals that reset every Monday (ISO week). Bonus credits posted as soon as you hit the target.",
          }}
        >
          <h3 className="font-semibold mb-3">🗓️ This week's missions</h3>
          <ul className="space-y-3">
            {week.map((r) => <ChallengeRow key={r.challenge.id} row={r} variant={variant} />)}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ChallengeRow({ row, variant }: { row: Row; variant: "YOUNGER" | "OLDER" }) {
  const { challenge: ch, progress } = row;
  const value = progress?.value ?? 0;
  const done = !!progress?.completedAt;
  const icon = KIND_ICON[ch.kind] ?? "⭐";

  return (
    <Tooltip label={done ? "Done! Bonus credits already in your balance." : `Earn ${ch.rewardCredits} credits when you reach ${ch.target}.`}>
      <li className="flex items-center gap-3">
        <span className={"text-2xl shrink-0 " + (done ? "opacity-100" : "opacity-90")}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate">{ch.title}</span>
            {done ? (
              <Badge color="emerald">✓ Done</Badge>
            ) : (
              <span className="text-xs text-slate-500 shrink-0">
                {variant === "YOUNGER" ? `${value}/${ch.target}` : `${value}/${ch.target} · +${ch.rewardCredits}🪙`}
              </span>
            )}
          </div>
          <div className="mt-1">
            <ProgressBar value={Math.min(value, ch.target)} max={ch.target} />
          </div>
        </div>
      </li>
    </Tooltip>
  );
}
