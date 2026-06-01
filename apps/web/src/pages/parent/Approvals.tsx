import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, uploadUrl } from "../../lib/api";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CreditChip,
  EmptyState,
  Field,
  PageHeader,
  SkeletonCard,
  inputCls,
} from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";
import { PhotoLightbox } from "../../components/PhotoLightbox";
import { PullToRefresh } from "../../components/PullToRefresh";
import { haptic } from "../../lib/native";
import type { InitiativeRequestDTO, RedemptionDTO, TaskCompletionDTO } from "@chorechampz/shared";

export function ParentApprovals() {
  const qc = useQueryClient();
  const completionsQ = useQuery({
    queryKey: ["completions", "PENDING"],
    queryFn: () => api<{ completions: TaskCompletionDTO[] }>("/completions?status=PENDING"),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const bulk = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ approved: number; failed: { id: string; reason: string }[] }>("/completions/bulk-approve", {
        body: { ids },
      }),
    onSuccess: (r) => {
      setSelected(new Set());
      if (r.failed.length > 0) {
        alert(
          `Approved ${r.approved}. Failed ${r.failed.length}:\n${r.failed.map((f) => f.reason).join("\n")}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["completions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
    },
  });
  const initiativeQ = useQuery({
    queryKey: ["initiative", "PENDING"],
    queryFn: () => api<{ initiative: InitiativeRequestDTO[] }>("/initiative?status=PENDING"),
  });
  const redemptionsQ = useQuery({
    queryKey: ["redemptions", "PENDING"],
    queryFn: () => api<{ redemptions: RedemptionDTO[] }>("/redemptions?status=PENDING"),
  });

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["completions"] }),
      qc.invalidateQueries({ queryKey: ["initiative"] }),
      qc.invalidateQueries({ queryKey: ["redemptions"] }),
      qc.invalidateQueries({ queryKey: ["dashboard"] }),
      qc.invalidateQueries({ queryKey: ["ledger"] }),
    ]);
  }

  if (completionsQ.isLoading && initiativeQ.isLoading && redemptionsQ.isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="space-y-6">
        <PageHeader title="Approvals" subtitle="Review what your kids submitted." />

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Task completions</h3>
            {(completionsQ.data?.completions.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">{selected.size} selected</span>
                <Tooltip label="Approve all selected at once (no override, no kudos).">
                  <Button
                    variant="success"
                    size="sm"
                    disabled={selected.size === 0 || bulk.isPending}
                    onClick={() => bulk.mutate(Array.from(selected))}
                  >
                    {bulk.isPending ? "Approving…" : `Approve ${selected.size || ""}`}
                  </Button>
                </Tooltip>
              </div>
            )}
          </div>
          {completionsQ.data?.completions.length === 0 ? (
            <EmptyState title="No completions waiting." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {completionsQ.data?.completions.map((c) => (
                <CompletionRow
                  key={c.id}
                  completion={c}
                  selected={selected.has(c.id)}
                  onToggleSelect={() => toggleSelect(c.id)}
                  onChange={refresh}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Initiative requests</h3>
          {initiativeQ.data?.initiative.length === 0 ? (
            <EmptyState title="No initiative submissions." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {initiativeQ.data?.initiative.map((i) => (
                <InitiativeRow key={i.id} initiative={i} onChange={refresh} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Reward redemptions</h3>
          {redemptionsQ.data?.redemptions.length === 0 ? (
            <EmptyState title="No reward requests." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {redemptionsQ.data?.redemptions.map((r) => (
                <RedemptionRow key={r.id} redemption={r} onChange={refresh} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PullToRefresh>
  );
}

function CompletionRow({
  completion,
  selected,
  onToggleSelect,
  onChange,
}: {
  completion: TaskCompletionDTO;
  selected: boolean;
  onToggleSelect: () => void;
  onChange: () => void;
}) {
  const [override, setOverride] = useState<string>("");
  const [kudos, setKudos] = useState<string>("");
  const approve = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      if (override) body.creditOverride = Number(override);
      if (kudos.trim()) body.parentNote = kudos.trim();
      return api(`/completions/${completion.id}/approve`, { body });
    },
    onSuccess: () => {
      void haptic("success");
      onChange();
    },
  });
  const reject = useMutation({
    mutationFn: (reason: string) => api(`/completions/${completion.id}/reject`, { body: { reason } }),
    onSuccess: () => {
      void haptic("warning");
      onChange();
    },
  });
  const photoUrl = uploadUrl(completion.photoKey);
  const suggested = completion.suggestedAward;
  const fullCredit = completion.task!.creditValue;
  const isReduced = !!suggested && suggested.deadline && suggested.credits < fullCredit;
  const tierBadge =
    suggested?.tier === "LATE" ? (
      <Badge color="amber">Late · {formatLateness(suggested.lateMinutes)}</Badge>
    ) : suggested?.tier === "SEVERE" ? (
      <Badge color="rose">Very late · {formatLateness(suggested.lateMinutes)}</Badge>
    ) : suggested?.deadline ? (
      <Badge color="emerald">On time</Badge>
    ) : null;

  return (
    <li className="py-3 flex flex-wrap items-center gap-3">
      <Tooltip label="Select for bulk approve">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${completion.child!.name}'s ${completion.task!.title}`}
          className="shrink-0"
        />
      </Tooltip>
      <Avatar name={completion.child!.name} color={completion.child!.avatarColor} size={32} />
      <div className="flex-1 min-w-[200px]">
        <div className="text-sm flex items-center gap-2 flex-wrap">
          <strong>{completion.child!.name}</strong> finished <strong>{completion.task!.title}</strong>
          {tierBadge}
        </div>
        {completion.notes && <div className="text-xs text-slate-500 italic">"{completion.notes}"</div>}
        {photoUrl && <PhotoLightbox src={photoUrl} alt={`Proof for ${completion.task!.title}`} thumb />}
        {isReduced && (
          <div className="text-xs text-slate-500 mt-1">
            Suggested award: <strong>{suggested!.credits}</strong> (full: {fullCredit}). Override below to
            change.
          </div>
        )}
      </div>
      <Tooltip label="Override the suggested credit award. Leave blank to use suggested.">
        <input
          className={`${inputCls} w-24`}
          type="number"
          inputMode="numeric"
          min={0}
          placeholder={`${suggested?.credits ?? fullCredit}`}
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          aria-label="Credit override"
        />
      </Tooltip>
      <Tooltip label="Optional kudos message your kid will see in their activity feed.">
        <input
          className={`${inputCls} w-full sm:w-44`}
          type="text"
          maxLength={280}
          placeholder="Nice job! 💬 (optional)"
          value={kudos}
          onChange={(e) => setKudos(e.target.value)}
          aria-label="Kudos message"
        />
      </Tooltip>
      <Tooltip label="Award credits and clear from queue">
        <Button variant="success" size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
          Approve
        </Button>
      </Tooltip>
      <Tooltip label="Deny without penalty (no credit posted)">
        <Button variant="ghost" size="sm" onClick={() => reject.mutate("")} disabled={reject.isPending}>
          Reject
        </Button>
      </Tooltip>
    </li>
  );
}

function formatLateness(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function InitiativeRow({ initiative, onChange }: { initiative: InitiativeRequestDTO; onChange: () => void }) {
  const [override, setOverride] = useState<string>("");
  const approve = useMutation({
    mutationFn: () =>
      api(`/initiative/${initiative.id}/approve`, {
        body: override ? { creditOverride: Number(override) } : {},
      }),
    onSuccess: () => {
      void haptic("success");
      onChange();
    },
  });
  const reject = useMutation({
    mutationFn: () => api(`/initiative/${initiative.id}/reject`, { body: {} }),
    onSuccess: () => {
      void haptic("warning");
      onChange();
    },
  });

  return (
    <li className="py-3 flex flex-wrap items-center gap-3">
      <Avatar name={initiative.child!.name} color={initiative.child!.avatarColor} size={32} />
      <div className="flex-1 min-w-[200px]">
        <div className="text-sm flex items-center gap-2 flex-wrap">
          <strong>{initiative.child!.name}</strong>
          <Badge color={initiative.kind === "PLANNED" ? "brand" : "slate"}>
            {initiative.kind === "PLANNED" ? "📅 Planned (eligible for bonus)" : "✍️ Already done"}
          </Badge>
          <span>{initiative.title}</span>
        </div>
        {initiative.description && <div className="text-xs text-slate-500">{initiative.description}</div>}
      </div>
      <Tooltip label="Override the suggested credits. Planned items earn a bonus over write-ins.">
        <input
          className={`${inputCls} w-24`}
          type="number"
          min={0}
          placeholder={`${initiative.suggestedCredits}`}
          value={override}
          onChange={(e) => setOverride(e.target.value)}
        />
      </Tooltip>
      <Tooltip label="Award credits for this initiative">
        <Button variant="success" size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
          Approve
        </Button>
      </Tooltip>
      <Tooltip label="Deny without posting credit">
        <Button variant="ghost" size="sm" onClick={() => reject.mutate()} disabled={reject.isPending}>
          Reject
        </Button>
      </Tooltip>
    </li>
  );
}

function RedemptionRow({ redemption, onChange }: { redemption: RedemptionDTO; onChange: () => void }) {
  const approve = useMutation({
    mutationFn: () => api(`/redemptions/${redemption.id}/approve`, { body: {} }),
    onSuccess: () => {
      void haptic("success");
      onChange();
    },
  });
  const reject = useMutation({
    mutationFn: () => api(`/redemptions/${redemption.id}/reject`, { body: {} }),
    onSuccess: () => {
      void haptic("warning");
      onChange();
    },
  });

  return (
    <li className="py-3 flex flex-wrap items-center gap-3">
      <Avatar name={redemption.child!.name} color={redemption.child!.avatarColor} size={32} />
      <div className="flex-1 min-w-[200px]">
        <div className="text-sm">
          <strong>{redemption.child!.name}</strong> wants <strong>{redemption.reward!.name}</strong>
          {redemption.quantity > 1 && ` ×${redemption.quantity}`}
        </div>
        {redemption.notes && <div className="text-xs text-slate-500 italic">"{redemption.notes}"</div>}
      </div>
      <CreditChip amount={-redemption.creditCost} />
      <Tooltip label="Approve redemption and deduct held credits">
        <Button variant="success" size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
          Approve
        </Button>
      </Tooltip>
      <Tooltip label="Reject and refund held credits to the kid">
        <Button variant="ghost" size="sm" onClick={() => reject.mutate()} disabled={reject.isPending}>
          Reject
        </Button>
      </Tooltip>
    </li>
  );
}
