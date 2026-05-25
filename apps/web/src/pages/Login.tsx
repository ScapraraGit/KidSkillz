import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { Link } from "react-router-dom";
import { Button, Card, Field, inputCls } from "../components/ui";
import { KidAvatar } from "../components/KidAvatar";
import { Turnstile, turnstileEnabled } from "../components/Turnstile";
import { PasswordStrength } from "../components/PasswordStrength";
import { clearDeviceSession, getDeviceSession } from "../lib/deviceToken";
import { clearLastFamily, getLastFamily, normalizeFamilyCode, setLastFamily } from "../lib/lastFamily";
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

interface FamilyOption {
  familyId: string;
  familyName: string;
  membershipId: string | null;
  role: string;
  isBillingOwner: boolean;
}

type ParentLoginSuccess =
  | {
      needsFamilySelect?: false;
      token: string;
      refreshToken?: string;
      user: AuthUserDTO;
    }
  | {
      needsFamilySelect: true;
      selectToken: string;
      families: FamilyOption[];
    };

function ParentLogin({ onSignup }: { onSignup: () => void }) {
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picker, setPicker] = useState<{ selectToken: string; families: FamilyOption[] } | null>(null);

  async function completeLogin(token: string, refreshToken: string | null, user: AuthUserDTO) {
    setSession(token, user, refreshToken);
    const me = await api<{ settings: FamilySettings }>("/auth/me");
    setSettings(me.settings);
    nav("/parent");
  }

  if (picker) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">You belong to multiple families. Pick the one to open:</p>
        {picker.families.map((f) => (
          <button
            key={f.familyId}
            type="button"
            disabled={loading}
            onClick={async () => {
              setErr(null);
              setLoading(true);
              try {
                const r = await api<{ token: string; refreshToken?: string; user: AuthUserDTO }>(
                  "/auth/select-family",
                  { body: { selectToken: picker.selectToken, familyId: f.familyId } },
                );
                await completeLogin(r.token, r.refreshToken ?? null, r.user);
              } catch (e: any) {
                setErr(e.message ?? "Failed to open family");
                setLoading(false);
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
        {err && <div className="text-sm text-rose-600">{err}</div>}
        <button
          type="button"
          className="text-xs text-slate-500 hover:underline"
          onClick={() => {
            setPicker(null);
            setErr(null);
          }}
        >
          Use a different account
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setLoading(true);
        try {
          const r = await api<ParentLoginSuccess>("/auth/parent/login", {
            body: { email, password },
          });
          if (r.needsFamilySelect === true) {
            setPicker({ selectToken: r.selectToken, families: r.families });
            return;
          }
          await completeLogin(r.token, r.refreshToken ?? null, r.user);
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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const allAccepted = acceptedTerms;

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
          setErr("Please review and accept the policies to continue.");
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
      <Turnstile onVerify={setTurnstileToken} />
      {err && <div className="text-sm text-rose-600">{err}</div>}
      <Button type="submit" className="w-full" disabled={loading || !allAccepted}>
        {loading ? "Getting things ready..." : "Start free →"}
      </Button>
      <p className="text-[11px] text-center text-slate-500">Free. No credit card. Cancel anytime.</p>
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
  // Deep-link prefill via QR code on parent's Settings page. The QR encodes
  // ?fc=<code>&fn=<name>; either can be present alone. Query-param wins over
  // the remembered-family fallback so a parent showing a fresh QR doesn't get
  // overridden by stale localStorage on a shared device.
  const [searchParams] = useSearchParams();
  const fcParam = (searchParams.get("fc") ?? "").toUpperCase();
  const fnParam = searchParams.get("fn") ?? "";
  // Seed name + code from the last successful lookup on this device. Beta
  // testers swap devices a lot, so the friction of re-typing the 6-char code
  // every session is real. Tester can wipe it via the "Switch family" button.
  const remembered = getLastFamily();
  const [familyName, setFamilyName] = useState(fnParam || remembered?.name || "");
  const [familyCode, setFamilyCode] = useState(
    fcParam ? normalizeFamilyCode(fcParam) : (remembered?.code ?? ""),
  );
  const [hasRemembered, setHasRemembered] = useState<boolean>(!!remembered && !fcParam);
  const [lookupTurnstile, setLookupTurnstile] = useState<string | null>(null);
  const [picked, setPicked] = useState<FamilyLookup | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [familyPassword, setFamilyPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasDevice, setHasDevice] = useState<boolean>(() => !!getDeviceSession());

  function switchFamily() {
    clearLastFamily();
    setHasRemembered(false);
    setFamilyName("");
    setFamilyCode("");
    setPicked(null);
    setErr(null);
  }

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
      // Remember on success so the next session can skip the code entry. We
      // store the user-supplied name (not r.family.name) so the prefill round-
      // trips identically — the server matches case-insensitive anyway.
      setLastFamily(familyName.trim(), familyCode.toUpperCase());
      setHasRemembered(true);
    } catch (e: any) {
      if (e?.status === 404) {
        // Saved code may have rotated — clear so user gets a fresh entry next
        // session instead of failing repeatedly with a stale prefill.
        if (hasRemembered) {
          clearLastFamily();
          setHasRemembered(false);
        }
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
          {hasRemembered && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
              <div className="text-slate-700">
                Last used on this device: <strong>{familyName}</strong>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Tap Find to continue, or switch families.
                </span>
              </div>
              <button
                type="button"
                onClick={switchFamily}
                className="shrink-0 text-xs font-medium text-brand-700 hover:underline"
              >
                Switch family
              </button>
            </div>
          )}
          <Field label="Family name">
            <input
              className={inputCls}
              placeholder="Family name"
              value={familyName}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              onChange={(e) => setFamilyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && familyName.trim() && familyCode.length === 6) {
                  e.preventDefault();
                  lookup();
                }
              }}
            />
          </Field>
          <Field label="Family code" hint="6 characters · letters and numbers · case-insensitive">
            <div className="flex gap-2">
              <input
                className={`${inputCls} font-mono tracking-[0.3em] uppercase text-lg`}
                placeholder="ABC123"
                maxLength={6}
                value={familyCode}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                onChange={(e) => setFamilyCode(normalizeFamilyCode(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && familyName.trim() && familyCode.length === 6) {
                    e.preventDefault();
                    lookup();
                  }
                }}
              />
              <Button
                variant="secondary"
                onClick={lookup}
                type="button"
                disabled={!familyName.trim() || familyCode.length !== 6}
              >
                Find
              </Button>
            </div>
          </Field>
          <Turnstile onVerify={setLookupTurnstile} />
          <div className="text-center text-xs text-slate-500 pt-1">
            Have a pairing code from a parent?{" "}
            <button type="button" className="text-brand-600 hover:underline" onClick={() => nav("/pair")}>
              Pair this device
            </button>
          </div>
        </>
      )}

      {picked && !childId && (
        <>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
            <div className="text-emerald-800">
              <span aria-hidden="true">✓ </span>
              Family found: <strong>{picked.name}</strong>
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="shrink-0 text-xs font-medium text-emerald-700 hover:underline"
            >
              Not us
            </button>
          </div>
          <div className="text-sm text-slate-600">Pick your profile:</div>
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
              // Paired device: device-token header authenticates family, so we
              // only need childId (+ PIN in INDIVIDUAL mode). Legacy familyPassword
              // is rejected server-side when DEVICE_PAIRING_ENABLED is on.
              const onPairedDevice = hasDevice;
              const body =
                mode === "INDIVIDUAL"
                  ? { childId, pin }
                  : onPairedDevice
                    ? { childId }
                    : { childId, familyPassword };
              const r = await api<{ token: string; refreshToken?: string; user: AuthUserDTO }>(
                "/auth/child/login",
                { body },
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
          {/* Family name shown above the kid avatar so the password step makes */}
          {/* clear which family the credential will unlock — helpful on a shared */}
          {/* device that's seen multiple families. */}
          <div className="text-xs uppercase tracking-wide text-slate-500">{picked.name}</div>
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
          ) : hasDevice ? (
            // SHARED_DEVICE on a paired device: device token is the family
            // unlock, no further credential needed. Profile pick = sign-in.
            <div className="text-sm text-slate-500">Tap "Let's go!" to sign in.</div>
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
