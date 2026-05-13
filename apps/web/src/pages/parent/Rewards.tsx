import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { Badge, Button, Card, EmptyState, Field, PageHeader, inputCls } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { Tooltip } from "../../components/Tooltip";
import type { ChildDTO, RewardDTO, RewardType } from "@chorechamps/shared";

const TYPES: RewardType[] = [
  "SCREEN_TIME",
  "GAME_TIME",
  "MOVIE_NIGHT",
  "MONEY",
  "TREAT",
  "ACTIVITY",
  "CUSTOM",
];

export function ParentRewards() {
  const qc = useQueryClient();
  const rewardsQ = useQuery({
    queryKey: ["rewards"],
    queryFn: () => api<{ rewards: RewardDTO[] }>("/rewards"),
  });
  const childrenQ = useQuery({
    queryKey: ["children"],
    queryFn: () => api<{ children: ChildDTO[] }>("/children"),
  });
  const [editing, setEditing] = useState<RewardDTO | "new" | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => api(`/rewards/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rewards"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reward catalog"
        subtitle="What kids can spend their credits on."
        right={
          <Tooltip label="Add a reward kids can redeem credits for">
            <Button onClick={() => setEditing("new")}>New reward</Button>
          </Tooltip>
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewardsQ.data?.rewards.length === 0 && <EmptyState title="No rewards yet." />}
        {rewardsQ.data?.rewards.map((r) => (
          <Card key={r.id} className={r.isActive ? "" : "opacity-60"}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{r.name}</h3>
                <Badge color="brand">{r.type.replace("_", " ")}</Badge>
              </div>
              <div className="text-xl font-bold">{r.creditCost} 🪙</div>
            </div>
            {r.description && <p className="text-sm text-slate-600 mt-2">{r.description}</p>}
            {r.type === "SCREEN_TIME" && (
              <p className="text-xs text-slate-500 mt-2">
                {r.metadata.unitMinutes ?? 30}m units · max {r.metadata.maxPerRedemption ?? 60}m / redemption
              </p>
            )}
            {(r.weeklyLimit || r.dailyLimit) && (
              <p className="text-xs text-slate-500 mt-1">
                Limit: {r.dailyLimit ? `${r.dailyLimit}/day` : `${r.weeklyLimit}/week`}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Tooltip label="Edit name, cost, limits, eligibility">
                <Button variant="secondary" size="sm" onClick={() => setEditing(r)}>
                  Edit
                </Button>
              </Tooltip>
              <Tooltip label="Permanently delete this reward">
                <Button variant="ghost" size="sm" onClick={() => confirm("Delete?") && del.mutate(r.id)}>
                  Delete
                </Button>
              </Tooltip>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <RewardFormModal
          initial={editing === "new" ? null : editing}
          kids={childrenQ.data?.children ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["rewards"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function RewardFormModal({
  initial,
  kids,
  onClose,
  onSaved,
}: {
  initial: RewardDTO | null;
  kids: ChildDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [creditCost, setCreditCost] = useState(initial?.creditCost ?? 5);
  const [type, setType] = useState<RewardType>(initial?.type ?? "SCREEN_TIME");
  const [requiresApproval, setRequiresApproval] = useState(initial?.requiresApproval ?? true);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [weeklyLimit, setWeeklyLimit] = useState<string>(initial?.weeklyLimit?.toString() ?? "");
  const [dailyLimit, setDailyLimit] = useState<string>(initial?.dailyLimit?.toString() ?? "");
  const [unitMinutes, setUnitMinutes] = useState<string>(initial?.metadata.unitMinutes?.toString() ?? "30");
  const [maxPerRedemption, setMaxPerRedemption] = useState<string>(
    initial?.metadata.maxPerRedemption?.toString() ?? "60",
  );
  const [eligibleChildIds, setEligibleChildIds] = useState<string[]>(initial?.eligibleChildIds ?? []);

  const save = useMutation({
    mutationFn: async () => {
      const body: any = {
        name,
        description: description || undefined,
        creditCost: Number(creditCost),
        type,
        requiresApproval,
        isActive,
        weeklyLimit: weeklyLimit ? Number(weeklyLimit) : null,
        dailyLimit: dailyLimit ? Number(dailyLimit) : null,
        eligibleChildIds,
        metadata:
          type === "SCREEN_TIME" || type === "GAME_TIME"
            ? { unitMinutes: Number(unitMinutes), maxPerRedemption: Number(maxPerRedemption) }
            : {},
      };
      if (initial) await api(`/rewards/${initial.id}`, { method: "PATCH", body });
      else await api("/rewards", { body });
    },
    onSuccess: onSaved,
  });

  const toggleChild = (id: string) =>
    setEligibleChildIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit reward" : "New reward"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Description">
          <textarea
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Credit cost">
            <input
              className={inputCls}
              type="number"
              min={0}
              value={creditCost}
              onChange={(e) => setCreditCost(Number(e.target.value))}
            />
          </Field>
          <Field label="Type">
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as RewardType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {(type === "SCREEN_TIME" || type === "GAME_TIME") && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Increment minutes" hint="e.g. 30">
              <input
                className={inputCls}
                type="number"
                min={5}
                value={unitMinutes}
                onChange={(e) => setUnitMinutes(e.target.value)}
              />
            </Field>
            <Field label="Max minutes / redemption" hint="e.g. 60">
              <input
                className={inputCls}
                type="number"
                min={5}
                value={maxPerRedemption}
                onChange={(e) => setMaxPerRedemption(e.target.value)}
              />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Daily limit (optional)">
            <input
              className={inputCls}
              type="number"
              min={0}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
            />
          </Field>
          <Field label="Weekly limit (optional)">
            <input
              className={inputCls}
              type="number"
              min={0}
              value={weeklyLimit}
              onChange={(e) => setWeeklyLimit(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Eligible kids" hint="Leave empty for all">
          <div className="flex gap-2 flex-wrap">
            {kids.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleChild(c.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  eligibleChildIds.includes(c.id) ? "bg-brand-600 text-white border-brand-600" : "bg-white"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
            />
            Requires approval
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        </div>
      </div>
    </Modal>
  );
}
