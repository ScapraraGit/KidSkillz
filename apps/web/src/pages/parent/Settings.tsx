import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Button, Card, Field, PageHeader, inputCls } from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";
import { useAuth } from "../../store/auth";
import { DEFAULT_FAMILY_SETTINGS, type FamilySettings } from "@chorechamps/shared";

export function ParentSettings() {
  const qc = useQueryClient();
  const setStoreSettings = useAuth((s) => s.setSettings);
  const familyQ = useQuery({
    queryKey: ["family"],
    queryFn: () => api<{ id: string; name: string; settings: FamilySettings }>("/family"),
  });

  const [s, setS] = useState<FamilySettings | null>(null);
  useEffect(() => {
    if (familyQ.data?.settings && !s) {
      // Merge in defaults so newly added blocks (e.g. latePenalty) have all sub-fields
      // even if the persisted JSON predates this version.
      setS({
        ...DEFAULT_FAMILY_SETTINGS,
        ...familyQ.data.settings,
        latePenalty: { ...DEFAULT_FAMILY_SETTINGS.latePenalty, ...(familyQ.data.settings.latePenalty ?? {}) },
        initiativeBonus: {
          ...DEFAULT_FAMILY_SETTINGS.initiativeBonus,
          ...(familyQ.data.settings.initiativeBonus ?? {}),
        },
        screenTime: { ...DEFAULT_FAMILY_SETTINGS.screenTime, ...(familyQ.data.settings.screenTime ?? {}) },
      });
    }
  }, [familyQ.data, s]);

  const save = useMutation({
    mutationFn: (patch: Partial<FamilySettings>) =>
      api<{ settings: FamilySettings }>("/family/settings", { method: "PATCH", body: patch }),
    onSuccess: (r) => {
      setStoreSettings(r.settings);
      qc.invalidateQueries({ queryKey: ["family"] });
    },
  });

  if (!s) return <div>Loading…</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Family settings" subtitle={familyQ.data?.name} />

      <Card className="space-y-4">
        <h3 className="font-semibold">Authentication</h3>
        <Field label="Child sign-in mode">
          <select
            className={inputCls}
            value={s.childAuthMode}
            onChange={(e) => setS({ ...s, childAuthMode: e.target.value as any })}
          >
            <option value="INDIVIDUAL">Individual — each kid uses their own PIN</option>
            <option value="SHARED_DEVICE">Shared device — family password unlocks profile picker</option>
          </select>
        </Field>
      </Card>

      <Card className="space-y-4">
        <h3 className="font-semibold">Proof and balance defaults</h3>
        <Field label="Default proof requirement (used when task & child don't override)">
          <select
            className={inputCls}
            value={s.defaultProofRequirement}
            onChange={(e) => setS({ ...s, defaultProofRequirement: e.target.value as any })}
          >
            <option value="NONE">None</option>
            <option value="NOTES_OPTIONAL">Notes optional</option>
            <option value="NOTES_REQUIRED">Notes required</option>
            <option value="PHOTO_OPTIONAL">Photo optional</option>
            <option value="PHOTO_REQUIRED">Photo required</option>
            <option value="PHOTO_AND_NOTES">Photo and notes</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.allowNegativeBalance}
            onChange={(e) => setS({ ...s, allowNegativeBalance: e.target.checked })}
          />
          Allow negative balances (advanced)
        </label>
      </Card>

      <Card className="space-y-4">
        <h3 className="font-semibold">Initiative bonuses</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.initiativeBonus.enabled}
            onChange={(e) =>
              setS({ ...s, initiativeBonus: { ...s.initiativeBonus, enabled: e.target.checked } })
            }
          />
          Enable bonus credits for planned-ahead initiative
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Flat bonus (credits)">
            <input
              className={inputCls}
              type="number"
              min={0}
              value={s.initiativeBonus.plannedFlatBonus}
              onChange={(e) =>
                setS({
                  ...s,
                  initiativeBonus: { ...s.initiativeBonus, plannedFlatBonus: Number(e.target.value) },
                })
              }
            />
          </Field>
          <Field label="Multiplier (1 = no multiplier)">
            <input
              className={inputCls}
              type="number"
              step="0.05"
              min={1}
              max={3}
              value={s.initiativeBonus.plannedMultiplier}
              onChange={(e) =>
                setS({
                  ...s,
                  initiativeBonus: { ...s.initiativeBonus, plannedMultiplier: Number(e.target.value) },
                })
              }
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h3 className="font-semibold">Late penalty</h3>
        <p className="text-sm text-slate-500">
          When a task has a deadline (recurring "Due by time" or one-time "Due at"), submissions past it earn
          fewer credits. Tasks without a deadline are always full credit.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.latePenalty?.enabled ?? false}
            onChange={(e) => setS({ ...s, latePenalty: { ...s.latePenalty, enabled: e.target.checked } })}
          />
          Apply late penalty to tasks with deadlines
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label="Grace minutes"
            hint="Submissions within this many minutes after the deadline still earn full credit."
          >
            <input
              className={inputCls}
              type="number"
              min={0}
              value={s.latePenalty?.graceMinutes ?? 30}
              onChange={(e) =>
                setS({ ...s, latePenalty: { ...s.latePenalty, graceMinutes: Number(e.target.value) } })
              }
            />
          </Field>
          <Field
            label="Late multiplier"
            hint="Late zone ends at grace × this. Default 2.0 → late zone is twice the grace window."
          >
            <input
              className={inputCls}
              type="number"
              step="0.1"
              min={1}
              value={s.latePenalty?.lateMultiplier ?? 2}
              onChange={(e) =>
                setS({ ...s, latePenalty: { ...s.latePenalty, lateMultiplier: Number(e.target.value) } })
              }
            />
          </Field>
          <Field
            label="Late percent"
            hint="Award during the late zone, as a fraction of full credit. 0.5 = 50%."
          >
            <input
              className={inputCls}
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={s.latePenalty?.latePercent ?? 0.5}
              onChange={(e) =>
                setS({ ...s, latePenalty: { ...s.latePenalty, latePercent: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Credit floor" hint="Minimum award after the late zone. 0 for strict, 1 for gentle.">
            <input
              className={inputCls}
              type="number"
              min={0}
              value={s.latePenalty?.creditFloor ?? 1}
              onChange={(e) =>
                setS({ ...s, latePenalty: { ...s.latePenalty, creditFloor: Number(e.target.value) } })
              }
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h3 className="font-semibold">Screen time defaults</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Increment minutes">
            <input
              className={inputCls}
              type="number"
              value={s.screenTime.incrementMinutes}
              onChange={(e) =>
                setS({ ...s, screenTime: { ...s.screenTime, incrementMinutes: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Max minutes per redemption">
            <input
              className={inputCls}
              type="number"
              value={s.screenTime.maxPerRedemptionMinutes}
              onChange={(e) =>
                setS({
                  ...s,
                  screenTime: { ...s.screenTime, maxPerRedemptionMinutes: Number(e.target.value) },
                })
              }
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Tooltip label="Persist these settings family-wide. Takes effect immediately.">
          <Button onClick={() => save.mutate(s)} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
