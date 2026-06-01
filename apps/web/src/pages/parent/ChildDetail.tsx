import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Badge, Card, CreditChip, EmptyState, PageHeader, SkeletonCard } from "../../components/ui";
import { KidAvatar } from "../../components/KidAvatar";
import { PullToRefresh } from "../../components/PullToRefresh";
import { LevelCard } from "../../components/LevelCard";
import type { ChildDTO, LedgerEntryDTO, LevelDTO } from "@chorechampz/shared";

// Drill-in page: /parent/children/:childId
// Shows a focused per-kid view — avatar, balance, pause status, XP level, and
// their ledger. Accessible from the Kids page (and parent dashboard on native).
// NativeHeader automatically shows a back chevron when navigated here.
export function ChildDetail() {
  const { childId } = useParams<{ childId: string }>();
  const qc = useQueryClient();

  const childrenQ = useQuery({
    queryKey: ["children"],
    queryFn: () => api<{ children: ChildDTO[] }>("/children"),
    staleTime: 60_000,
  });
  const child = childrenQ.data?.children.find((c) => c.id === childId);

  const levelQ = useQuery({
    queryKey: ["children", childId, "level"],
    queryFn: () => api<{ level: LevelDTO }>(`/children/${childId}/level`),
    enabled: !!childId,
    select: (r) => r.level,
  });

  const ledgerQ = useQuery({
    queryKey: ["ledger", "child", childId],
    queryFn: () => api<{ entries: LedgerEntryDTO[] }>(`/ledger?childId=${childId}&limit=100`),
    enabled: !!childId,
  });

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["children"] }),
      qc.invalidateQueries({ queryKey: ["children", childId, "level"] }),
      qc.invalidateQueries({ queryKey: ["ledger", "child", childId] }),
    ]);
  }

  if (childrenQ.isLoading || !child) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={6} />
      </div>
    );
  }

  const level = levelQ.data ?? { level: 1, xp: 0, xpInLevel: 0, xpToNext: 50 };

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="space-y-6">
        <PageHeader title={child.name} subtitle={`${child.balance} credits`} />

        {/* Kid summary card */}
        <Card className="flex items-center gap-4">
          <KidAvatar name={child.name} color={child.avatarColor} config={child.avatarConfig} size={64} />
          <div className="flex-1 min-w-0">
            <div className="text-2xl font-bold">{child.balance}</div>
            <div className="text-sm text-slate-500">credits available</div>
            <div className="flex gap-1 mt-2 flex-wrap">
              {child.redemptionPaused && <Badge color="rose">Redemption paused</Badge>}
              {child.earningPaused && <Badge color="rose">Earning paused</Badge>}
              {!child.redemptionPaused && !child.earningPaused && <Badge color="emerald">Active</Badge>}
            </div>
          </div>
        </Card>

        {/* XP / level card */}
        <LevelCard level={level} />

        {/* Ledger */}
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold">Credit history</h3>
          </div>
          {ledgerQ.isLoading ? (
            <div className="p-5 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-4 animate-pulse bg-slate-200 rounded" />
              ))}
            </div>
          ) : ledgerQ.data?.entries.length === 0 ? (
            <EmptyState title="No activity yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {ledgerQ.data?.entries.map((e) => (
                <li key={e.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">{e.reason}</div>
                    {e.parentNote && (
                      <div className="mt-0.5 text-xs text-brand-700 bg-brand-50 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
                        💬 {e.parentNote}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-0.5">
                      {new Date(e.createdAt).toLocaleString()} · {e.kind.replace(/_/g, " ").toLowerCase()}
                    </div>
                  </div>
                  <CreditChip amount={e.amount} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PullToRefresh>
  );
}
