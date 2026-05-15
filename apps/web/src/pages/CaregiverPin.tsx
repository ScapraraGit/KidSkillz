import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button, Card, Field, inputCls } from "../components/ui";
import type { AuthUserDTO, FamilySettings } from "@chorechampz/shared";

interface FamilyLookup {
  id: string;
  name: string;
}

export function CaregiverPin() {
  const nav = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);
  const [familyName, setFamilyName] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    setErr(null);
    try {
      const r = await api<{ family: FamilyLookup }>(`/auth/families/lookup`, {
        method: "POST",
        body: { name: familyName, familyCode: familyCode.toUpperCase() },
      });
      setFamilyId(r.family.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-brand-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl">🪙</div>
          <h1 className="text-3xl font-bold mt-2 tracking-tight">Caregiver sign-in</h1>
          <p className="text-slate-500 text-sm mt-1">Use the PIN the parent gave you.</p>
        </div>
        <Card className="space-y-3">
          {!familyId ? (
            <>
              <Field label="Family name">
                <input
                  className={inputCls}
                  placeholder="Family name"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                />
              </Field>
              <Field label="Family code">
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    maxLength={6}
                    value={familyCode}
                    onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
                    placeholder="6-char code"
                  />
                  <Button type="button" variant="secondary" onClick={lookup}>
                    Find
                  </Button>
                </div>
              </Field>
              {err && <div className="text-sm text-rose-600">{err}</div>}
            </>
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setErr(null);
                setBusy(true);
                try {
                  const r = await api<{ token: string; user: AuthUserDTO }>("/invitations/pin-login", {
                    body: { familyId, pin, name: name || undefined },
                  });
                  setSession(r.token, r.user);
                  const me = await api<{ settings: FamilySettings }>("/auth/me");
                  setSettings(me.settings);
                  nav("/parent");
                } catch (e: any) {
                  setErr(e.message ?? "Invalid PIN");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Your name (shown on history)">
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Grandma Jane"
                  maxLength={80}
                />
              </Field>
              <Field label="PIN">
                <input
                  className={inputCls}
                  autoFocus
                  inputMode="numeric"
                  pattern="\d{4,8}"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </Field>
              {err && <div className="text-sm text-rose-600">{err}</div>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <button type="button" className="text-xs text-slate-500" onClick={() => setFamilyId(null)}>
                ← change family
              </button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
