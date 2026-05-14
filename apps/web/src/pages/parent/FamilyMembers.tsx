import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { Badge, Button, Card, Field, PageHeader, inputCls } from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";
import type { CaregiverScope, InvitationDTO } from "@chorechampz/shared";

const DEFAULT_SCOPE: CaregiverScope = {
  canApproveTasks: true,
  canApproveRedemptions: true,
  canApproveInitiatives: true,
  canViewLedger: true,
  kidIds: [],
};

type FormMode = "NONE" | "CO_PARENT" | "CAREGIVER" | "CAREGIVER_PIN";

export function FamilyMembers() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<FormMode>("NONE");
  const [lastResult, setLastResult] = useState<{ pin?: string; acceptUrl?: string } | null>(null);

  const invitationsQ = useQuery({
    queryKey: ["invitations"],
    queryFn: () => api<{ invitations: InvitationDTO[] }>("/invitations"),
  });

  const membersQ = useQuery({
    queryKey: ["family-members"],
    queryFn: () =>
      api<{
        members: {
          id: string;
          name: string;
          email: string | null;
          role: string;
          validUntil: string | null;
        }[];
      }>("/family/members").catch(() => ({ members: [] })),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/invitations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invitations"] }),
  });

  const pending = (invitationsQ.data?.invitations ?? []).filter((i) => i.status === "PENDING");
  // Recent history rolls off after 5 days. Cutoff measured against the most relevant
  // timestamp per row (acceptedAt for ACCEPTED, expiresAt for EXPIRED, createdAt for REVOKED).
  const HISTORY_WINDOW_MS = 5 * 24 * 3600_000;
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  const history = (invitationsQ.data?.invitations ?? [])
    .filter((i) => i.status !== "PENDING")
    .filter((i) => {
      const ts = new Date(i.acceptedAt ?? i.expiresAt ?? i.createdAt).getTime();
      return ts >= cutoff;
    })
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Family members"
        subtitle="Invite a co-parent, or give a grandparent or sitter scoped access for a few days."
        right={
          mode === "NONE" ? (
            <div className="flex gap-2">
              <Tooltip label="Invite a co-parent with full access (email link)">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMode("CO_PARENT");
                    setLastResult(null);
                  }}
                >
                  Add Parent
                </Button>
              </Tooltip>
              <Tooltip label="Invite a grandparent or sitter with scoped, time-boxed access">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMode("CAREGIVER");
                    setLastResult(null);
                  }}
                >
                  Invite caregiver
                </Button>
              </Tooltip>
              <Tooltip label="Generate a one-time PIN for a sitter — no email needed">
                <Button
                  onClick={() => {
                    setMode("CAREGIVER_PIN");
                    setLastResult(null);
                  }}
                >
                  Generate PIN
                </Button>
              </Tooltip>
            </div>
          ) : (
            <Button
              variant="ghost"
              onClick={() => {
                setMode("NONE");
                setLastResult(null);
              }}
            >
              Cancel
            </Button>
          )
        }
      />

      {lastResult && (
        <Card className="bg-amber-50 border-amber-200">
          <h3 className="font-semibold text-amber-900">Save this — shown once</h3>
          {lastResult.pin && (
            <div className="mt-2">
              <div className="text-sm text-amber-900">PIN for caregiver to sign in:</div>
              <div className="text-3xl font-bold tracking-widest mt-1">{lastResult.pin}</div>
              <div className="text-xs text-amber-800 mt-2">
                Caregiver enters at /caregiver/pin with your family name.
              </div>
            </div>
          )}
          {lastResult.acceptUrl && (
            <div className="mt-2 text-sm">
              <div className="text-amber-900">Accept link (also emailed):</div>
              <div className="font-mono text-xs break-all mt-1 bg-white p-2 rounded">
                {lastResult.acceptUrl}
              </div>
            </div>
          )}
        </Card>
      )}

      {mode === "CO_PARENT" && (
        <CoParentForm
          onDone={(r) => {
            setLastResult(r);
            setMode("NONE");
            qc.invalidateQueries({ queryKey: ["invitations"] });
          }}
        />
      )}
      {mode === "CAREGIVER" && (
        <CaregiverEmailForm
          onDone={(r) => {
            setLastResult(r);
            setMode("NONE");
            qc.invalidateQueries({ queryKey: ["invitations"] });
          }}
        />
      )}
      {mode === "CAREGIVER_PIN" && (
        <CaregiverPinForm
          onDone={(r) => {
            setLastResult(r);
            setMode("NONE");
            qc.invalidateQueries({ queryKey: ["invitations"] });
          }}
        />
      )}

      <Card>
        <h3 className="font-semibold mb-3">Current members</h3>
        {membersQ.isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : membersQ.data && membersQ.data.members.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {membersQ.data.members.map((m) => (
              <li key={m.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-slate-500">{m.email ?? "—"}</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge color={m.role === "PARENT" ? "brand" : m.role === "CAREGIVER" ? "amber" : "slate"}>
                    {m.role}
                  </Badge>
                  {m.validUntil && (
                    <span className="text-slate-500">until {new Date(m.validUntil).toLocaleString()}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-slate-500">Just you so far.</div>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold mb-3">Pending invitations</h3>
        {pending.length === 0 ? (
          <div className="text-sm text-slate-500">No pending invitations.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((inv) => (
              <li key={inv.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{inv.inviteeName ?? inv.email ?? "Caregiver PIN"}</div>
                  <div className="text-xs text-slate-500">
                    {inv.kind === "CO_PARENT" && "Co-parent"}
                    {inv.kind === "CAREGIVER" && `Caregiver · ${formatRange(inv.validFrom, inv.validUntil)}`}
                    {inv.kind === "CAREGIVER_PIN" &&
                      `PIN handoff · expires ${new Date(inv.expiresAt).toLocaleString()}`}
                  </div>
                </div>
                <Tooltip label="Cancel this invitation. PIN/link stops working immediately.">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke.mutate(inv.id)}
                    disabled={revoke.isPending}
                  >
                    Revoke
                  </Button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {history.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Recent history</h3>
            <span className="text-xs text-slate-500">Last 5 days</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {history.map((inv) => (
              <li key={inv.id} className="py-2 flex items-center justify-between text-sm">
                <span>
                  {inv.inviteeName ?? inv.email ?? "PIN"} · {inv.kind}
                </span>
                <Badge color={inv.status === "ACCEPTED" ? "emerald" : "slate"}>{inv.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function formatRange(from: string | null, to: string | null) {
  const fromStr = from ? new Date(from).toLocaleDateString() : "now";
  const toStr = to ? new Date(to).toLocaleDateString() : "—";
  return `${fromStr} → ${toStr}`;
}

function CoParentForm({ onDone }: { onDone: (r: { acceptUrl?: string }) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <h3 className="font-semibold mb-3">Add Parent</h3>
      <p className="text-sm text-slate-500 mb-4">
        Full access. They sign up via the emailed link and pick their own password.
      </p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setBusy(true);
          try {
            const r = await api<{ acceptUrl: string }>("/invitations", {
              body: { kind: "CO_PARENT", email, inviteeName: name || undefined },
            });
            onDone({ acceptUrl: r.acceptUrl });
          } catch (e: any) {
            setErr(e.message ?? "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Email">
          <input
            title="Email"
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Their name (optional)">
          <input
            title="Their name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </Field>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send invitation"}
        </Button>
      </form>
    </Card>
  );
}

function CaregiverEmailForm({ onDone }: { onDone: (r: { acceptUrl?: string }) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10));
  const [scope, setScope] = useState<CaregiverScope>(DEFAULT_SCOPE);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <h3 className="font-semibold mb-3">Invite caregiver (e.g. grandparent)</h3>
      <p className="text-sm text-slate-500 mb-4">
        Scoped, time-boxed access. They create their own login on their device.
      </p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setBusy(true);
          try {
            const r = await api<{ acceptUrl: string }>("/invitations", {
              body: {
                kind: "CAREGIVER",
                email,
                inviteeName: name,
                validFrom: new Date(from + "T00:00:00").toISOString(),
                validUntil: new Date(to + "T23:59:59").toISOString(),
                scope,
              },
            });
            onDone({ acceptUrl: r.acceptUrl });
          } catch (e: any) {
            setErr(e.message ?? "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Their name">
            <input
              title="Their name"
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </Field>
          <Field label="Email">
            <input
              title="Email"
              className={inputCls}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Access starts">
            <input
              title="Access starts"
              className={inputCls}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
            />
          </Field>
          <Field label="Access ends">
            <input
              title="Access ends"
              className={inputCls}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
          </Field>
        </div>
        <ScopeEditor scope={scope} onChange={setScope} />
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send invitation"}
        </Button>
      </form>
    </Card>
  );
}

function CaregiverPinForm({ onDone }: { onDone: (r: { pin?: string }) => void }) {
  const [name, setName] = useState("");
  const [hours, setHours] = useState(24);
  const [scope, setScope] = useState<CaregiverScope>(DEFAULT_SCOPE);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <h3 className="font-semibold mb-3">Generate PIN for a sitter</h3>
      <p className="text-sm text-slate-500 mb-4">
        One-time PIN. Single use. Sitter signs in on any device at <code>/caregiver/pin</code>.
      </p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setBusy(true);
          try {
            const r = await api<{ pin: string }>("/invitations", {
              body: {
                kind: "CAREGIVER_PIN",
                inviteeName: name,
                validUntil: new Date(Date.now() + hours * 3600_000).toISOString(),
                scope,
              },
            });
            onDone({ pin: r.pin });
          } catch (e: any) {
            setErr(e.message ?? "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Sitter's name">
            <input
              title="Sitter's name"
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </Field>
          <Field label="Valid for (hours)">
            <input
              title="Valid for (hours)"
              className={inputCls}
              type="number"
              min={1}
              max={168}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              required
            />
          </Field>
        </div>
        <ScopeEditor scope={scope} onChange={setScope} />
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <Button type="submit" disabled={busy}>
          {busy ? "Generating…" : "Generate PIN"}
        </Button>
      </form>
    </Card>
  );
}

function ScopeEditor({ scope, onChange }: { scope: CaregiverScope; onChange: (s: CaregiverScope) => void }) {
  return (
    <div className="border-t border-slate-200 pt-3 space-y-2">
      <div className="text-sm font-medium text-slate-700">Permissions</div>
      {(["canApproveTasks", "canApproveRedemptions", "canApproveInitiatives", "canViewLedger"] as const).map(
        (k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              title={labelFor(k)}
              checked={scope[k]}
              onChange={(e) => onChange({ ...scope, [k]: e.target.checked })}
            />
            {labelFor(k)}
          </label>
        ),
      )}
    </div>
  );
}

function labelFor(k: keyof CaregiverScope): string {
  switch (k) {
    case "canApproveTasks":
      return "Approve chore completions";
    case "canApproveRedemptions":
      return "Approve reward redemptions";
    case "canApproveInitiatives":
      return "Approve initiative requests";
    case "canViewLedger":
      return "View credit ledger";
    default:
      return k;
  }
}
