import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { Button, Card, EmptyState, Field, PageHeader, Badge, inputCls } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { Tooltip } from "../../components/Tooltip";
import type { ChallengeDTO, ChallengeKind, ChallengeWindow } from "@chorechamps/shared";

type WriteInput = {
  kind: ChallengeKind;
  title: string;
  target: number;
  window: ChallengeWindow;
  rewardCredits: number;
  isActive: boolean;
};

export function ParentChallenges() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["challenges", "family"],
    queryFn: () => api<{ challenges: ChallengeDTO[] }>("/challenges"),
    select: (r) => r.challenges,
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ChallengeDTO | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["challenges"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const toggle = useMutation({
    mutationFn: (c: ChallengeDTO) =>
      api(`/challenges/${c.id}`, { method: "PATCH", body: { isActive: !c.isActive } }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/challenges/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Challenges"
        subtitle="Daily and weekly missions kids can earn bonus credits for."
        right={
          <Tooltip label="Add a custom daily or weekly mission">
            <Button onClick={() => setCreating(true)}>Add challenge</Button>
          </Tooltip>
        }
      />

      <Card>
        {list.data?.length === 0 ? (
          <EmptyState title="No challenges yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.data?.map((c) => (
              <li key={c.id} className="py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.title}</span>
                    <Badge color={c.window === "DAY" ? "brand" : "amber"}>{c.window}</Badge>
                    {!c.isActive && <Badge color="slate">Inactive</Badge>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {prettyKind(c.kind)} · Target {c.target} · Reward {c.rewardCredits} 🪙
                  </div>
                </div>
                <Tooltip label={c.isActive ? "Hide from kids" : "Show to kids"}>
                  <Button variant="ghost" size="sm" onClick={() => toggle.mutate(c)} disabled={toggle.isPending}>
                    {c.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </Tooltip>
                <Tooltip label="Edit title, target, reward">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(c)}>Edit</Button>
                </Tooltip>
                <Tooltip label="Delete permanently (loses all progress history)">
                  <Button variant="danger" size="sm" onClick={() => remove.mutate(c.id)} disabled={remove.isPending}>
                    Delete
                  </Button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(creating || editing) && (
        <ChallengeModal
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { refresh(); setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ChallengeModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: ChallengeDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<WriteInput>(() =>
    existing
      ? {
          kind: existing.kind,
          title: existing.title,
          target: existing.target,
          window: existing.window,
          rewardCredits: existing.rewardCredits,
          isActive: existing.isActive,
        }
      : { kind: "COMPLETE_N_TASKS", title: "", target: 3, window: "DAY", rewardCredits: 3, isActive: true },
  );

  const save = useMutation({
    mutationFn: () =>
      existing
        ? api(`/challenges/${existing.id}`, { method: "PATCH", body: form })
        : api("/challenges", { body: form }),
    onSuccess: onSaved,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? "Edit challenge" : "New challenge"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title">
          <input
            className={inputCls}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Finish 3 chores today"
          />
        </Field>
        <Field label="Kind">
          <select
            className={inputCls}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as ChallengeKind })}
          >
            <option value="COMPLETE_N_TASKS">Complete N tasks</option>
            <option value="EARN_N_CREDITS">Earn N credits</option>
            <option value="INITIATIVE_N_TIMES">Show initiative N times</option>
            <option value="EARLY_BIRD">Early bird (before noon)</option>
            <option value="NO_MISSES">No misses (nightly job — coming soon)</option>
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Window">
            <select
              className={inputCls}
              value={form.window}
              onChange={(e) => setForm({ ...form, window: e.target.value as ChallengeWindow })}
            >
              <option value="DAY">Day</option>
              <option value="WEEK">Week</option>
            </select>
          </Field>
          <Field label="Target">
            <input
              className={inputCls}
              type="number"
              min={1}
              value={form.target}
              onChange={(e) => setForm({ ...form, target: Math.max(1, Number(e.target.value)) })}
            />
          </Field>
          <Field label="Reward 🪙">
            <input
              className={inputCls}
              type="number"
              min={0}
              value={form.rewardCredits}
              onChange={(e) => setForm({ ...form, rewardCredits: Math.max(0, Number(e.target.value)) })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Active (kids can earn it)
        </label>
      </div>
    </Modal>
  );
}

function prettyKind(k: ChallengeKind): string {
  return k.replace(/_/g, " ").toLowerCase();
}
