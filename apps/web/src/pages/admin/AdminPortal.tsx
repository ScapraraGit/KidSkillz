import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { Button, Card, PageHeader, inputCls } from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";

interface AdminFamily {
  id: string;
  name: string;
  createdAt: string;
  owner: { id: string; name: string; email: string | null; isActive: boolean } | null;
  parents: { id: string; name: string; email: string | null; isActive: boolean }[];
  counts: { users: number; tasks: number; rewards: number };
}

interface AdminFamilyDetail {
  id: string;
  name: string;
  isBeta: boolean;
  createdAt: string;
  members: {
    id: string;
    role: "PARENT" | "CAREGIVER" | "CHILD";
    name: string;
    email: string | null;
    isActive: boolean;
    isAdmin: boolean;
  }[];
}

interface AdminTask {
  id: string;
  title: string;
  creditValue: number;
  isActive: boolean;
  kind: "ONE_TIME" | "RECURRING";
}

interface AdminReward {
  id: string;
  name: string;
  creditCost: number;
  isActive: boolean;
}

export function AdminPortal() {
  const familiesQ = useQuery({
    queryKey: ["admin", "families"],
    queryFn: () => api<{ families: AdminFamily[] }>("/admin/families"),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = (familiesQ.data?.families ?? []).filter((f) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      (f.owner?.email ?? "").toLowerCase().includes(q) ||
      (f.owner?.name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Admin Portal"
        subtitle="Customer support tools — act on any family. All actions are logged in audit."
      />

      <BetaInviteCard />

      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">Families</h2>
          <input
            className={inputCls + " w-64"}
            placeholder="Filter by name or email…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {familiesQ.isLoading ? (
          <div className="text-slate-500 text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b">
                <tr>
                  <th className="py-2">Family</th>
                  <th className="py-2">Owner</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Members</th>
                  <th className="py-2">Tasks</th>
                  <th className="py-2">Rewards</th>
                  <th className="py-2">Created</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2 font-medium">{f.name}</td>
                    <td className="py-2">{f.owner?.name ?? "—"}</td>
                    <td className="py-2 text-slate-600">{f.owner?.email ?? "—"}</td>
                    <td className="py-2">{f.counts.users}</td>
                    <td className="py-2">{f.counts.tasks}</td>
                    <td className="py-2">{f.counts.rewards}</td>
                    <td className="py-2 text-slate-500">{new Date(f.createdAt).toLocaleDateString()}</td>
                    <td className="py-2">
                      <Tooltip label="Open admin actions for this family" side="left">
                        <Button
                          size="sm"
                          variant={selectedId === f.id ? "secondary" : "primary"}
                          onClick={() => setSelectedId(selectedId === f.id ? null : f.id)}
                        >
                          {selectedId === f.id ? "Close" : "Manage"}
                        </Button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-slate-500">
                      No families match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedId && <FamilyDetail familyId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function FamilyDetail({ familyId, onClose }: { familyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ["admin", "family", familyId],
    queryFn: () => api<{ family: AdminFamilyDetail }>(`/admin/families/${familyId}`),
  });
  const [name, setName] = useState("");
  const [nameInit, setNameInit] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  if (detailQ.data && !nameInit) {
    setName(detailQ.data.family.name);
    setNameInit(true);
  }

  const renameM = useMutation({
    mutationFn: (n: string) =>
      api<{ family: { id: string; name: string } }>(`/admin/families/${familyId}`, {
        method: "PATCH",
        body: { name: n },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "families"] });
      qc.invalidateQueries({ queryKey: ["admin", "family", familyId] });
    },
  });

  const betaM = useMutation({
    mutationFn: (isBeta: boolean) =>
      api<{ family: { id: string; isBeta: boolean } }>(`/admin/families/${familyId}/beta`, {
        method: "PATCH",
        body: { isBeta },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "family", familyId] });
    },
  });

  const resetM = useMutation({
    mutationFn: (args: { userId: string; password: string }) =>
      api<{ ok: true }>(`/admin/users/${args.userId}/reset-password`, {
        method: "POST",
        body: { password: args.password },
      }),
    onSuccess: () => {
      setResetMsg("Password updated. Communicate it to the user securely.");
      setResetPw("");
      setResetUserId(null);
    },
    onError: (e: Error) => setResetMsg(e.message),
  });

  if (detailQ.isLoading) return <Card>Loading family…</Card>;
  if (!detailQ.data) return null;
  const family = detailQ.data.family;

  return (
    <Card className="mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">{family.name}</h2>
          <p className="text-xs text-slate-500">id: {family.id}</p>
        </div>
        <Tooltip label="Close family panel" side="left">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </Tooltip>
      </div>

      {/* Rename */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-1">Family name</label>
        <div className="flex gap-2">
          <input className={inputCls + " flex-1"} value={name} onChange={(e) => setName(e.target.value)} />
          <Tooltip label="Save new family name (typo/divorce/etc.)" side="left">
            <Button
              onClick={() => renameM.mutate(name)}
              disabled={renameM.isPending || name === family.name || name.trim().length < 2}
            >
              {renameM.isPending ? "Saving…" : "Save name"}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Beta enrollment */}
      <div className="mb-6 rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-800">Beta program</div>
          <div className="text-xs text-slate-500">
            When enabled, parents in this family see the dashboard beta banner and can access the feedback
            form. Caregivers + kids are unaffected.
          </div>
        </div>
        <Tooltip
          label={
            family.isBeta
              ? "Turn off beta surfaces for this family"
              : "Enroll this family in the beta program"
          }
          side="left"
        >
          <span className="inline-flex">
            <Button
              size="sm"
              variant={family.isBeta ? "secondary" : "primary"}
              onClick={() => betaM.mutate(!family.isBeta)}
              disabled={betaM.isPending}
            >
              {betaM.isPending ? "Saving…" : family.isBeta ? "Disable beta" : "Enroll in beta"}
            </Button>
          </span>
        </Tooltip>
      </div>

      {/* Members + password reset */}
      <div className="mb-6">
        <h3 className="font-semibold mb-2">Members</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b">
            <tr>
              <th className="py-2">Name</th>
              <th className="py-2">Role</th>
              <th className="py-2">Email</th>
              <th className="py-2">Active</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {family.members.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-2">
                  {m.name}
                  {m.isAdmin && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                      admin
                    </span>
                  )}
                </td>
                <td className="py-2">{m.role}</td>
                <td className="py-2 text-slate-600">{m.email ?? "—"}</td>
                <td className="py-2">{m.isActive ? "yes" : "no"}</td>
                <td className="py-2">
                  {m.role !== "CHILD" && (
                    <Tooltip label="Set a temporary password for this user" side="left">
                      <Button size="sm" variant="secondary" onClick={() => setResetUserId(m.id)}>
                        Reset password
                      </Button>
                    </Tooltip>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {resetUserId && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm mb-2">
              New password for <strong>{family.members.find((m) => m.id === resetUserId)?.email}</strong>
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                className={inputCls + " flex-1"}
                placeholder="New password (min 8 chars)"
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
              />
              <Button
                variant="danger"
                disabled={resetPw.length < 8 || resetM.isPending}
                onClick={() => resetM.mutate({ userId: resetUserId, password: resetPw })}
              >
                {resetM.isPending ? "Setting…" : "Set password"}
              </Button>
              <Button variant="ghost" onClick={() => setResetUserId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {resetMsg && <p className="mt-2 text-sm text-slate-700">{resetMsg}</p>}
      </div>

      <AdminTasksSection familyId={familyId} />
      <AdminRewardsSection familyId={familyId} />
    </Card>
  );
}

function AdminTasksSection({ familyId }: { familyId: string }) {
  const qc = useQueryClient();
  const [editEnabled, setEditEnabled] = useState(false);
  const tasksQ = useQuery({
    queryKey: ["admin", "family-tasks", familyId],
    queryFn: () => api<{ tasks: AdminTask[] }>(`/admin/families/${familyId}/tasks`),
  });
  const patchM = useMutation({
    mutationFn: (args: { id: string; patch: Partial<AdminTask> }) =>
      api(`/admin/families/${familyId}/tasks/${args.id}`, { method: "PATCH", body: args.patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "family-tasks", familyId] }),
  });
  const delM = useMutation({
    mutationFn: (id: string) => api(`/admin/families/${familyId}/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "family-tasks", familyId] }),
  });

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Tasks ({tasksQ.data?.tasks.length ?? 0})</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={editEnabled} onChange={(e) => setEditEnabled(e.target.checked)} />
          Enable edit (act on parent's behalf)
        </label>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-500 border-b">
          <tr>
            <th className="py-2">Title</th>
            <th className="py-2">Credits</th>
            <th className="py-2">Kind</th>
            <th className="py-2">Active</th>
            {editEnabled && <th className="py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {(tasksQ.data?.tasks ?? []).map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              editEnabled={editEnabled}
              onPatch={(patch) => patchM.mutate({ id: t.id, patch })}
              onDelete={() => {
                if (confirm(`Delete task "${t.title}"? This cannot be undone.`)) delM.mutate(t.id);
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskRow({
  task,
  editEnabled,
  onPatch,
  onDelete,
}: {
  task: AdminTask;
  editEnabled: boolean;
  onPatch: (p: Partial<AdminTask>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [credit, setCredit] = useState(task.creditValue);
  const dirty = title !== task.title || credit !== task.creditValue;
  return (
    <tr className="border-b last:border-0">
      <td className="py-2">
        {editEnabled ? (
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        ) : (
          task.title
        )}
      </td>
      <td className="py-2">
        {editEnabled ? (
          <input
            type="number"
            className={inputCls + " w-24"}
            value={credit}
            onChange={(e) => setCredit(parseInt(e.target.value || "0", 10))}
          />
        ) : (
          task.creditValue
        )}
      </td>
      <td className="py-2">{task.kind}</td>
      <td className="py-2">
        {editEnabled ? (
          <input
            type="checkbox"
            checked={task.isActive}
            onChange={(e) => onPatch({ isActive: e.target.checked })}
          />
        ) : task.isActive ? (
          "yes"
        ) : (
          "no"
        )}
      </td>
      {editEnabled && (
        <td className="py-2 flex gap-2">
          {dirty && (
            <Button size="sm" onClick={() => onPatch({ title, creditValue: credit })}>
              Save
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </td>
      )}
    </tr>
  );
}

function AdminRewardsSection({ familyId }: { familyId: string }) {
  const qc = useQueryClient();
  const [editEnabled, setEditEnabled] = useState(false);
  const rewardsQ = useQuery({
    queryKey: ["admin", "family-rewards", familyId],
    queryFn: () => api<{ rewards: AdminReward[] }>(`/admin/families/${familyId}/rewards`),
  });
  const patchM = useMutation({
    mutationFn: (args: { id: string; patch: Partial<AdminReward> }) =>
      api(`/admin/families/${familyId}/rewards/${args.id}`, { method: "PATCH", body: args.patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "family-rewards", familyId] }),
  });
  const delM = useMutation({
    mutationFn: (id: string) => api(`/admin/families/${familyId}/rewards/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "family-rewards", familyId] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Rewards ({rewardsQ.data?.rewards.length ?? 0})</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={editEnabled} onChange={(e) => setEditEnabled(e.target.checked)} />
          Enable edit (act on parent's behalf)
        </label>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-500 border-b">
          <tr>
            <th className="py-2">Name</th>
            <th className="py-2">Cost</th>
            <th className="py-2">Active</th>
            {editEnabled && <th className="py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {(rewardsQ.data?.rewards ?? []).map((r) => (
            <RewardRow
              key={r.id}
              reward={r}
              editEnabled={editEnabled}
              onPatch={(patch) => patchM.mutate({ id: r.id, patch })}
              onDelete={() => {
                if (confirm(`Delete reward "${r.name}"?`)) delM.mutate(r.id);
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RewardRow({
  reward,
  editEnabled,
  onPatch,
  onDelete,
}: {
  reward: AdminReward;
  editEnabled: boolean;
  onPatch: (p: Partial<AdminReward>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(reward.name);
  const [cost, setCost] = useState(reward.creditCost);
  const dirty = name !== reward.name || cost !== reward.creditCost;
  return (
    <tr className="border-b last:border-0">
      <td className="py-2">
        {editEnabled ? (
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          reward.name
        )}
      </td>
      <td className="py-2">
        {editEnabled ? (
          <input
            type="number"
            className={inputCls + " w-24"}
            value={cost}
            onChange={(e) => setCost(parseInt(e.target.value || "0", 10))}
          />
        ) : (
          reward.creditCost
        )}
      </td>
      <td className="py-2">
        {editEnabled ? (
          <input
            type="checkbox"
            checked={reward.isActive}
            onChange={(e) => onPatch({ isActive: e.target.checked })}
          />
        ) : reward.isActive ? (
          "yes"
        ) : (
          "no"
        )}
      </td>
      {editEnabled && (
        <td className="py-2 flex gap-2">
          {dirty && (
            <Button size="sm" onClick={() => onPatch({ name, creditCost: cost })}>
              Save
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </td>
      )}
    </tr>
  );
}

function BetaInviteCard() {
  const [emailsText, setEmailsText] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ sent: number; failed: { to: string; error?: string }[] } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: (payload: { emails: string[]; recipientName?: string }) =>
      api<{ sent: number; failed: { to: string; error?: string }[] }>("/admin/beta/invite", {
        method: "POST",
        body: payload,
      }),
    onSuccess: (data) => {
      setResult(data);
      setErr(null);
      setEmailsText("");
    },
    onError: (e: any) => setErr(e?.message ?? "Failed"),
  });

  function onSend() {
    setErr(null);
    setResult(null);
    const emails = emailsText
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (emails.length === 0) {
      setErr("Add at least one email.");
      return;
    }
    if (emails.length > 50) {
      setErr("Max 50 emails per send.");
      return;
    }
    send.mutate({ emails, recipientName: name.trim() || undefined });
  }

  return (
    <Card className="mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold text-slate-800">Beta invite blast</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Send the beta-invite email to one or more recipients. Up to 50 per send.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <span className="block text-sm font-medium text-slate-700 mb-1">Emails</span>
          <textarea
            className={inputCls}
            rows={3}
            placeholder="alice@example.com, bob@example.com"
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">Separate with commas, spaces, or newlines.</p>
        </div>
        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1">Recipient name (optional)</span>
          <input
            className={inputCls}
            placeholder="e.g. Alice"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <p className="text-xs text-slate-500 mt-1">Used in greeting. Blank = "Hi there".</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <Tooltip label="Send beta invite emails now">
          <span className="inline-flex">
            <Button onClick={onSend} disabled={send.isPending}>
              {send.isPending ? "Sending..." : "Send invites"}
            </Button>
          </span>
        </Tooltip>
        {err && <span className="text-sm text-rose-700">{err}</span>}
        {result && (
          <span className="text-sm text-emerald-700">
            Sent {result.sent}
            {result.failed.length > 0 ? ` - ${result.failed.length} failed` : ""}.
          </span>
        )}
      </div>
      {result && result.failed.length > 0 && (
        <ul className="mt-2 text-xs text-rose-700 list-disc pl-5">
          {result.failed.map((f) => (
            <li key={f.to}>
              {f.to}
              {f.error ? ` - ${f.error}` : ""}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
