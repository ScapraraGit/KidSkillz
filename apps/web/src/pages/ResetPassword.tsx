import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card, Field, inputCls } from "../components/ui";
import { PasswordStrength } from "../components/PasswordStrength";

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Shell>
        <p className="text-sm text-rose-600">Missing reset token in the URL.</p>
        <Link to="/forgot-password" className="text-brand-600 hover:underline text-sm">
          Request a new link
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      {done ? (
        <div className="text-sm space-y-3">
          <p>Password updated. You can now sign in with your new password.</p>
          <Button className="w-full" onClick={() => nav("/login")}>
            Go to sign in
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            if (password !== confirm) {
              setErr("Passwords don't match");
              return;
            }
            setLoading(true);
            try {
              await api("/auth/reset-password", { body: { token, password } });
              setDone(true);
            } catch (e: any) {
              setErr(e.message ?? "Reset failed");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="New password" hint="8–128 characters.">
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <PasswordStrength value={password} />
          <Field label="Confirm new password">
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
          <Button type="submit" className="w-full" disabled={loading || !password}>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl">🪙</div>
          <h1 className="text-2xl font-bold mt-2">Choose a new password</h1>
        </div>
        <Card>{children}</Card>
      </div>
    </div>
  );
}
