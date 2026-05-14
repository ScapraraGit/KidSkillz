import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, ProgressBar } from "./ui";
import type { RewardDTO } from "@chorechampz/shared";

interface Props {
  rewardId: string;
  balance: number;
  weekEarned: number;
}

export function SavingsGoal({ rewardId, balance, weekEarned }: Props) {
  const rewardsQ = useQuery({
    queryKey: ["rewards"],
    queryFn: () => api<{ rewards: RewardDTO[] }>("/rewards"),
    staleTime: 60_000,
  });
  const reward = rewardsQ.data?.rewards.find((r) => r.id === rewardId);
  if (!reward) return null;

  const remaining = Math.max(0, reward.creditCost - balance);
  const weeks = weekEarned > 0 ? remaining / weekEarned : Infinity;
  const eta =
    remaining === 0
      ? "You can redeem now!"
      : weeks === Infinity
        ? "Earn some credits this week to see ETA"
        : weeks <= 1
          ? "About 1 week away at this pace"
          : `About ${Math.ceil(weeks)} weeks away at this pace`;

  return (
    <Card
      info={{
        title: "Savings goal",
        body: "Pin a reward as your goal from the Rewards page. ETA estimates from this week's earnings.",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">⭐</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-500">Saving for</div>
          <div className="font-semibold">{reward.name}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold">
            {balance}/{reward.creditCost}
          </div>
          <div className="text-xs text-slate-500">credits</div>
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar value={Math.min(balance, reward.creditCost)} max={reward.creditCost} />
        <div className="text-xs text-slate-500 mt-1">{eta}</div>
      </div>
    </Card>
  );
}
