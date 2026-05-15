import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { Link } from "react-router-dom";
import { Button, Card, Field, inputCls } from "../components/ui";
import { KidAvatar } from "../components/KidAvatar";
import { Turnstile, turnstileEnabled } from "../components/Turnstile";
import { PasswordStrength } from "../components/PasswordStrength";
import { clearDeviceSession, getDeviceSession } from "../lib/deviceToken";
import { useEffect } from "react";
import {
  CURRENT_TERMS_VERSION,
  type AuthUserDTO,
  type AvatarConfig,
  type FamilySettings,
} from "@chorechampz/shared";

type Mode = "PARENT" | "CHILD" | "SIGNUP";

export function Login({ initialMode = "PARENT" }: { initialMode?: Mode } = {}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl">🪙</div>
          <h1 className="text-3xl font-bold mt-2 tracking-tight">ChoreChampz</h1>
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
          const r = await api<{ token: string; refreshToken?: string; user: AuthUserDTO }>(
            "/auth/parent/login",
            { body: { email, password } },
          );
          setSession(r.token, r.user, r.refreshToken ?? null);
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
  const [acceptedGuardian, setAcceptedGuardian] = useState(false);
  const [acceptedNotService, setAcceptedNotService] = useState(false);
  const [acceptedNoCash, setAcceptedNoCash] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const allAccepted = acceptedTerms && acceptedGuardian && acceptedNotService && acceptedNoCash;

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
        if (!allAccepted) {
          setErr("Please review and confirm each acknowledgement to continue.");
          return;
        }
        if (turnstileEnabled() && !turnstileToken) {
          setErr("Please complete the CAPTCHA");
          return;
        }
        setLoading(true);
        try {
          const r = await api<{ token: string; refreshToken?: string; user: AuthUserDTO }>(
            "/auth/parent/register",
            {
              body: {
                familyName,
                parentName,
                email,
                password,
                acceptedTermsVersion: CURRENT_TERMS_VERSION,
                ...(turnstileToken && { "cf-turnstile-response": turnstileToken }),
              },
            },
          );
          setSession(r.token, r.user, r.refreshToken ?? null);
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
      <PasswordStrength value={password} identifiers={[email, parentName, familyName]} />
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
      <div className="border-t border-slate-200 pt-3 space-y-2 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Before you create your family, please confirm:</p>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            title="Accept Terms of Service and Privacy Policy"
            className="mt-0.5"
          />
          <span>
            I am 18+ and have read and agree to the{" "}
            <Link to="/terms" target="_blank" className="text-brand-600 hover:underline">
              Terms of Service
            </Link>
            ,{" "}
            <Link to="/privacy" target="_blank" className="text-brand-600 hover:underline">
              Privacy Policy
            </Link>
            ,{" "}
            <Link to="/acceptable-use" target="_blank" className="text-brand-600 hover:underline">
              Acceptable Use Policy
            </Link>
            , and{" "}
            <Link to="/child-safety" target="_blank" className="text-brand-600 hover:underline">
              Child Safety Policy
            </Link>
            .
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={acceptedGuardian}
            onChange={(e) => setAcceptedGuardian(e.target.checked)}
            title="Confirm guardianship and supervision responsibility"
            className="mt-0.5"
          />
          <span>
            I am the parent or legal guardian for each child I will add, and I am solely responsible for
            supervising my children and for the safety, age-appropriateness, and legality of every task I
            assign.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={acceptedNotService}
            onChange={(e) => setAcceptedNotService(e.target.checked)}
            title="Acknowledge service is not childcare, therapy, education, medical, or financial"
            className="mt-0.5"
          />
          <span>
            I understand ChoreChampz is a household task-management tool — <strong>not</strong> childcare,
            therapy, education, medical advice, a financial service, or an emergency service — and that
            notification delivery is not guaranteed.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={acceptedNoCash}
            onChange={(e) => setAcceptedNoCash(e.target.checked)}
            title="Acknowledge credits have no cash value and are not wages"
            className="mt-0.5"
          />
          <span>
            I understand in-app points and credits are household tracking only — they have{" "}
            <strong>no cash value</strong>, are not money or wages, and rewards are funded and fulfilled
            entirely by me.
          </span>
        </label>
      </div>
      <Turnstile onVerify={setTurnstileToken} />
      {err && <div className="text-sm text-rose-600">{err}</div>}
      <Button type="submit" className="w-full" disabled={loading || !allAccepted}>
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
  const [familyName, setFamilyName] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [lookupTurnstile, setLookupTurnstile] = useState<string | null>(null);
  const [picked, setPicked] = useState<FamilyLookup | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [familyPassword, setFamilyPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasDevice, setHasDevice] = useState<boolean>(() => !!getDeviceSession());

  // On a paired device we can skip family lookup entirely — fetch the kid roster
  // for the device's family and render the profile picker straight away.
  useEffect(() => {
    if (!hasDevice || picked) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{
          familyId: string;
          kids: { id: string; name: string; avatarColor: string; avatarConfig?: AvatarConfig | null }[];
        }>(`/auth/device/profiles`);
        if (cancelled) return;
        // Shape into the existing FamilyLookup envelope so downstream UI is unchanged.
        const settings = { childAuthMode: "INDIVIDUAL" } as unknown as FamilySettings;
        setPicked({
          id: r.familyId,
          name: getDeviceSession()?.label ?? "This device",
          settings,
          users: r.kids,
        });
      } catch (e: any) {
        if (e?.status === 401) {
          clearDeviceSession();
          setHasDevice(false);
          nav("/pair");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasDevice, picked, nav]);

  const lookup = async () => {
    setErr(null);
    try {
      if (turnstileEnabled() && !lookupTurnstile) {
        setErr("Please complete the CAPTCHA");
        return;
      }
      const r = await api<{ family: FamilyLookup }>(`/auth/families/lookup`, {
        method: "POST",
        body: {
          name: familyName,
          familyCode: familyCode.toUpperCase(),
          ...(lookupTurnstile && { "cf-turnstile-response": lookupTurnstile }),
        },
      });
      setPicked(r.family);
    } catch (e: any) {
      if (e?.status === 404) {
        setErr(
          "No matching family. Double-check the family name (must match exactly) and the 6-character family code. Parents can find the code under Settings → Family code.",
        );
      } else if (e?.code === "CAPTCHA_REQUIRED" || e?.code === "CAPTCHA_FAILED") {
        setErr("CAPTCHA check failed. Refresh and try again.");
      } else if (e?.status === 429) {
        setErr("Too many lookup attempts. Wait a minute and try again.");
      } else {
        setErr(e?.message ?? "Lookup failed");
      }
    }
  };

  const child = picked?.users.find((u) => u.id === childId) ?? null;
  const mode = picked?.settings.childAuthMode ?? "INDIVIDUAL";

  return (
    <div className="space-y-3">
      {!picked && (
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
                placeholder="6-char code"
                maxLength={6}
                value={familyCode}
                onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
              />
              <Button variant="secondary" onClick={lookup} type="button">
                Find
              </Button>
            </div>
          </Field>
          <Turnstile onVerify={setLookupTurnstile} />
          <div className="text-center text-xs text-slate-500 pt-1">
            Have a pairing code from a parent?{" "}
            <button
              type="button"
              className="text-brand-600 hover:underline"
              onClick={() => nav("/pair")}
            >
              Pair this device
            </button>
          </div>
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
              const r = await api<{ token: string; refreshToken?: string; user: AuthUserDTO }>(
                "/auth/child/login",
                {
                  body: {
                    childId,
                    ...(mode === "INDIVIDUAL" ? { pin } : { familyPassword }),
                  },
                },
              );
              setSession(r.token, r.user, r.refreshToken ?? null);
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
