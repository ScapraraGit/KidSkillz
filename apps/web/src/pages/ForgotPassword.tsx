import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card, Field, inputCls } from "../components/ui";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl">🪙</div>
          <h1 className="text-2xl font-bold mt-2">Reset your password</h1>
        </div>
        <Card>
          {sent ? (
            <div className="text-sm space-y-3">
              <p>If an account exists for that email, a reset link is on the way.</p>
              <p className="text-slate-500 text-xs">
                The link expires in 1 hour. Check spam if you don't see it.
              </p>
              <Link to="/login" className="text-brand-600 hover:underline text-sm">
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setErr(null);
                setLoading(true);
                try {
                  await api("/auth/forgot-password", { body: { email } });
                  setSent(true);
                } catch (e: any) {
                  setErr(e.message ?? "Could not send reset email");
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Field label="Email" hint="We'll send a one-time reset link.">
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              {err && <div className="text-sm text-rose-600">{err}</div>}
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
              <p className="text-xs text-center text-slate-500 pt-1">
                <Link to="/login" className="text-brand-600 hover:underline">
                  ← Back to sign in
                </Link>
              </p>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
