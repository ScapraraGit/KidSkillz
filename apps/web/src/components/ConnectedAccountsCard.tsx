import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, API_URL } from "../lib/api";
import { Button, Card } from "./ui";
import { Tooltip } from "./Tooltip";

interface OAuthIdentity {
  id: string;
  provider: "GOOGLE";
  email: string;
  linkedAt: string;
  lastLoginAt: string | null;
}

const SOCIAL_LOGIN_ENABLED = (import.meta.env.VITE_SOCIAL_LOGIN_ENABLED as string) === "true";

export function ConnectedAccountsCard() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [flash, setFlash] = useState<string | null>(null);

  // Surface ?oauth_linked=google on landing after the link redirect.
  useEffect(() => {
    const linked = params.get("oauth_linked");
    if (linked) {
      setFlash(`Connected ${linked}.`);
      params.delete("oauth_linked");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const q = useQuery({
    queryKey: ["oauth-identities"],
    queryFn: () => api<{ items: OAuthIdentity[] }>("/auth/oauth/identities"),
    enabled: SOCIAL_LOGIN_ENABLED,
  });

  const unlink = useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/auth/oauth/identities/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oauth-identities"] }),
  });

  if (!SOCIAL_LOGIN_ENABLED) return null;

  const items = q.data?.items ?? [];
  const google = items.find((i) => i.provider === "GOOGLE");

  return (
    <Card className="space-y-3">
      <h3 className="font-semibold">Connected accounts</h3>
      <p className="text-sm text-slate-500">
        Sign in faster by linking a provider. You can still use email + password.
      </p>
      {flash && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-3">
          <GoogleGlyph />
          <div>
            <div className="font-medium">Google</div>
            <div className="text-xs text-slate-500">
              {google ? `Linked: ${google.email}` : "Not connected"}
            </div>
          </div>
        </div>
        {google ? (
          <Tooltip label="Disconnect this Google account from ChoreChampz">
            <Button
              type="button"
              variant="secondary"
              disabled={unlink.isPending}
              onClick={() => unlink.mutate(google.id)}
            >
              {unlink.isPending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </Tooltip>
        ) : (
          <Tooltip label="Link your Google account to sign in with one click">
            <a
              href={`${API_URL}/v1/auth/oauth/google/link/start`}
              className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Connect
            </a>
          </Tooltip>
        )}
      </div>
      {unlink.error && (
        <div className="text-sm text-rose-600">
          {(unlink.error as { message?: string })?.message ?? "Failed to disconnect"}
        </div>
      )}
    </Card>
  );
}

function GoogleGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
