import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import type { AuthUserDTO } from "@chorechampz/shared";

interface FamilyEntry {
  familyId: string;
  familyName: string;
  membershipId: string | null;
  role: string;
  isBillingOwner: boolean;
}

interface MeFamiliesResponse {
  activeFamilyId: string;
  activeMembershipId: string | null;
  families: FamilyEntry[];
}

// Renders an inline list when the user belongs to multiple families. Hidden
// for CHILD and for adults with only one membership — they have nothing to
// switch to. Switching revokes the current refresh, mints a new pair, and
// clears the React Query cache so per-family data isn't leaked across the
// switch.
export function FamilySwitcher({ onSwitched }: { onSwitched?: () => void }) {
  const setSession = useAuth((s) => s.setSession);
  const setSettings = useAuth((s) => s.setSettings);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["me", "families"],
    queryFn: () => api<MeFamiliesResponse>("/auth/me/families"),
    staleTime: 60_000,
    retry: false,
  });

  if (!q.data || q.data.families.length <= 1) return null;

  return (
    <div className="px-3 py-2 border-b border-slate-100">
      <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Family</div>
      <div className="flex flex-col gap-0.5">
        {q.data.families.map((f) => {
          const active = f.familyId === q.data!.activeFamilyId;
          return (
            <button
              key={f.familyId}
              type="button"
              disabled={busy !== null || active}
              onClick={async () => {
                if (active) return;
                setBusy(f.familyId);
                try {
                  const rt = useAuth.getState().refreshToken;
                  const r = await api<{
                    token: string;
                    refreshToken?: string;
                    user: AuthUserDTO;
                  }>("/auth/switch-family", {
                    body: { familyId: f.familyId, refreshToken: rt ?? undefined },
                  });
                  setSession(r.token, r.user, r.refreshToken ?? null);
                  qc.clear();
                  // /me fetches family settings under the new fid.
                  const me = await api<{ settings: Parameters<typeof setSettings>[0] }>("/auth/me");
                  setSettings(me.settings);
                  onSwitched?.();
                  // Land on the role-appropriate root so any in-memory page
                  // state from the previous family is discarded.
                  nav(r.user.role === "CHILD" ? "/me" : "/parent", { replace: true });
                } catch (e) {
                  console.error("switch-family", e);
                } finally {
                  setBusy(null);
                }
              }}
              className={
                "text-left px-2 py-1.5 rounded text-sm flex items-center justify-between " +
                (active ? "bg-brand-50 text-brand-700 cursor-default" : "text-slate-700 hover:bg-slate-100")
              }
            >
              <span className="truncate">{f.familyName}</span>
              <span className="text-[10px] text-slate-400 ml-2 shrink-0">
                {busy === f.familyId ? "…" : active ? "active" : f.role}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
