import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

const BILLING_UI = (import.meta.env.VITE_BILLING_ENABLED as string) === "true";

interface Entitlement {
  status: string;
  plan: "BASIC" | "PREMIUM";
  trialEndsAt: string | null;
  isPaid: boolean;
  source: "STRIPE" | "TRIAL" | "OVERRIDE";
  override: "NONE" | "FREE_FOREVER" | "FREE_UNTIL" | "COMPED_PREMIUM";
}

/**
 * Top-of-app banner during the free trial window. Suppressed entirely when:
 *  - billing UI flag off
 *  - entitlement source is OVERRIDE (account comped — no upsell)
 *  - entitlement is from a paid Stripe subscription
 *  - trialEndsAt is null or already past (the gate middleware handles expired)
 */
export function TrialBanner() {
  const q = useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => api<{ entitlement: Entitlement }>("/billing/status"),
    enabled: BILLING_UI,
    staleTime: 60_000,
    retry: false,
  });
  if (!BILLING_UI) return null;
  const ent = q.data?.entitlement;
  if (!ent) return null;
  if (ent.source === "OVERRIDE") return null;
  if (ent.source !== "TRIAL") return null;
  if (!ent.trialEndsAt) return null;
  const endsMs = new Date(ent.trialEndsAt).getTime();
  const daysLeft = Math.max(0, Math.ceil((endsMs - Date.now()) / (1000 * 60 * 60 * 24)));
  return (
    <div className="bg-indigo-600 text-white text-sm px-4 py-2 flex items-center justify-between">
      <span>
        Free trial — <strong>{daysLeft}</strong> day{daysLeft === 1 ? "" : "s"} left
      </span>
      <Link to="/parent/settings#billing" className="underline font-medium">
        Choose a plan
      </Link>
    </div>
  );
}
