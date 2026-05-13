import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { Link } from "react-router-dom";
import { Button, Card, Field, inputCls } from "../components/ui";
import { KidAvatar } from "../components/KidAvatar";
import {
  CURRENT_TERMS_VERSION,
  type AuthUserDTO,
  type AvatarConfig,
  type FamilySettings,
} from "@chorechamps/shared";

type Mode = "PARENT" | "CHILD" | "SIGNUP";

export function Login({ initialMode = "PARENT" }: { initialMode?: Mode } = {}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl">🪙</div>
          <h1 className="text-3xl font-bold mt-2 tracking-tight">ChoreChamps</h1>
          <p className="text-slate-500">Earn credits, plan ahead, do something amazing.</p>
        </div>
        <Card>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-5">
            <Button
              variant={mode === "PARENT" ? "primary" : "ghost"}
              className="flex-1"
              onClick={() => setMode("PARENT")}
            >
              Parent
            </Button>
            <Button
              variant={mode === "CHILD" ? "primary" : "ghost"}
              className="flex-1"
              onClick={() => setMode("CHILD")}
            >
              Kid
            </Button>
            <Button
              variant={mode === "SIGNUP" ? "primary" : "ghost"}
              className="flex-1"
              onClick={() => setMode("SIGNUP")}
            >
              New family
            </Button>
          </div>
          {mode === "PARENT" && <ParentLogin onSignup={() => setMode("SIGNUP")} />}
          {mode === "CHILD" && <ChildLogin />}
          {mode === "SIGNUP" && <ParentSignup onCancel={() => setMode("PARENT")} />}
        </Card>
      </div>
    </div>
  );
}

function ParentLogin({ onSignup }: { onSignup: () => void }) {
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setLoading(true);
        try {
          const r = await api<{ token: string; user: AuthUserDTO }>("/auth/parent/login", {
            body: { email, password },
          });
          setSession(r.token, r.user);
          const me = await api<{ settings: FamilySettings }>("/auth/me");
          setSettings(me.settings);
          nav("/parent");
        } catch (e: any) {
          setErr(e.message ?? "Login failed");
        } finally {
          setLoading(false);
        }
      }}
      className="space-y-3"
    >
      <Field label="Email">
        <input
          className={inputCls}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <Field label="Password">
        <input
          className={inputCls}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {err && <div className="text-sm text-rose-600">{err}</div>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
      <p className="text-xs text-center text-slate-500 pt-1">
        New here?{" "}
        <button type="button" className="text-brand-600 hover:underline" onClick={onSignup}>
          Create a family
        </button>
        {" · "}
        <Link to="/forgot-password" className="text-brand-600 hover:underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

function ParentSignup({ onCancel }: { onCancel: () => void }) {
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);
  const nav = useNavigate();
  const [familyName, setFamilyName] = useState("");
  const [parentName, setParentName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [invitePartner, setInvitePartner] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
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
        if (invitePartner && !partnerEmail) {
          setErr("Enter partner email or uncheck the box");
          return;
        }
        if (!acceptedTerms) {
          setErr("Please accept the Terms of Service and Privacy Policy");
          return;
        }
        setLoading(true);
        try {
          const r = await api<{ token: string; user: AuthUserDTO }>("/auth/parent/register", {
            body: { familyName, parentName, email, password, acceptedTermsVersion: CURRENT_TERMS_VERSION },
          });
          setSession(r.token, r.user);
          const me = await api<{ settings: FamilySettings }>("/auth/me");
          setSettings(me.settings);
          if (invitePartner && partnerEmail) {
            try {
              await api("/invitations", {
                body: { kind: "CO_PARENT", email: partnerEmail, inviteeName: partnerName || undefined },
              });
            } catch (inviteErr) {
              console.error("[signup:partner-invite] failed", inviteErr);
            }
          }
          nav("/parent");
        } catch (e: any) {
          setErr(e.message ?? "Signup failed");
        } finally {
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
          placeholder="Alex"
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
          required
          maxLength={80}
        />
      </Field>
      <Field label="Email">
        <input
          className={inputCls}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <Field label="Password">
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
      <div className="border-t border-slate-200 pt-3 space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            title="Invite a co-parent"
            checked={invitePartner}
            onChange={(e) => setInvitePartner(e.target.checked)}
          />
          Invite a co-parent (optional)
        </label>
        {invitePartner && (
          <div className="space-y-2 pl-6">
            <Field label="Partner's email">
              <input
                className={inputCls}
                type="email"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                required={invitePartner}
              />
            </Field>
            <Field label="Partner's name (optional)">
              <input
                className={inputCls}
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                maxLength={80}
              />
            </Field>
            <p className="text-xs text-slate-500">
              They'll get an email with a link to join your family with full access.
            </p>
          </div>
        )}
      </div>
      <label className="flex items-start gap-2 text-xs text-slate-600 pt-1">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          title="Accept Terms of Service and Privacy Policy"
          className="mt-0.5"
        />
        <span>
          I agree to the{" "}
          <Link to="/terms" target="_blank" className="text-brand-600 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/privacy" target="_blank" className="text-brand-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {err && <div className="text-sm text-rose-600">{err}</div>}
      <Button type="submit" className="w-full" disabled={loading || !acceptedTerms}>
        {loading ? "Creating family..." : "Create family"}
      </Button>
      <p className="text-xs text-center text-slate-500 pt-1">
        Already have an account?{" "}
        <button type="button" className="text-brand-600 hover:underline" onClick={onCancel}>
          Sign in
        </button>
      </p>
    </form>
  );
}

interface FamilyLookup {
  id: string;
  name: string;
  settings: FamilySettings;
  users: { id: string; name: string; avatarColor: string; avatarConfig?: AvatarConfig | null }[];
}

function ChildLogin() {
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);
  const nav = useNavigate();
  const [familyName, setFamilyName] = useState("Caprara");
  const [families, setFamilies] = useState<FamilyLookup[]>([]);
  const [picked, setPicked] = useState<FamilyLookup | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [familyPassword, setFamilyPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    setErr(null);
    try {
      const r = await api<{ families: FamilyLookup[] }>(
        `/auth/families/lookup?name=${encodeURIComponent(familyName)}`,
      );
      setFamilies(r.families);
      if (r.families.length === 1) setPicked(r.families[0]);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const child = picked?.users.find((u) => u.id === childId) ?? null;
  const mode = picked?.settings.childAuthMode ?? "INDIVIDUAL";

  return (
    <div className="space-y-3">
      {!picked && (
        <>
          <Field label="Family">
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Family name"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
              />
              <Button variant="secondary" onClick={lookup} type="button">
                Find
              </Button>
            </div>
          </Field>
          {families.map((f) => (
            <button
              key={f.id}
              className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50"
              onClick={() => setPicked(f)}
            >
              <div className="font-medium">{f.name}</div>
              <div className="text-xs text-slate-500">
                {f.users.length} kid{f.users.length === 1 ? "" : "s"}
              </div>
            </button>
          ))}
        </>
      )}

      {picked && !childId && (
        <>
          <div className="text-sm text-slate-600">
            Pick your profile in <strong>{picked.name}</strong>:
          </div>
          <div className="grid grid-cols-2 gap-2">
            {picked.users.map((u) => (
              <button
                key={u.id}
                onClick={() => setChildId(u.id)}
                className="p-4 rounded-xl border border-slate-200 hover:bg-slate-50 flex flex-col items-center gap-2"
              >
                <KidAvatar name={u.name} color={u.avatarColor} config={u.avatarConfig} size={56} />
                <div className="font-medium">{u.name}</div>
              </button>
            ))}
          </div>
          <button className="text-xs text-slate-500" onClick={() => setPicked(null)}>
            ← back
          </button>
        </>
      )}

      {picked && childId && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            setLoading(true);
            try {
              const r = await api<{ token: string; user: AuthUserDTO }>("/auth/child/login", {
                body: {
                  childId,
                  ...(mode === "INDIVIDUAL" ? { pin } : { familyPassword }),
                },
              });
              setSession(r.token, r.user);
              const me = await api<{ settings: FamilySettings }>("/auth/me");
              setSettings(me.settings);
              nav("/me");
            } catch (e: any) {
              setErr(e.message ?? "Login failed");
            } finally {
              setLoading(false);
            }
          }}
          className="space-y-3"
        >
          <div className="flex items-center gap-3">
            {child && (
              <KidAvatar name={child.name} color={child.avatarColor} config={child.avatarConfig} size={40} />
            )}
            <div className="font-medium">{child?.name}</div>
            <button className="text-xs text-slate-500 ml-auto" onClick={() => setChildId(null)} type="button">
              change
            </button>
          </div>
          {mode === "INDIVIDUAL" ? (
            <Field label="PIN">
              <input
                autoFocus
                className={inputCls}
                inputMode="numeric"
                pattern="\d{4,8}"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                required
              />
            </Field>
          ) : (
            <Field label="Family password">
              <input
                autoFocus
                className={inputCls}
                type="password"
                value={familyPassword}
                onChange={(e) => setFamilyPassword(e.target.value)}
                required
              />
            </Field>
          )}
          {err && <div className="text-sm text-rose-600">{err}</div>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Let's go!"}
          </Button>
        </form>
      )}
    </div>
  );
}
