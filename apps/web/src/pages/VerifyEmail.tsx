import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card } from "../components/ui";
import { useAuth } from "../store/auth";
import type { AuthUserDTO } from "@chorechampz/shared";

type Status = "pending" | "ok" | "fail" | "missing";

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? "pending" : "missing");
  const [err, setErr] = useState<string | null>(null);
  const setUser = useAuth((s) => s.setUser);
  const sessionToken = useAuth((s) => s.token);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await api("/auth/verify-email", { body: { token } });
        // DB now has emailVerifiedAt set, but the cached user in localStorage
        // still has null — without this refresh the "Verify your email" banner
        // keeps showing on the dashboard until the next full reload/login.
        // Only refresh if the user is currently signed in; an anonymous click
        // through the email link (e.g. on a different device) won't have a
        // session to update.
        if (sessionToken) {
          try {
            const me = await api<{ user: AuthUserDTO }>("/auth/me");
            if (!cancelled) setUser(me.user);
          } catch {
            /* non-fatal — banner self-corrects on next reload */
          }
        }
        if (!cancelled) setStatus("ok");
      } catch (e: any) {
        if (!cancelled) {
          setStatus("fail");
          setErr(e.message ?? "Verification failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, sessionToken, setUser]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-emerald-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl">🪙</div>
          <h1 className="text-2xl font-bold mt-2">Verify your email</h1>
        </div>
        <Card className="text-sm space-y-3">
          {status === "missing" && <p className="text-rose-600">Missing verification token in URL.</p>}
          {status === "pending" && <p>Verifying…</p>}
          {status === "ok" && (
            <>
              <p>✅ Email verified. You can now access all parent features.</p>
              <Link to="/parent" className="text-brand-600 hover:underline">
                Go to your dashboard
              </Link>
            </>
          )}
          {status === "fail" && (
            <>
              <p className="text-rose-600">{err}</p>
              <p className="text-slate-500 text-xs">
                Open the app and choose "Resend verification email" from your account menu.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
