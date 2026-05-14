import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card } from "./ui";
import type { ChildDTO, RewardDTO, TaskDTO } from "@chorechampz/shared";

interface Step {
  key: string;
  label: string;
  hint: string;
  to: string;
  cta: string;
  done: boolean;
}

/**
 * First-run setup. Shows while the family is missing any of: kid, task, reward.
 * Auto-hides once all three exist. Non-blocking — parent can ignore and explore.
 */
export function SetupChecklist() {
  const kidsQ = useQuery({
    queryKey: ["children"],
    queryFn: () => api<{ children: ChildDTO[] }>("/children"),
  });
  const tasksQ = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<{ tasks: TaskDTO[] }>("/tasks"),
  });
  const rewardsQ = useQuery({
    queryKey: ["rewards"],
    queryFn: () => api<{ rewards: RewardDTO[] }>("/rewards"),
  });

  const ready = kidsQ.data && tasksQ.data && rewardsQ.data;
  if (!ready) return null;

  const hasKid = (kidsQ.data?.children.length ?? 0) > 0;
  const hasTask = (tasksQ.data?.tasks.length ?? 0) > 0;
  const hasReward = (rewardsQ.data?.rewards.length ?? 0) > 0;
  if (hasKid && hasTask && hasReward) return null;

  const steps: Step[] = [
    {
      key: "kid",
      label: "Add your first kid",
      hint: "Set a name, optional PIN, and an avatar.",
      to: "/parent/children",
      cta: "Add a kid",
      done: hasKid,
    },
    {
      key: "task",
      label: "Create a task",
      hint: "One-time or recurring chore. Set how much it pays in credits.",
      to: "/parent/tasks",
      cta: "Create a task",
      done: hasTask,
    },
    {
      key: "reward",
      label: "Add a reward",
      hint: "What kids can spend credits on — screen time, treats, anything.",
      to: "/parent/rewards",
      cta: "Add a reward",
      done: hasReward,
    },
  ];

  const completed = steps.filter((s) => s.done).length;

  return (
    <Card className="bg-gradient-to-br from-brand-50 to-indigo-50 border-brand-200">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg">
            Welcome — finish setup ({completed}/{steps.length})
          </h3>
          <p className="text-sm text-slate-600">
            A real chore loop needs one of each. Knock these out in any order.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-3 p-2 rounded-lg bg-white/70 border border-white">
            <span
              className={
                "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold " +
                (s.done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600")
              }
              aria-hidden
            >
              {s.done ? "✓" : ""}
            </span>
            <div className="flex-1 min-w-0">
              <div className={"font-medium " + (s.done ? "line-through text-slate-400" : "")}>{s.label}</div>
              {!s.done && <div className="text-xs text-slate-500">{s.hint}</div>}
            </div>
            {!s.done && (
              <Link
                to={s.to}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700"
              >
                {s.cta} →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
