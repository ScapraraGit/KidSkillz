import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button, Card, Field, inputCls } from "../components/ui";
import { getDeviceSession } from "../lib/deviceToken";
import type { AuthUserDTO, FamilySettings } from "@chorechampz/shared";

interface FamilyLookup {
  id: string;
  name: string;
}

/**
 * Caregiver sign-in. Two flows:
 *   - Paired device: device token authenticates family scope, caregiver enters
 *     name + PIN. POST /v1/auth/caregiver/pin-login.
 *   - Unpaired device (legacy): family name + 6-char code looks up familyId,
 *     then PIN via /v1/invitations/pin-login. Refused server-side when
 *     DEVICE_PAIRING_ENABLED.
 */
export function CaregiverPin() {
  const nav = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);

  const device = getDeviceSession();

  // Legacy lookup state — only used when there's no paired device.
  const [familyName, setFamilyName] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [familyId, setFamilyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onPaired = !!device?.token;

  const lookup = async () => {
    setErr(null);
    try {
      const r = await api<{ family: FamilyLookup }>(`/auth/families/lookup`, {
        method: "POST",
        body: { name: familyName, familyCode: familyCode.toUpperCase() },
      });
      setFamilyId(r.family.id);
    } catch (e: any) {
      if (e?.status === 404) {
        setErr("No matching family. Check the name and 6-character code.");
      } else {
        setErr(e?.message ?? "Lookup failed");
      }
    }
  };

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (onPaired) {
        // Device-scoped path. Family comes from the device token header, set
        // automatically by lib/api.ts.
        const r = await api<{ token: string; refreshToken?: string; user: AuthUserDTO }>(
          "/auth/caregiver/pin-login",
          { body: { pin, name: name || undefined } },
        );
        setSession(r.token, r.user, r.refreshToken ?? null);
      } else {
        if (!familyId) throw new Error("Find the family first");
        const r = await api<{ token: string; user: AuthUserDTO }>("/invitations/pin-login", {
          body: { familyId, pin, name: name || undefined },
        });
        setSession(r.token, r.user);
      }
      const me = await api<{ settings: FamilySettings }>("/auth/me");
      setSettings(me.settings);
      nav("/parent");
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 404 && e.code === "NOT_FOUND") {
        // Server told us the legacy path is disabled — funnel user to /pair.
        setErr("Pair this device first, then sign in here.");
      } else {
        setErr(e?.message ?? "Invalid PIN");
      }
    } finally {
      setBusy(false);
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
          {onPaired ? (
            // Paired device: skip family lookup entirely. Device label shown for context.
            <>
              <div className="text-xs text-slate-500">
                Device: <strong>{device!.label}</strong>
              </div>
              <form className="space-y-3" onSubmit={submitPin}>
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
              </form>
            </>
          ) : !familyId ? (
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
              <div className="text-center text-xs text-slate-500 pt-1">
                On a tablet the parent already paired?{" "}
                <button type="button" className="text-brand-600 hover:underline" onClick={() => nav("/pair")}>
                  Pair this device
                </button>
              </div>
            </>
          ) : (
            <form className="space-y-3" onSubmit={submitPin}>
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
