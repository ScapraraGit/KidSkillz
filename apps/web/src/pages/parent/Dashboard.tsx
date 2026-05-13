import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Avatar, Badge, Card, CreditChip, EmptyState, PageHeader } from "../../components/ui";
import { SetupChecklist } from "../../components/SetupChecklist";
import type { ParentDashboardDTO } from "@chorechamps/shared";

export function ParentDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "parent"],
    queryFn: () => api<ParentDashboardDTO>("/dashboard/parent"),
  });

  if (isLoading || !data) return <div className="text-slate-500">Loading…</div>;

  const totalPending =
    data.pendingCompletions.length + data.pendingInitiative.length + data.pendingRedemptions.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Family dashboard"
        subtitle="What needs your attention today."
        right={
          <Link id="tile-pending-badge" to="/parent/approvals">
            <Badge color={totalPending > 0 ? "amber" : "slate"}>{totalPending} pending</Badge>
          </Link>
        }
      />

      <SetupChecklist />

      <section
        id={data.children.length === 0 ? undefined : "tile-children"}
        className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {data.children.map((c, idx) => {
          const week = data.weeklyTotals.find((w) => w.childId === c.id);
          return (
            <Card
              key={c.id}
              className="flex flex-col gap-3"
              info={
                idx === 0
                  ? {
                      title: "Per-kid summary",
                      body: "Each card shows a child's current balance plus credits earned and spent this week. 'Paused' badges mean earning or redemptions are temporarily off — toggle in Kids settings.",
                    }
                  : undefined
              }
            >
              <div className="flex items-center gap-3">
                <Avatar name={c.name} color={c.avatarColor} />
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {c.redemptionPaused && <Badge color="rose">Redemption paused</Badge>}
                    {c.earningPaused && <Badge color="rose">Earning paused</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{c.balance}</span>
                <span className="text-slate-500">credits</span>
              </div>
              <div className="text-xs text-slate-500">
                This week: <strong className="text-emerald-700">+{week?.earned ?? 0}</strong> earned ·{" "}
                <strong className="text-rose-700">-{week?.spent ?? 0}</strong> spent
              </div>
              <Link
                to={`/parent/tasks?childId=${c.id}`}
                className="text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                Manage tasks →
              </Link>
            </Card>
          );
        })}
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <Card
          id="tile-pending-approvals"
          info={{
            title: "Pending approvals",
            body: "Tasks the kids submitted plus their initiative suggestions. Approve to award the credits shown; reject to deny without penalty. 'Review all' takes you to the full queue with photos and notes.",
          }}
        >
          <h3 className="font-semibold mb-3">Pending approvals</h3>
          {data.pendingCompletions.length === 0 && data.pendingInitiative.length === 0 ? (
            <EmptyState title="All caught up!" />
          ) : (
            <ul className="space-y-2">
              {data.pendingCompletions.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                  <Avatar name={c.child!.name} color={c.child!.avatarColor} size={32} />
                  <div className="flex-1">
                    <div className="text-sm">
                      <strong>{c.child!.name}</strong> finished <strong>{c.task!.title}</strong>
                    </div>
                    {c.notes && <div className="text-xs text-slate-500">"{c.notes}"</div>}
                  </div>
                  <CreditChip amount={c.task!.creditValue} />
                </li>
              ))}
              {data.pendingInitiative.slice(0, 5).map((i) => (
                <li key={i.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                  <Avatar name={i.child!.name} color={i.child!.avatarColor} size={32} />
                  <div className="flex-1">
                    <div className="text-sm flex items-center gap-2">
                      <strong>{i.child!.name}</strong>
                      <Badge color={i.kind === "PLANNED" ? "brand" : "slate"}>
                        {i.kind === "PLANNED" ? "📅 Planned" : "✍️ Write-in"}
                      </Badge>
                      <span className="truncate">{i.title}</span>
                    </div>
                  </div>
                  <CreditChip amount={i.suggestedCredits} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 text-right">
            <Link to="/parent/approvals" className="text-sm text-brand-700 font-medium">
              Review all →
            </Link>
          </div>
        </Card>

        <Card
          id="tile-reward-requests"
          info={{
            title: "Reward requests",
            body: "Pending redemptions. Credits are held when a kid requests; approving deducts them, rejecting refunds them automatically. The amount shown is what they'll spend.",
          }}
        >
          <h3 className="font-semibold mb-3">Reward requests</h3>
          {data.pendingRedemptions.length === 0 ? (
            <EmptyState title="No requests right now." />
          ) : (
            <ul className="space-y-2">
              {data.pendingRedemptions.map((r) => (
                <li key={r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                  <Avatar name={r.child!.name} color={r.child!.avatarColor} size={32} />
                  <div className="flex-1">
                    <div className="text-sm">
                      <strong>{r.child!.name}</strong> wants <strong>{r.reward!.name}</strong>
                      {r.quantity > 1 && ` ×${r.quantity}`}
                    </div>
                    {r.notes && <div className="text-xs text-slate-500">"{r.notes}"</div>}
                  </div>
                  <CreditChip amount={-r.creditCost} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <Card
        info={{
          title: "Recent activity",
          body: "Every credit change across the family — task approvals, redemptions, manual adjustments. The full history with filters lives on the Ledger page.",
        }}
      >
        <h3 className="font-semibold mb-3">Recent activity</h3>
        {data.recentLedger.length === 0 ? (
          <EmptyState title="No activity yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recentLedger.map((e) => {
              const child = data.children.find((c) => c.id === e.childId);
              return (
                <li key={e.id} className="py-2 flex items-center gap-3 text-sm">
                  <Avatar name={child?.name ?? "?"} color={child?.avatarColor} size={28} />
                  <span className="font-medium">{child?.name}</span>
                  <span className="text-slate-500">{e.reason}</span>
                  <CreditChip amount={e.amount} />
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
