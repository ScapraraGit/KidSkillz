import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { Card, Button } from "../components/ui";
import type { AuthUserDTO, FamilySettings } from "@chorechampz/shared";

interface FamilyOption {
  familyId: string;
  familyName: string;
  membershipId: string | null;
  role: string;
  isBillingOwner: boolean;
}

type CompleteResponse =
  | {
      needsFamilySelect?: false;
      token: string;
      refreshToken?: string;
      refreshExpiresAt?: string;
      user: AuthUserDTO;
    }
  | {
      needsFamilySelect: true;
      selectToken: string;
      families: FamilyOption[];
    };

export function OAuthComplete() {
  const [params] = useSearchParams();
  const ticket = params.get("ticket");
  const provider = params.get("provider") ?? "google";
  const nav = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);
  const [err, setErr] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ selectToken: string; families: FamilyOption[] } | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!ticket) {
      setErr("Missing ticket — try signing in again.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api<CompleteResponse>("/auth/oauth/complete", {
          body: { ticket },
        });
        if (cancelled) return;
        if (r.needsFamilySelect === true) {
          setPicker({ selectToken: r.selectToken, families: r.families });
          return;
        }
        setSession(r.token, r.user, r.refreshToken ?? null);
        const me = await api<{ settings: FamilySettings }>("/auth/me");
        setSettings(me.settings);
        nav("/parent", { replace: true });
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? "Sign-in failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket, nav, setSession, setSettings]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card>
          {!err && !picker && (
            <div className="text-center py-6 text-slate-600">Signing you in with {provider}…</div>
          )}
          {picker && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Pick a family</h2>
              <p className="text-sm text-slate-600">You belong to multiple families. Pick the one to open:</p>
              {picker.families.map((f) => (
                <button
                  key={f.familyId}
                  type="button"
                  disabled={working}
                  onClick={async () => {
                    setErr(null);
                    setWorking(true);
                    try {
                      const r = await api<{
                        token: string;
                        refreshToken?: string;
                        user: AuthUserDTO;
                      }>("/auth/select-family", {
                        body: { selectToken: picker.selectToken, familyId: f.familyId },
                      });
                      setSession(r.token, r.user, r.refreshToken ?? null);
                      const me = await api<{ settings: FamilySettings }>("/auth/me");
                      setSettings(me.settings);
                      nav("/parent", { replace: true });
                    } catch (e: any) {
                      setErr(e?.message ?? "Failed to open family");
                      setWorking(false);
                    }
                  }}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-brand-400 hover:bg-brand-50/40 disabled:opacity-50"
                >
                  <div className="font-semibold">{f.familyName}</div>
                  <div className="text-xs text-slate-500">
                    {f.role}
                    {f.isBillingOwner ? " · billing owner" : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
          {err && (
            <div className="space-y-3">
              <div className="text-sm text-rose-600">{err}</div>
              <Button onClick={() => nav("/login", { replace: true })} className="w-full">
                Back to sign in
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
