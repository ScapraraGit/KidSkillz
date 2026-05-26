import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button, Card, Field, inputCls } from "../components/ui";
import { CURRENT_TERMS_VERSION, type AuthUserDTO, type FamilySettings } from "@chorechampz/shared";

export function OAuthSignup() {
  const [params] = useSearchParams();
  const ticket = params.get("ticket");
  const provider = params.get("provider") ?? "google";
  const email = params.get("email") ?? "";
  const suggestedName = params.get("name") ?? "";
  const nav = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);

  const [familyName, setFamilyName] = useState("");
  const [parentName, setParentName] = useState(suggestedName);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card>
          <div className="text-sm text-rose-600">Missing signup ticket.</div>
          <Button className="mt-3 w-full" onClick={() => nav("/login", { replace: true })}>
            Back to sign in
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl">🪙</div>
          <h1 className="text-3xl font-bold mt-2 tracking-tight">Create your family</h1>
          <p className="text-slate-500">
            Signing up with {provider} — {email}
          </p>
        </div>
        <Card>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              if (!acceptedTerms) {
                setErr("Please accept the policies to continue.");
                return;
              }
              setLoading(true);
              try {
                const r = await api<{
                  token: string;
                  refreshToken?: string;
                  user: AuthUserDTO;
                }>(`/auth/oauth/${provider}/signup/complete`, {
                  body: {
                    ticket,
                    familyName,
                    parentName: parentName || undefined,
                    acceptedTermsVersion: CURRENT_TERMS_VERSION,
                  },
                });
                setSession(r.token, r.user, r.refreshToken ?? null);
                const me = await api<{ settings: FamilySettings }>("/auth/me");
                setSettings(me.settings);
                nav("/parent", { replace: true });
              } catch (e: any) {
                setErr(e?.message ?? "Signup failed");
                setLoading(false);
              }
            }}
            className="space-y-3"
          >
            <Field label="Family name">
              <input
                className={inputCls}
                placeholder="The Smith Family"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
              />
            </Field>
            <Field label="Your name">
              <input
                className={inputCls}
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                maxLength={80}
                placeholder="Alex"
              />
            </Field>
            <div className="border-t border-slate-200 pt-3 text-xs text-slate-600">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  title="Accept Terms, Privacy, Acceptable Use, and Child Safety policies"
                  className="mt-0.5"
                />
                <span>
                  I'm 18+ and agree to the{" "}
                  <Link to="/terms" target="_blank" className="text-brand-600 hover:underline">
                    Terms
                  </Link>
                  ,{" "}
                  <Link to="/privacy" target="_blank" className="text-brand-600 hover:underline">
                    Privacy
                  </Link>
                  ,{" "}
                  <Link to="/acceptable-use" target="_blank" className="text-brand-600 hover:underline">
                    Acceptable Use
                  </Link>
                  , and{" "}
                  <Link to="/child-safety" target="_blank" className="text-brand-600 hover:underline">
                    Child Safety
                  </Link>{" "}
                  policies, and I'm the parent or legal guardian of any child I add.
                </span>
              </label>
            </div>
            {err && <div className="text-sm text-rose-600">{err}</div>}
            <Button type="submit" className="w-full" disabled={loading || !acceptedTerms}>
              {loading ? "Creating your family..." : "Start free →"}
            </Button>
            <p className="text-[11px] text-center text-slate-500">Free. No credit card. Cancel anytime.</p>
          </form>
        </Card>
      </div>
    </div>
  );
}
