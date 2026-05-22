import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { Tooltip } from "./Tooltip";
import type { MeResponseDTO } from "@chorechampz/shared";

const DISMISS_KEY = "beta_banner_dismissed_v1";

interface BetaStatus {
  submittedAt: string | null;
  checklistCompleted: number;
}

export function BetaBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<MeResponseDTO>("/auth/me"),
    staleTime: Infinity,
  });
  const isBeta = me.data?.isBeta === true;

  const status = useQuery({
    queryKey: ["beta", "status"],
    queryFn: () => api<BetaStatus>("/beta/status"),
    // Caregivers/kids/non-beta families 403; swallow so we just hide.
    retry: (_, e) => !(e instanceof ApiError && e.status === 403),
    staleTime: 5 * 60_000,
    enabled: isBeta,
  });

  // If we already submitted, never show again — also persist the dismissal so
  // we skip the network round-trip on subsequent loads.
  useEffect(() => {
    if (status.data?.submittedAt) {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      setDismissed(true);
    }
  }, [status.data?.submittedAt]);

  if (dismissed) return null;
  if (status.isLoading) return null;
  if (!status.data) return null;
  if (status.data.submittedAt) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <div className="text-2xl shrink-0" aria-hidden>
        💜
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-800">You're a beta tester — got 10 minutes?</div>
        <p className="text-sm text-slate-600 mt-0.5">
          Your honest feedback shapes what ChoreChampz becomes. Run the checklist or jump straight to the
          form.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        <Tooltip label="Walk through the suggested testing flow">
          <Link
            to="/beta/checklist"
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700"
          >
            Open checklist
          </Link>
        </Tooltip>
        <Tooltip label="Skip checklist, leave feedback now">
          <Link
            to="/beta/feedback"
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
          >
            Give feedback
          </Link>
        </Tooltip>
        <Tooltip label="Hide this for now (we won't ask again)">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss beta banner"
            className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
