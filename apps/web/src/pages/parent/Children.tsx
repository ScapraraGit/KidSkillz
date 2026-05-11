import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Badge, Button, Card, EmptyState, Field, PageHeader, inputCls } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { KidAvatar } from "../../components/KidAvatar";
import { AvatarStudio, randomAvatarConfig } from "../../components/AvatarStudio";
import type { AvatarConfig, ChildDTO } from "@chorechamps/shared";

export function ParentChildren() {
  const qc = useQueryClient();
  const childrenQ = useQuery({ queryKey: ["children"], queryFn: () => api<{ children: ChildDTO[] }>("/children") });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ChildDTO | null>(null);
  const [adjusting, setAdjusting] = useState<ChildDTO | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["children"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["ledger"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kids"
        subtitle="Manage profiles, balances, and pause flags."
        right={<Button onClick={() => setCreating(true)}>Add kid</Button>}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        {childrenQ.data?.children.length === 0 && <EmptyState title="No kids yet." />}
        {childrenQ.data?.children.map((c) => (
          <Card key={c.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <KidAvatar name={c.name} color={c.avatarColor} config={c.avatarConfig} size={48} />
              <div className="flex-1">
                <div className="font-semibold text-lg">{c.name}</div>
                <div className="flex gap-1 mt-1">
                  {c.redemptionPaused && <Badge color="rose">Redemption paused</Badge>}
                  {c.earningPaused && <Badge color="rose">Earning paused</Badge>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{c.balance}</div>
                <div className="text-xs text-slate-500">credits</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(c)}>Edit</Button>
              <Button variant="secondary" size="sm" onClick={() => setAdjusting(c)}>Adjust credits</Button>
            </div>
          </Card>
        ))}
      </div>

      {creating && (
        <CreateChildModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            refresh();
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <EditChildModal
          child={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            refresh();
            setEditing(null);
          }}
        />
      )}
      {adjusting && (
        <AdjustModal
          child={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            refresh();
            setAdjusting(null);
          }}
        />
      )}
    </div>
  );
}

function CreateChildModal({ onClose, onCreated }: { onClose: () => void; onCreated: (child: ChildDTO) => void }) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [avatarColor, setAvatarColor] = useState("#22c55e");
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const save = useMutation({
    mutationFn: () => api<{ child: ChildDTO }>("/children", { body: { name, pin: pin || null, avatarColor, avatarConfig } }),
    onSuccess: (r) => {
      onCreated(r.child);
      nav(`/parent/tasks?childId=${r.child.id}`);
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Add kid"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="PIN (4-8 digits, optional)">
          <input
            className={inputCls}
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <Field label="Avatar color (fallback)">
          <input className={inputCls} type="color" value={avatarColor} onChange={(e) => setAvatarColor(e.target.value)} />
        </Field>
        <Field label="Avatar" hint="Pick a random starter avatar — the kid can fully customize it later.">
          <div className="flex items-center gap-3">
            <KidAvatar name={name || "?"} color={avatarColor} config={avatarConfig} size={56} />
            <Button type="button" variant="secondary" onClick={() => setAvatarConfig(randomAvatarConfig())}>🎲 Randomize</Button>
            {avatarConfig && (
              <Button type="button" variant="ghost" onClick={() => setAvatarConfig(null)}>Clear</Button>
            )}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

function EditChildModal({
  child,
  onClose,
  onSaved,
}: {
  child: ChildDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(child.name);
  const [pin, setPin] = useState("");
  const [avatarColor, setAvatarColor] = useState(child.avatarColor);
  const [redemptionPaused, setRedemptionPaused] = useState(child.redemptionPaused);
  const [earningPaused, setEarningPaused] = useState(child.earningPaused);
  const [studioOpen, setStudioOpen] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api(`/children/${child.id}`, {
        method: "PATCH",
        body: {
          name,
          ...(pin && { pin }),
          avatarColor,
          redemptionPaused,
          earningPaused,
        },
      }),
    onSuccess: onSaved,
  });

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Edit ${child.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Avatar">
            <div className="flex items-center gap-3">
              <KidAvatar name={child.name} color={child.avatarColor} config={child.avatarConfig} size={56} />
              <Button type="button" variant="secondary" size="sm" onClick={() => setStudioOpen(true)}>
                Design avatar
              </Button>
            </div>
          </Field>
          <Field label="Name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="New PIN (leave empty to keep current)">
            <input
              className={inputCls}
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Avatar color (fallback)">
            <input className={inputCls} type="color" value={avatarColor} onChange={(e) => setAvatarColor(e.target.value)} />
          </Field>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={redemptionPaused} onChange={(e) => setRedemptionPaused(e.target.checked)} />
              Pause redemption (kid can earn but not spend)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={earningPaused} onChange={(e) => setEarningPaused(e.target.checked)} />
              Pause earning (kid cannot submit completions)
            </label>
          </div>
        </div>
      </Modal>
      {studioOpen && (
        <AvatarStudio
          user={{ id: child.id, name: child.name, avatarColor: child.avatarColor, avatarConfig: child.avatarConfig }}
          childId={child.id}
          onClose={() => setStudioOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

function AdjustModal({
  child,
  onClose,
  onSaved,
}: {
  child: ChildDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => api("/adjustments", { body: { childId: child.id, amount: Number(amount), reason } }),
    onSuccess: onSaved,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust ${child.name}'s credits`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || amount === 0 || !reason}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Use positive numbers for bonuses, negative for penalties. Current balance: <strong>{child.balance}</strong>.
        </p>
        <Field label="Amount">
          <input className={inputCls} type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Reason">
          <input
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Bonus for helping unprompted"
          />
        </Field>
      </div>
    </Modal>
  );
}
