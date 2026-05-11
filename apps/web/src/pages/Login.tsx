import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { Button, Card, Field, inputCls } from "../components/ui";
import { KidAvatar } from "../components/KidAvatar";
import type { AuthUserDTO, AvatarConfig, FamilySettings } from "@chorechamps/shared";

type Mode = "PARENT" | "CHILD";

export function Login() {
  const [mode, setMode] = useState<Mode>("PARENT");

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl">🌟</div>
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
          </div>
          {mode === "PARENT" ? <ParentLogin /> : <ChildLogin />}
        </Card>
        <p className="text-center text-xs text-slate-500 mt-4">
          Demo: dad@example.com / password123 · Kids PIN: Ava 1234, Leo 4321
        </p>
      </div>
    </div>
  );
}

function ParentLogin() {
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);
  const nav = useNavigate();
  const [email, setEmail] = useState("dad@example.com");
  const [password, setPassword] = useState("password123");
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
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password">
        <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {err && <div className="text-sm text-rose-600">{err}</div>}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</Button>
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
      const r = await api<{ families: FamilyLookup[] }>(`/auth/families/lookup?name=${encodeURIComponent(familyName)}`);
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
              <Button variant="secondary" onClick={lookup} type="button">Find</Button>
            </div>
          </Field>
          {families.map((f) => (
            <button
              key={f.id}
              className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50"
              onClick={() => setPicked(f)}
            >
              <div className="font-medium">{f.name}</div>
              <div className="text-xs text-slate-500">{f.users.length} kid{f.users.length === 1 ? "" : "s"}</div>
            </button>
          ))}
        </>
      )}

      {picked && !childId && (
        <>
          <div className="text-sm text-slate-600">Pick your profile in <strong>{picked.name}</strong>:</div>
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
          <button className="text-xs text-slate-500" onClick={() => setPicked(null)}>← back</button>
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
            <button className="text-xs text-slate-500 ml-auto" onClick={() => setChildId(null)} type="button">change</button>
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
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in..." : "Let's go!"}</Button>
        </form>
      )}
    </div>
  );
}
