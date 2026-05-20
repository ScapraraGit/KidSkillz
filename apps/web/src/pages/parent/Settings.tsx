import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { api, API_URL } from "../../lib/api";
import { Button, Card, Field, PageHeader, inputCls } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { Tooltip } from "../../components/Tooltip";
import { EmojiPicker } from "../../components/EmojiPicker";
import { useAuth } from "../../store/auth";
import { DEFAULT_FAMILY_SETTINGS, type FamilySettings, type TaskCategoryDTO } from "@chorechampz/shared";
import { useFeatures } from "../../hooks/useFeatures";
import { DevicesCard } from "../../components/DevicesCard";

export function ParentSettings() {
  const qc = useQueryClient();
  const setStoreSettings = useAuth((s) => s.setSettings);
  const features = useFeatures();
  const familyQ = useQuery({
    queryKey: ["family"],
    queryFn: () =>
      api<{ id: string; name: string; familyCode: string | null; settings: FamilySettings }>("/family"),
  });

  const [devicePassword, setDevicePassword] = useState("");
  const [devicePwMsg, setDevicePwMsg] = useState<string | null>(null);
  const saveDevicePw = useMutation({
    mutationFn: (password: string) =>
      api<{ ok: true }>("/family/device-password", { method: "PUT", body: { password } }),
    onSuccess: () => {
      setDevicePwMsg("Saved.");
      setDevicePassword("");
    },
    onError: (e: any) => setDevicePwMsg(e?.message ?? "Failed to save"),
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
        {familyQ.data?.familyCode && (
          <Field label="Family code (share with kids on shared devices)">
            <input
              className={inputCls}
              placeholder="Family code"
              value={familyQ.data.familyCode}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
          </Field>
        )}
        {s.childAuthMode === "SHARED_DEVICE" && (
          <Field label="Shared-device password (separate from parent passwords)">
            <div className="flex gap-2">
              <input
                className={inputCls}
                type="password"
                placeholder="Min 8 characters"
                minLength={8}
                value={devicePassword}
                onChange={(e) => setDevicePassword(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={devicePassword.length < 8 || saveDevicePw.isPending}
                onClick={() => saveDevicePw.mutate(devicePassword)}
              >
                {saveDevicePw.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
            {devicePwMsg && <div className="text-xs text-slate-500 mt-1">{devicePwMsg}</div>}
          </Field>
        )}
      </Card>

      {features.devicePairing && <DevicesCard />}

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
            {features.photoProof && (
              <>
                <option value="PHOTO_OPTIONAL">Photo optional</option>
                <option value="PHOTO_REQUIRED">Photo required</option>
                <option value="PHOTO_AND_NOTES">Photo and notes</option>
              </>
            )}
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.siblingPrivacy ?? false}
            onChange={(e) => setS({ ...s, siblingPrivacy: e.target.checked })}
          />
          Sibling-private mode (hide other kids' balances/levels from each child)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.penaltiesEnabled ?? false}
            onChange={(e) => setS({ ...s, penaltiesEnabled: e.target.checked })}
          />
          Enable missed-task penalties (negative credits posted nightly per task config)
        </label>
        <Field
          label="Missed Opportunity overlay"
          hint="What kid sees when a grown-up self-claims a task before them."
        >
          <select
            className={inputCls}
            value={s.missedOpportunityMode ?? "GENTLE"}
            onChange={(e) =>
              setS({ ...s, missedOpportunityMode: e.target.value as "OFF" | "GENTLE" | "SAVAGE" })
            }
          >
            <option value="OFF">Off — no overlay shown</option>
            <option value="GENTLE">Gentle — friendly nudge</option>
            <option value="SAVAGE">Savage — playful roast</option>
          </select>
        </Field>
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
        <h3 className="font-semibold">Email notifications</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.emailNotifications ?? false}
            onChange={(e) => setS({ ...s, emailNotifications: e.target.checked })}
          />
          Mirror in-app notifications to email for any user with an email on file
        </label>
        <p className="text-xs text-slate-500">
          Kids without an email never receive emails. Off by default to avoid inbox flood.
        </p>
      </Card>

      <Card className="space-y-4">
        <h3 className="font-semibold">Vacation mode</h3>
        <p className="text-sm text-slate-500">
          Pauses earning family-wide and freezes streak loss. Toggle on for trips so kids don't get penalized
          for missed days. Auto-deactivates after the end date.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.vacationMode?.active ?? false}
            onChange={(e) =>
              setS({
                ...s,
                vacationMode: {
                  ...(s.vacationMode ?? {}),
                  active: e.target.checked,
                },
              })
            }
          />
          On vacation
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Ends on (optional)" hint="Auto-clears 'on vacation' once this date passes.">
            <input
              className={inputCls}
              type="date"
              value={s.vacationMode?.endsAt ? new Date(s.vacationMode.endsAt).toISOString().slice(0, 10) : ""}
              onChange={(e) =>
                setS({
                  ...s,
                  vacationMode: {
                    ...(s.vacationMode ?? { active: false }),
                    active: s.vacationMode?.active ?? false,
                    endsAt: e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : null,
                  },
                })
              }
            />
          </Field>
          <Field label="Note for kids (optional)">
            <input
              className={inputCls}
              maxLength={200}
              placeholder="e.g. Beach week — relax!"
              value={s.vacationMode?.note ?? ""}
              onChange={(e) =>
                setS({
                  ...s,
                  vacationMode: {
                    ...(s.vacationMode ?? { active: false }),
                    active: s.vacationMode?.active ?? false,
                    note: e.target.value || null,
                  },
                })
              }
            />
          </Field>
        </div>
      </Card>

      {features.photoProof && (
        <Card className="space-y-4">
          <h3 className="font-semibold">Photo proof retention</h3>
          <p className="text-sm text-slate-500">
            Photos kids submit as proof are automatically deleted after this many days. Set to 0 to keep them
            forever.
          </p>
          <Field label="Retention (days)" hint="Default 90. Lower = better privacy. 0 = no auto-delete.">
            <input
              className={inputCls}
              type="number"
              min={0}
              max={3650}
              value={s.photoRetentionDays ?? 90}
              onChange={(e) => setS({ ...s, photoRetentionDays: Number(e.target.value) })}
            />
          </Field>
        </Card>
      )}

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

      <TaskCategoriesCard />

      <DataAndDeletionCard familyName={familyQ.data?.name ?? ""} />
    </div>
  );
}

function TaskCategoriesCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["task-categories"],
    queryFn: () => api<{ categories: TaskCategoryDTO[] }>("/task-categories"),
  });
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("⭐");
  const [deleteTarget, setDeleteTarget] = useState<TaskCategoryDTO | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Source-of-truth ordering: server response sorted by position. Local mirror
  // lets us reorder optimistically during drag without waiting for the round-
  // trip, then PATCH each affected row's position on drop.
  const serverCats = q.data?.categories ?? [];
  const [orderedCats, setOrderedCats] = useState<TaskCategoryDTO[]>([]);
  useEffect(() => {
    setOrderedCats(serverCats);
  }, [serverCats]);

  const create = useMutation({
    mutationFn: (body: { name: string; icon: string; position: number }) => api("/task-categories", { body }),
    onSuccess: () => {
      setNewName("");
      setNewIcon("⭐");
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ["task-categories"] });
    },
    onError: (e: any) => setCreateError(e?.message ?? "Could not create category"),
  });

  const update = useMutation({
    mutationFn: (v: { id: string; patch: Partial<TaskCategoryDTO> }) =>
      api(`/task-categories/${v.id}`, { method: "PATCH", body: v.patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-categories"] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/task-categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["task-categories"] });
    },
  });

  function nameClash(candidate: string, exceptId?: string): boolean {
    const norm = candidate.trim().toLowerCase();
    return orderedCats.some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === norm);
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setCreateError("Name is required.");
      return;
    }
    if (nameClash(name)) {
      setCreateError("A category with this name already exists.");
      return;
    }
    const nextPos = orderedCats.length > 0 ? Math.max(...orderedCats.map((c) => c.position)) + 1 : 0;
    create.mutate({ name, icon: newIcon, position: nextPos });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedCats.findIndex((c) => c.id === active.id);
    const newIndex = orderedCats.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(orderedCats, oldIndex, newIndex);
    setOrderedCats(reordered);
    // PATCH only the rows whose position actually changed. Server-side schema
    // accepts position 0..999; we re-number from 0 to keep gaps small.
    reordered.forEach((c, i) => {
      if (c.position !== i) {
        update.mutate({ id: c.id, patch: { position: i } });
      }
    });
  }

  return (
    <>
      <Card className="space-y-4">
        <div>
          <h3 className="font-semibold">Task categories</h3>
          <p className="text-sm text-slate-500 mt-1">
            Categories group tasks on the kid dashboard. Drag to reorder, click the icon to change it, or
            rename inline. Changes save when you tab away.
          </p>
        </div>

        {orderedCats.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            No categories yet. Add your first one below.
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[24px_56px_1fr_88px] items-center gap-2 px-1 pb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span aria-hidden="true" />
              <span>Icon</span>
              <span>Name</span>
              <span className="text-right pr-1">Actions</span>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedCats.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {orderedCats.map((c) => (
                    <CategoryRow
                      key={c.id}
                      category={c}
                      onRename={(name) => {
                        if (!name.trim()) return; // ignore blanks; row reverts on blur
                        if (nameClash(name, c.id)) return;
                        if (name === c.name) return;
                        update.mutate({ id: c.id, patch: { name: name.trim() } });
                      }}
                      onIconChange={(icon) => {
                        if (!icon || icon === c.icon) return;
                        update.mutate({ id: c.id, patch: { icon } });
                      }}
                      onDelete={() => setDeleteTarget(c)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        )}

        <div className="pt-3 border-t border-slate-100">
          <div className="text-sm font-medium text-slate-700 mb-2">Add category</div>
          <div className="flex items-start gap-2">
            <EmojiPicker value={newIcon} onChange={setNewIcon} label="Pick an icon for the new category" />
            <div className="flex-1">
              <input
                className={inputCls}
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (createError) setCreateError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="e.g. Chores, Homework"
                maxLength={40}
              />
              {createError && <div className="mt-1 text-xs text-rose-600">{createError}</div>}
            </div>
            <Tooltip label="Add a new task category">
              <Button onClick={handleCreate} disabled={!newName.trim() || create.isPending}>
                Add
              </Button>
            </Tooltip>
          </div>
        </div>
      </Card>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete category?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteTarget && del.mutate(deleteTarget.id)}
              disabled={del.isPending}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Delete{" "}
          <strong>
            {deleteTarget?.icon} {deleteTarget?.name}
          </strong>
          ? Tasks using this category will become uncategorized — they won&rsquo;t be deleted.
        </p>
      </Modal>
    </>
  );
}

interface CategoryRowProps {
  category: TaskCategoryDTO;
  onRename: (name: string) => void;
  onIconChange: (icon: string) => void;
  onDelete: () => void;
}

function CategoryRow({ category, onRename, onIconChange, onDelete }: CategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  // Local mirror of the name so each keystroke doesn't fire a PATCH. Commit on
  // blur or Enter. Reset to server value if the user clears it to empty so the
  // row can never end up nameless (server would reject the PATCH anyway, but
  // the UI shouldn't allow visibly-bad state).
  const [draft, setDraft] = useState(category.name);
  useEffect(() => {
    setDraft(category.name);
  }, [category.name]);

  // dnd-kit returns drag transforms via JS — inline style is the supported API
  // surface, so the no-inline-styles rule doesn't apply here.
  // eslint-disable-next-line react/forbid-dom-props
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  function commit() {
    const next = draft.trim();
    if (!next) {
      setDraft(category.name);
      return;
    }
    onRename(next);
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[24px_56px_1fr_88px] items-center gap-2 px-2 py-2 bg-white"
    >
      <Tooltip label="Drag to reorder">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="h-8 w-6 cursor-grab text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded"
        >
          ⋮⋮
        </button>
      </Tooltip>
      <EmojiPicker value={category.icon} onChange={onIconChange} label={`Change icon for ${category.name}`} />
      <input
        className={inputCls}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setDraft(category.name);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        maxLength={40}
        aria-label={`Rename ${category.name}`}
      />
      <div className="flex justify-end">
        <Tooltip label={`Delete category "${category.name}"`}>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </Tooltip>
      </div>
    </li>
  );
}

function DataAndDeletionCard({ familyName }: { familyName: string }) {
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  async function downloadExport() {
    setExporting(true);
    setExportErr(null);
    try {
      const token = useAuth.getState().token;
      const res = await fetch(`${API_URL}/family/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chorechampz-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setExportErr(e.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="space-y-4 border-rose-200">
      <h3 className="font-semibold">Your data</h3>
      <p className="text-sm text-slate-600">
        Export a full JSON copy of everything in your family, or permanently delete your account.
      </p>
      <div className="flex flex-wrap gap-2">
        <Tooltip label="Download a JSON file with every record in your family (excluding passwords + tokens).">
          <Button variant="secondary" onClick={downloadExport} disabled={exporting}>
            {exporting ? "Preparing…" : "Export data"}
          </Button>
        </Tooltip>
        <Tooltip label="Permanently delete this family, all kids, tasks, rewards, and history. Cannot be undone.">
          <Button variant="danger" onClick={() => setShowDelete(true)}>
            Delete family…
          </Button>
        </Tooltip>
      </div>
      {exportErr && <div className="text-sm text-rose-600">{exportErr}</div>}

      {showDelete && (
        <DeleteFamilyModal
          familyName={familyName}
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            logout();
            nav("/", { replace: true });
          }}
        />
      )}
    </Card>
  );
}

function DeleteFamilyModal({
  familyName,
  onClose,
  onDeleted,
}: {
  familyName: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: () => api("/family", { method: "DELETE", body: { confirmText } }),
    onSuccess: onDeleted,
    onError: (e: any) => setErr(e.message ?? "Delete failed"),
  });

  const ok = confirmText === familyName;

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete this family?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => del.mutate()} disabled={!ok || del.isPending}>
            {del.isPending ? "Deleting…" : "Permanently delete"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-rose-700 font-semibold">This cannot be undone.</p>
        <p>
          All kids, tasks, completions, rewards, redemptions, ledger entries, challenges, notifications, and
          invitations will be permanently deleted. Caregivers and co-parents will lose access immediately.
        </p>
        <Field label={`Type the family name to confirm: "${familyName}"`}>
          <input
            className={inputCls}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={familyName}
            autoFocus
          />
        </Field>
        {err && <div className="text-rose-600">{err}</div>}
      </div>
    </Modal>
  );
}
