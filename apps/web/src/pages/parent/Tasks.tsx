import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { Badge, Button, Card, EmptyState, Field, PageHeader, inputCls } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { Tooltip } from "../../components/Tooltip";
import type { ChildDTO, TaskCategoryDTO, TaskDTO } from "@chorechampz/shared";
import { useFeatures } from "../../hooks/useFeatures";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Assigned filter URL param: absent/"" = all tasks; otherwise a child UUID.
type AssignedFilter = "all" | string;

export function ParentTasks() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const childIdParam = params.get("childId") ?? "";
  const assignedFilter: AssignedFilter = childIdParam === "" ? "all" : childIdParam;
  const tasksQ = useQuery({ queryKey: ["tasks"], queryFn: () => api<{ tasks: TaskDTO[] }>("/tasks") });
  const childrenQ = useQuery({
    queryKey: ["children"],
    queryFn: () => api<{ children: ChildDTO[] }>("/children"),
  });
  const [editing, setEditing] = useState<TaskDTO | "new" | null>(null);

  // Deep-link from elsewhere: ?new=1 auto-opens the New Task modal, prefilled with
  // the active childId filter as the assignee. Strip the param after consuming so
  // navigating back doesn't reopen the modal.
  useEffect(() => {
    if (params.get("new") === "1") {
      setEditing("new");
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const del = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const duplicate = useMutation({
    mutationFn: (taskId: string) =>
      api<{ created: number }>(`/tasks/${taskId}/duplicate-across-kids`, { method: "POST", body: {} }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      alert(r.created === 0 ? "Every kid already has this task." : `Created ${r.created} copies.`);
    },
  });

  const parentClaim = useMutation({
    mutationFn: (taskId: string) => api(`/tasks/${taskId}/parent-claim`, { method: "POST", body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["missed-opportunities", "recent"] });
    },
    onError: (e: any) => alert(e?.message ?? "Could not claim"),
  });

  function setAssignedFilter(v: AssignedFilter) {
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("childId");
    else next.set("childId", v);
    setParams(next, { replace: true });
  }

  const visibleTasks = (tasksQ.data?.tasks ?? []).filter((t) => {
    if (assignedFilter === "all") return true;
    // Pool and team tasks are visible to every kid, so they belong in every filtered view.
    if (t.assignmentMode === "UP_FOR_GRABS" || t.assignmentMode === "TEAM") return true;
    return t.assignedToId === assignedFilter;
  });

  const filteredChild =
    assignedFilter !== "all" ? childrenQ.data?.children.find((c) => c.id === assignedFilter) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks & Chores"
        subtitle={
          filteredChild ? `Showing tasks for ${filteredChild.name}.` : "One-time and recurring assignments."
        }
        right={
          <Tooltip label="Create a new chore template (one-time or recurring)">
            <Button onClick={() => setEditing("new")}>New task</Button>
          </Tooltip>
        }
      />

      <Card className="p-0 overflow-hidden">
        {(tasksQ.data?.tasks.length ?? 0) === 0 ? (
          <EmptyState title="No tasks yet" hint="Create your first chore." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left p-3 font-medium align-top">
                    <div className="flex flex-col gap-1">
                      <span>Assigned</span>
                      <select
                        className="bg-white border border-slate-300 rounded-md text-xs px-1.5 py-0.5 font-normal text-slate-700"
                        value={assignedFilter}
                        onChange={(e) => setAssignedFilter(e.target.value as AssignedFilter)}
                      >
                        <option value="all">All</option>
                        {childrenQ.data?.children.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className="text-left p-3 font-medium">Title</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-right p-3 font-medium">Credits</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleTasks.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500 text-sm">
                      No tasks match this filter.
                      {assignedFilter !== "all" && (
                        <>
                          {" "}
                          <button
                            className="text-brand-700 font-medium underline"
                            onClick={() => setAssignedFilter("all")}
                          >
                            Clear filter
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )}
                {visibleTasks.map((t) => {
                  const child = childrenQ.data?.children.find((c) => c.id === t.assignedToId);
                  return (
                    <tr key={t.id} className={t.isActive ? "" : "opacity-50"}>
                      <td className="p-3 whitespace-nowrap font-medium">
                        {t.assignmentMode === "UP_FOR_GRABS" ? (
                          <Badge color="amber">🙋 Up for Grabs</Badge>
                        ) : t.assignmentMode === "TEAM" ? (
                          <Badge color="brand">👥 Team</Badge>
                        ) : (
                          (child?.name ?? <span className="text-slate-400">Unknown</span>)
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{t.title}</div>
                        {t.category && <div className="text-xs text-slate-500">{t.category}</div>}
                      </td>
                      <td className="p-3">
                        {t.kind === "ONE_TIME" ? (
                          <Badge>One-time</Badge>
                        ) : (
                          <div className="flex gap-1 flex-wrap">
                            <Badge color="brand">{t.recurrence?.frequency}</Badge>
                            {t.recurrence?.daysOfWeek && (
                              <span className="text-xs text-slate-500">
                                {t.recurrence.daysOfWeek.map((d) => DOW[d]).join(", ")}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-semibold">{t.creditValue} 🪙</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <Tooltip label="Edit task fields, schedule, proof requirement">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                            Edit
                          </Button>
                        </Tooltip>
                        <Tooltip label="Create a copy of this task for every other kid">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Copy "${t.title}" to all other kids?`)) duplicate.mutate(t.id);
                            }}
                            disabled={duplicate.isPending}
                          >
                            Copy to all kids
                          </Button>
                        </Tooltip>
                        <Tooltip label="Claim this task for yourself — kid sees a 'missed opportunity' overlay. No credit awarded.">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Claim "${t.title}" as a Missed Opportunity?`))
                                parentClaim.mutate(t.id);
                            }}
                            disabled={parentClaim.isPending}
                          >
                            I did it
                          </Button>
                        </Tooltip>
                        <Tooltip label="Permanently delete this task (history preserved on ledger)">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => confirm("Delete?") && del.mutate(t.id)}
                          >
                            Delete
                          </Button>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <TaskFormModal
          initial={editing === "new" ? null : editing}
          defaultAssignedToId={editing === "new" ? (filteredChild?.id ?? "") : undefined}
          kids={childrenQ.data?.children ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["tasks"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

export function TaskFormModal({
  initial,
  defaultAssignedToId,
  kids,
  onClose,
  onSaved,
}: {
  initial: TaskDTO | null;
  defaultAssignedToId?: string;
  kids: ChildDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const features = useFeatures();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [creditValue, setCreditValue] = useState(initial?.creditValue ?? 5);
  const [category, setCategory] = useState(initial?.category ?? "");
  const [kind, setKind] = useState<"ONE_TIME" | "RECURRING">(initial?.kind ?? "RECURRING");
  const [frequency, setFrequency] = useState(initial?.recurrence?.frequency ?? "DAILY");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.recurrence?.daysOfWeek ?? []);
  const [proofRequirement, setProofRequirement] = useState(initial?.proofRequirement ?? "NOTES_OPTIONAL");
  const [assignmentMode, setAssignmentMode] = useState<"ASSIGNED" | "UP_FOR_GRABS" | "TEAM">(
    (initial?.assignmentMode as "ASSIGNED" | "UP_FOR_GRABS" | "TEAM" | undefined) ?? "ASSIGNED",
  );
  const [teamSplit, setTeamSplit] = useState<"EVEN" | "FULL">(
    (initial?.teamSplit as "EVEN" | "FULL" | undefined) ?? "EVEN",
  );
  const [missedPenalty, setMissedPenalty] = useState<string>(
    initial?.missedPenalty != null ? String(initial.missedPenalty) : "0",
  );
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const categoriesQ = useQuery({
    queryKey: ["task-categories"],
    queryFn: () => api<{ categories: TaskCategoryDTO[] }>("/task-categories"),
  });
  const [assignedToId, setAssignedToId] = useState(initial?.assignedToId ?? defaultAssignedToId ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [dueByTime, setDueByTime] = useState(initial?.dueByTime ?? "");
  const [dueAt, setDueAt] = useState(initial?.dueAt ? initial.dueAt.slice(0, 16) : "");
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState<string>(
    initial?.defaultDurationMinutes != null ? String(initial.defaultDurationMinutes) : "",
  );

  const save = useMutation({
    mutationFn: async () => {
      const isPool = assignmentMode === "UP_FOR_GRABS" || assignmentMode === "TEAM";
      const body: any = {
        title,
        description: description || undefined,
        creditValue: Number(creditValue),
        category: category || undefined,
        categoryId: categoryId || null,
        kind,
        proofRequirement,
        isActive,
        assignmentMode,
        teamSplit,
        missedPenalty: Math.max(0, Number(missedPenalty) || 0),
        assignedToId: isPool ? null : assignedToId,
        defaultDurationMinutes: defaultDurationMinutes.trim() ? Number(defaultDurationMinutes) : null,
      };
      if (kind === "RECURRING") {
        body.recurrence = {
          frequency,
          ...(frequency !== "DAILY" && { daysOfWeek }),
        };
        body.dueByTime = dueByTime || null;
        body.dueAt = null;
      } else {
        body.recurrence = null;
        body.dueByTime = null;
        body.dueAt = dueAt ? new Date(dueAt).toISOString() : null;
      }
      if (initial) await api(`/tasks/${initial.id}`, { method: "PATCH", body });
      else await api("/tasks", { body });
    },
    onSuccess: onSaved,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit task" : "New task"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !title || (assignmentMode === "ASSIGNED" && !assignedToId)}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required />
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
          <Field label="Credit value">
            <input
              className={inputCls}
              type="number"
              min={0}
              value={creditValue}
              onChange={(e) => setCreditValue(Number(e.target.value))}
            />
          </Field>
          <Field label="Category">
            <input
              className={inputCls}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Kitchen, Outside…"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as any)}>
              <option value="ONE_TIME">One-time</option>
              <option value="RECURRING">Recurring</option>
            </select>
          </Field>
          <Field
            label="Assignment"
            hint="Assigned belongs to one kid. Up for Grabs lets any kid claim it — first to submit wins."
          >
            <div className="flex flex-col gap-1 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="assignmentMode"
                  value="ASSIGNED"
                  checked={assignmentMode === "ASSIGNED"}
                  onChange={() => setAssignmentMode("ASSIGNED")}
                />
                Assigned
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="assignmentMode"
                  value="UP_FOR_GRABS"
                  checked={assignmentMode === "UP_FOR_GRABS"}
                  onChange={() => setAssignmentMode("UP_FOR_GRABS")}
                />
                Up for Grabs
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="assignmentMode"
                  value="TEAM"
                  checked={assignmentMode === "TEAM"}
                  onChange={() => setAssignmentMode("TEAM")}
                />
                Team (multi-kid)
              </label>
            </div>
          </Field>
        </div>
        {assignmentMode === "TEAM" && (
          <Field
            label="Team split"
            hint="EVEN divides credit across joiners (rounded up). FULL gives each joiner the full credit value."
          >
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="teamSplit"
                  value="EVEN"
                  checked={teamSplit === "EVEN"}
                  onChange={() => setTeamSplit("EVEN")}
                />
                Even split
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="teamSplit"
                  value="FULL"
                  checked={teamSplit === "FULL"}
                  onChange={() => setTeamSplit("FULL")}
                />
                Full credit each
              </label>
            </div>
          </Field>
        )}
        <Field
          label="Category"
          hint="Pick from family categories or leave blank. Manage list in Settings → Categories."
        >
          <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— No category —</option>
            {categoriesQ.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Missed penalty (credits)"
          hint="Credits deducted nightly when this RECURRING task is missed. Requires family Penalties setting to be on. 0 = no penalty."
        >
          <input
            className={inputCls}
            type="number"
            min={0}
            value={missedPenalty}
            onChange={(e) => setMissedPenalty(e.target.value)}
          />
        </Field>
        {assignmentMode === "ASSIGNED" && (
          <Field
            label="Assigned to"
            hint="Use 'Copy to all kids' from the table for separate copies per kid."
          >
            <select
              className={inputCls}
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select a kid…
              </option>
              {kids.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === "RECURRING" && (
          <>
            <Field label="Frequency">
              <select
                className={inputCls}
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as any)}
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="CUSTOM">Custom days</option>
              </select>
            </Field>
            {(frequency === "WEEKLY" || frequency === "CUSTOM") && (
              <Field label="Days">
                <div className="flex gap-1">
                  {DOW.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setDaysOfWeek((arr) =>
                          arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i].sort(),
                        )
                      }
                      className={`px-2 py-1 rounded-lg text-xs font-medium border ${
                        daysOfWeek.includes(i)
                          ? "bg-brand-600 text-white border-brand-600"
                          : "bg-white border-slate-300"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field
              label="Due by time"
              hint="Optional. HH:MM (24h) in your family timezone. When set, late submissions earn fewer credits per family settings."
            >
              <input
                className={inputCls}
                type="time"
                value={dueByTime}
                onChange={(e) => setDueByTime(e.target.value)}
              />
            </Field>
          </>
        )}
        {kind === "ONE_TIME" && (
          <Field
            label="Due at"
            hint="Optional deadline. When set, late submissions earn fewer credits per family settings."
          >
            <input
              className={inputCls}
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </Field>
        )}
        <Field
          label="Suggested timer (minutes)"
          hint="Optional. Default duration kid sees when starting a focus timer for this task. 1–240. Leave blank to omit."
        >
          <input
            className={inputCls}
            type="number"
            min={1}
            max={240}
            value={defaultDurationMinutes}
            onChange={(e) => setDefaultDurationMinutes(e.target.value)}
            placeholder="e.g. 15"
          />
        </Field>
        <Field label="Proof requirement">
          <select
            className={inputCls}
            value={proofRequirement}
            onChange={(e) => setProofRequirement(e.target.value as any)}
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
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </div>
    </Modal>
  );
}
