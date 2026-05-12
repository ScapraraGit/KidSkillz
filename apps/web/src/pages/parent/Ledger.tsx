import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { Avatar, Card, CreditChip, EmptyState, PageHeader } from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";
import type { ChildDTO, LedgerEntryDTO } from "@chorechamps/shared";

export function ParentLedger() {
  const [childId, setChildId] = useState<string>("");
  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => api<{ children: ChildDTO[] }>("/children") });
  const ledgerQ = useQuery({
    queryKey: ["ledger", childId],
    queryFn: () =>
      api<{ entries: LedgerEntryDTO[] }>(`/ledger?limit=200${childId ? `&childId=${childId}` : ""}`),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ledger"
        subtitle="Every credit movement, audit-trail style."
        right={
          <Tooltip label="Filter ledger entries to one kid">
          <select
            aria-label="Filter ledger by kid"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
          >
            <option value="">All kids</option>
            {childrenQ.data?.children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          </Tooltip>
        }
      />

      <Card className="p-0 overflow-hidden">
        {ledgerQ.data?.entries.length === 0 ? (
          <EmptyState title="No entries." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-3">When</th>
                <th className="text-left p-3">Kid</th>
                <th className="text-left p-3">Reason</th>
                <th className="text-left p-3">Kind</th>
                <th className="text-right p-3">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledgerQ.data?.entries.map((e) => {
                const child = childrenQ.data?.children.find((c) => c.id === e.childId);
                return (
                  <tr key={e.id}>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={child?.name ?? "?"} color={child?.avatarColor} size={24} />
                        <span>{child?.name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="p-3">{e.reason}</td>
                    <td className="p-3 text-xs text-slate-500">{e.kind}</td>
                    <td className="p-3 text-right"><CreditChip amount={e.amount} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
