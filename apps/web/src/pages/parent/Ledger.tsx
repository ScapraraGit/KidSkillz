import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Avatar, Card, CreditChip, EmptyState, PageHeader, inputCls } from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";
import { LedgerKind, type ChildDTO, type LedgerEntryDTO } from "@chorechamps/shared";

const ALL_KINDS = Object.values(LedgerKind);

export function ParentLedger() {
  const [childId, setChildId] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [kinds, setKinds] = useState<Set<string>>(new Set());

  const childrenQ = useQuery({
    queryKey: ["children"],
    queryFn: () => api<{ children: ChildDTO[] }>("/children"),
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (childId) params.set("childId", childId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (kinds.size > 0) params.set("kind", Array.from(kinds).join(","));
    return params.toString();
  }, [childId, from, to, kinds]);

  const ledgerQ = useQuery({
    queryKey: ["ledger", query],
    queryFn: () => api<{ entries: LedgerEntryDTO[] }>(`/ledger?${query}`),
  });

  function toggleKind(k: string) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const hasFilters = !!childId || !!from || !!to || kinds.size > 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Ledger" subtitle="Every credit movement, audit-trail style." />

      <Card className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Kid</label>
            <select
              aria-label="Filter ledger by kid"
              className={inputCls}
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
            >
              <option value="">All kids</option>
              {childrenQ.data?.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">From</label>
            <input
              aria-label="From date"
              type="date"
              className={inputCls}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">To</label>
            <input
              aria-label="To date"
              type="date"
              className={inputCls}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Kind</div>
          <div className="flex flex-wrap gap-1">
            {ALL_KINDS.map((k) => {
              const on = kinds.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleKind(k)}
                  className={
                    "px-2 py-0.5 rounded-full text-xs font-medium border transition " +
                    (on
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50")
                  }
                >
                  {k.replace(/_/g, " ").toLowerCase()}
                </button>
              );
            })}
          </div>
        </div>
        {hasFilters && (
          <Tooltip label="Clear all ledger filters">
            <button
              type="button"
              onClick={() => {
                setChildId("");
                setFrom("");
                setTo("");
                setKinds(new Set());
              }}
              className="text-xs text-brand-700 hover:underline"
            >
              Clear filters
            </button>
          </Tooltip>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        {ledgerQ.data?.entries.length === 0 ? (
          <EmptyState title="No entries." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
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
                      <td className="p-3 text-right">
                        <CreditChip amount={e.amount} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
