import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card, CreditChip, EmptyState, PageHeader } from "../../components/ui";
import type { LedgerEntryDTO } from "@chorechampz/shared";

export function ChildActivity() {
  const ledgerQ = useQuery({
    queryKey: ["ledger", "me"],
    queryFn: () => api<{ entries: LedgerEntryDTO[] }>("/ledger?limit=200"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="My activity" subtitle="Everything you've earned and spent." />
      <Card className="p-0 overflow-hidden">
        {ledgerQ.data?.entries.length === 0 ? (
          <EmptyState title="No activity yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {ledgerQ.data?.entries.map((e) => (
              <li key={e.id} className="p-3 flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium text-slate-800">{e.reason}</div>
                  {e.parentNote && (
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-brand-700 bg-brand-50 rounded-full px-2 py-0.5">
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
  );
}
