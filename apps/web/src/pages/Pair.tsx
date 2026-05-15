import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { setDeviceSession } from "../lib/deviceToken";
import { Button, Card, Field, inputCls } from "../components/ui";

interface RedeemResponse {
  deviceToken: string;
  deviceId: string;
  familyId: string;
  label: string;
}

function useQueryParam(name: string): string | null {
  const { search } = useLocation();
  return new URLSearchParams(search).get(name);
}

export function Pair() {
  const nav = useNavigate();
  const nonce = useQueryParam("nonce");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paired, setPaired] = useState<string | null>(null);

  const redeem = async (body: { pairingCode?: string; qrNonce?: string }) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<RedeemResponse>("/auth/devices/redeem", { method: "POST", body });
      setDeviceSession({ token: r.deviceToken, familyId: r.familyId, label: r.label });
      setPaired(r.label);
      setTimeout(() => nav("/login"), 1200);
    } catch (e: any) {
      setErr(e.message ?? "Pairing failed");
    } finally {
      setBusy(false);
    }
  };

  // Auto-redeem when the page loads from a QR link.
  useEffect(() => {
    if (nonce) void redeem({ qrNonce: nonce });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl">🔗</div>
          <h1 className="text-2xl font-bold mt-2">Pair this device</h1>
          <p className="text-slate-500 text-sm mt-1">
            Ask a parent to open Settings → Devices and tap "Pair new device".
          </p>
        </div>
        <Card>
          {paired ? (
            <div className="text-sm text-emerald-700">
              Paired as <strong>{paired}</strong>. Redirecting…
            </div>
          ) : nonce ? (
            <div className="text-sm text-slate-600">
              {busy ? "Pairing this device…" : err ? <span className="text-rose-600">{err}</span> : null}
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim().length === 0) return;
                void redeem({ pairingCode: code.trim() });
              }}
            >
              <Field label="Pairing code" hint="8 characters, like ABCD-EFGH">
                <input
                  className={inputCls}
                  placeholder="ABCD-EFGH"
                  autoFocus
                  maxLength={12}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </Field>
              {err && <div className="text-sm text-rose-600">{err}</div>}
              <Button type="submit" className="w-full" disabled={busy || code.length < 8}>
                {busy ? "Pairing…" : "Pair device"}
              </Button>
              <p className="text-xs text-center text-slate-500 pt-1">
                Codes expire 10 minutes after they are issued.
              </p>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
