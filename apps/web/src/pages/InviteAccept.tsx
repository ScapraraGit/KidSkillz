import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button, Card, Field, inputCls } from "../components/ui";
import type { AuthUserDTO, FamilySettings, InvitationKind } from "@chorechampz/shared";

interface Preview {
  kind: InvitationKind;
  familyName: string | null;
  email: string | null;
  inviteeName: string | null;
  validFrom: string | null;
  validUntil: string | null;
  expiresAt: string;
}

export function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const nav = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<Preview>(`/invitations/by-token/${token}`)
      .then((p) => {
        setPreview(p);
        if (p.inviteeName) setName(p.inviteeName);
      })
      .catch((e) => setErr(e.message ?? "Invitation not found"));
  }, [token]);

  if (err && !preview) {
    return (
      <Shell>
        <Card>
          <div className="text-rose-600 font-medium">{err}</div>
          <p className="text-sm text-slate-500 mt-2">Ask whoever invited you for a new link.</p>
        </Card>
      </Shell>
    );
  }
  if (!preview)
    return (
      <Shell>
        <Card>Loading…</Card>
      </Shell>
    );

  const isCaregiver = preview.kind === "CAREGIVER";

  return (
    <Shell>
      <Card>
        <h2 className="text-xl font-semibold">Join {preview.familyName ?? "this family"}</h2>
        <p className="text-sm text-slate-500 mt-1">
          {isCaregiver ? "You've been invited as a caregiver" : "You've been invited as a co-parent"}
          {preview.email && <> · {preview.email}</>}
        </p>
        {isCaregiver && preview.validUntil && (
          <p className="text-sm text-amber-700 mt-2">
            Access window: {preview.validFrom ? new Date(preview.validFrom).toLocaleDateString() : "now"} →{" "}
            {new Date(preview.validUntil).toLocaleDateString()}
          </p>
        )}
        <form
          className="space-y-3 mt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            if (password !== confirm) {
              setErr("Passwords don't match");
              return;
            }
            if (password.length < 8) {
              setErr("Password must be at least 8 characters");
              return;
            }
            setBusy(true);
            try {
              const r = await api<{ token: string; user: AuthUserDTO }>(
                `/invitations/by-token/${token}/accept`,
                { body: { name, password } },
              );
              setSession(r.token, r.user);
              const me = await api<{ settings: FamilySettings }>("/auth/me");
              setSettings(me.settings);
              nav("/parent");
            } catch (e: any) {
              setErr(e.message ?? "Could not accept invitation");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Your name">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </Field>
          <Field label="Create password">
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <Field label="Confirm password">
            <input
              className={inputCls}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          {err && <div className="text-sm text-rose-600">{err}</div>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Joining…" : "Accept and create account"}
          </Button>
        </form>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl">🪙</div>
          <h1 className="text-3xl font-bold mt-2 tracking-tight">ChoreChampz</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
