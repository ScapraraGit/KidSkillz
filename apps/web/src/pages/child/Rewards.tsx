import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  ProgressBar,
  inputCls,
} from "../../components/ui";
import { Modal } from "../../components/Modal";
import { Tooltip } from "../../components/Tooltip";
import { useAuth } from "../../store/auth";
import { celebrate as fireCelebrate } from "../../lib/celebrate";
import type { ChildDTO, RewardDTO } from "@chorechampz/shared";

export function ChildRewards() {
  const meId = useAuth((s) => s.user?.id);
  const childQ = useQuery({
    queryKey: ["children", "me"],
    queryFn: () => api<{ children: ChildDTO[] }>("/children"),
  });
  const me = childQ.data?.children.find((c) => c.id === meId);

  const rewardsQ = useQuery({
    queryKey: ["rewards"],
    queryFn: () => api<{ rewards: RewardDTO[] }>("/rewards"),
  });
  const [requesting, setRequesting] = useState<RewardDTO | null>(null);
  const qc = useQueryClient();
  const setGoal = useMutation({
    mutationFn: (rewardId: string | null) =>
      api("/children/preferences", { method: "PATCH", body: { savingsGoalRewardId: rewardId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (!me || !rewardsQ.data) return <div>Loading…</div>;

  const visibleRewards = rewardsQ.data.rewards.filter(
    (r) => r.eligibleChildIds.length === 0 || r.eligibleChildIds.includes(me.id),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rewards"
        subtitle={
          me.redemptionPaused
            ? "Redemption is paused right now — but keep earning!"
            : `You have ${me.balance} credits to spend.`
        }
      />

      {me.redemptionPaused && (
        <Card className="bg-rose-50 border-rose-200">
          <div className="text-sm text-rose-800">
            <strong>Redemption paused.</strong> You can still earn credits and bank them for later.
          </div>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleRewards.length === 0 && <EmptyState title="No rewards available." />}
        {visibleRewards.map((r) => {
          const affordable = me.balance >= r.creditCost;
          const progressPct = Math.min(100, Math.round((me.balance / r.creditCost) * 100));
          return (
            <Card key={r.id} className={r.isActive ? "" : "opacity-60"}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{r.name}</h3>
                  <Badge color="brand">{r.type.replace("_", " ")}</Badge>
                </div>
                <div className="text-2xl font-bold">{r.creditCost} 🪙</div>
              </div>
              {r.description && <p className="text-sm text-slate-600 mt-2">{r.description}</p>}
              <div className="mt-3">
                <ProgressBar value={Math.min(me.balance, r.creditCost)} max={r.creditCost} />
                <div className="text-xs text-slate-500 mt-1">
                  {affordable
                    ? "You can afford this!"
                    : `${r.creditCost - me.balance} more to go (${progressPct}%)`}
                </div>
              </div>
              <Tooltip
                label={
                  me.redemptionPaused
                    ? "Redemption paused — ask a parent"
                    : !affordable
                      ? `Need ${r.creditCost - me.balance} more credits`
                      : "Request this reward (parent approves)"
                }
              >
                <Button
                  className="w-full mt-3"
                  disabled={!affordable || me.redemptionPaused || !r.isActive}
                  onClick={() => setRequesting(r)}
                >
                  {affordable ? "Redeem" : "Keep saving"}
                </Button>
              </Tooltip>
              {(() => {
                const isGoal = me.savingsGoalRewardId === r.id;
                return (
                  <Tooltip
                    label={
                      isGoal
                        ? "Stop saving for this"
                        : "Pin this as your savings goal — dashboard shows progress."
                    }
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2"
                      disabled={setGoal.isPending}
                      onClick={() => setGoal.mutate(isGoal ? null : r.id)}
                    >
                      {isGoal ? "★ Saving for this — unpin" : "☆ Set as savings goal"}
                    </Button>
                  </Tooltip>
                );
              })()}
            </Card>
          );
        })}
      </div>

      {requesting && (
        <RedeemModal
          reward={requesting}
          balance={me.balance}
          onClose={() => setRequesting(null)}
          onDone={() => {
            setRequesting(null);
            fireCelebrate("redeem", { sound: me.soundEnabled });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            qc.invalidateQueries({ queryKey: ["children"] });
            qc.invalidateQueries({ queryKey: ["redemptions"] });
          }}
        />
      )}
    </div>
  );
}

function RedeemModal({
  reward,
  balance,
  onClose,
  onDone,
}: {
  reward: RewardDTO;
  balance: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const isQty = reward.type === "SCREEN_TIME" || reward.type === "GAME_TIME";
  const unit = reward.metadata.unitMinutes ?? 30;
  const maxMinutes = reward.metadata.maxPerRedemption ?? 60;
  const maxQty = Math.max(1, Math.floor(maxMinutes / unit));
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const total = reward.creditCost * quantity;

  const send = useMutation({
    mutationFn: () =>
      api("/redemptions", {
        body: { rewardId: reward.id, quantity, notes: notes || undefined },
      }),
    onSuccess: onDone,
    onError: (e: any) => setErr(e.message),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Redeem: ${reward.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending || total > balance}>
            {send.isPending ? "Sending…" : `Request (${total} 🪙)`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {isQty && (
          <Field
            label={`How many ${unit}-minute units?`}
            hint={`Max ${maxQty} per request (${maxMinutes}m total)`}
          >
            <input
              className={inputCls}
              type="number"
              min={1}
              max={maxQty}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, Number(e.target.value))))}
            />
          </Field>
        )}
        <Field label="Note (optional)">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="text-sm bg-slate-50 rounded-lg p-3">
          Cost: <strong>{total} credits</strong>. After: <strong>{balance - total}</strong> remaining.
          {reward.requiresApproval && (
            <div className="text-xs text-slate-500 mt-1">A grown-up needs to approve.</div>
          )}
        </div>
        {err && <div className="text-sm text-rose-600">{err}</div>}
      </div>
    </Modal>
  );
}
