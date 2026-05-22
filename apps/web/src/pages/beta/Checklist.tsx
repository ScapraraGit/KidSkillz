import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Button, Card, PageHeader, ProgressBar } from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";

interface ChecklistItem {
  key: string;
  label: string;
  hint: string;
}

const CHECKLIST: ChecklistItem[] = [
  { key: "create_family", label: "Create or join a family", hint: "Sign up flow — name, email, family name" },
  { key: "add_child", label: "Add a child", hint: "Open Kids → Add child" },
  { key: "create_task", label: "Create a chore or task", hint: "Tasks → New task. Try a recurring one." },
  { key: "assign_reward", label: "Add a reward", hint: "Rewards → New reward. Set credit cost." },
  {
    key: "complete_task",
    label: "Complete a chore",
    hint: "Sign in as kid (or use shared device) and mark a chore done.",
  },
  { key: "approve_completion", label: "Approve a completed chore", hint: "Parent → Approvals tab." },
  { key: "redeem_reward", label: "Redeem a reward", hint: "Kid view → Rewards → spend credits." },
  { key: "test_recurring", label: "Try a recurring task", hint: "Set days-of-week + a due time." },
  { key: "test_initiative", label: "Submit initiative or a write-in task", hint: "Kid view → Initiative." },
  { key: "test_mobile", label: "Use the app on your phone", hint: "Open it on your phone browser." },
  { key: "test_desktop", label: "Use the app on a computer or tablet", hint: "If you have access to one." },
];

const REFLECTION = [
  "Did the app feel motivating?",
  "Did it make chores easier to manage?",
  "Would your child actually want to use it?",
  "Would you come back tomorrow? Why or why not?",
];

interface ChecklistResponse {
  completed: string[];
  submittedAt: string | null;
}

export function BetaChecklist() {
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ["beta", "checklist"],
    queryFn: () => api<ChecklistResponse>("/beta/checklist"),
  });

  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (q.data) setDone(new Set(q.data.completed));
  }, [q.data]);

  const save = useMutation({
    mutationFn: (completed: string[]) =>
      api<ChecklistResponse>("/beta/checklist", { method: "PUT", body: { completed } }),
  });

  function toggle(key: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Persist eagerly. If it fails, the next toggle will retry.
      save.mutate(Array.from(next));
      return next;
    });
  }

  const progress = done.size;
  const total = CHECKLIST.length;

  return (
    <div>
      <PageHeader
        title="Beta Tester Checklist"
        subtitle="Help us shape ChoreChampz. Try a few key flows, then share what you think."
        right={
          <Tooltip label="Jump straight to the feedback form">
            <span className="inline-flex">
              <Button onClick={() => nav("/beta/feedback")}>Continue to Feedback →</Button>
            </span>
          </Tooltip>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <h2 className="font-semibold text-slate-800 mb-1">What we're trying to do</h2>
          <p className="text-sm text-slate-600">
            ChoreChampz helps families turn chores, initiative, and rewards into something kids actually want
            to do. We need your honest take — the blunter, the better.
          </p>
          <p className="text-sm text-slate-600 mt-2">
            Plan on about <strong>10–15 minutes</strong>. Work through the checklist below, then click{" "}
            <em>Continue to Feedback</em>. Your toggles save as you go.
          </p>
        </Card>
        <Card>
          <h3 className="font-semibold text-slate-800 mb-2">Your progress</h3>
          <ProgressBar value={progress} max={total} label="Checklist" />
          <p className="text-xs text-slate-500 mt-2">
            {progress === total
              ? "You're done — nice work!"
              : `${total - progress} item${total - progress === 1 ? "" : "s"} to go`}
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-semibold text-slate-800 mb-3">Suggested testing checklist</h2>
        <ul className="space-y-2">
          {CHECKLIST.map((item) => {
            const checked = done.has(item.key);
            return (
              <li key={item.key}>
                <Tooltip label={item.hint} side="right">
                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                      checked
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={checked}
                      onChange={() => toggle(item.key)}
                      aria-label={item.label}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800">{item.label}</div>
                      <div className="text-xs text-slate-500">{item.hint}</div>
                    </div>
                  </label>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold text-slate-800 mb-2">As you test, think about</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
          {REFLECTION.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 mt-3">
          No need to write anything yet — bring these to the feedback form.
        </p>
      </Card>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-slate-500">
          Ready to share what you think?{" "}
          <Link to="/beta" className="text-brand-600 underline">
            Back to beta home
          </Link>
        </p>
        <Tooltip label="Open the feedback form">
          <span className="inline-flex">
            <Button size="lg" onClick={() => nav("/beta/feedback")}>
              Continue to Feedback →
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
