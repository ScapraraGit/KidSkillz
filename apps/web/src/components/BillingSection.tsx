import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card } from "./ui";
import { Tooltip } from "./Tooltip";

const BILLING_UI = (import.meta.env.VITE_BILLING_ENABLED as string) === "true";

interface Entitlement {
  status: string;
  plan: "BASIC" | "PREMIUM";
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isPaid: boolean;
  isPremium: boolean;
  source: "STRIPE" | "TRIAL" | "OVERRIDE";
  override: "NONE" | "FREE_FOREVER" | "FREE_UNTIL" | "COMPED_PREMIUM";
  overrideReason: string | null;
  overrideUntil: string | null;
}

interface PlanPrice {
  plan: "BASIC" | "PREMIUM";
  priceId: string;
  unitAmount: number;
  currency: string;
  interval: string;
}

function formatPrice(p: PlanPrice | undefined, fallback: string): string {
  if (!p) return fallback;
  const dollars = (p.unitAmount / 100).toFixed(2);
  return `$${dollars} ${p.currency.toUpperCase()} / ${p.interval}`;
}

/**
 * Billing/subscription card. Lives inside parent Settings page so account-level
 * concerns (password, billing, devices) sit together. When billing UI flag is
 * off the component renders nothing — Settings page stays clean.
 */
export function BillingSection() {
  const [params] = useSearchParams();
  const ret = params.get("status");

  const q = useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => api<{ entitlement: Entitlement; plans: PlanPrice[] }>("/billing/status"),
    enabled: BILLING_UI,
  });

  const checkoutM = useMutation({
    mutationFn: (plan: "BASIC" | "PREMIUM") =>
      api<{ url: string }>("/billing/checkout", { method: "POST", body: { plan } }),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });
  const portalM = useMutation({
    mutationFn: () => api<{ url: string }>("/billing/portal", { method: "POST" }),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  if (!BILLING_UI) return null;

  const ent = q.data?.entitlement;
  const plans = q.data?.plans ?? [];
  const basic = plans.find((p) => p.plan === "BASIC");
  const premium = plans.find((p) => p.plan === "PREMIUM");

  return (
    <Card id="billing" className="mb-6">
      <h2 className="text-lg font-semibold mb-1">Billing</h2>
      <p className="text-sm text-slate-500 mb-4">Subscription, plan, and payment method.</p>

      {ret === "success" && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
          Thanks — your subscription is active.
        </div>
      )}
      {ret === "cancel" && (
        <div className="mb-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700">
          Checkout cancelled. No charge made.
        </div>
      )}

      {q.isLoading && <div className="text-sm text-slate-500">Loading…</div>}

      {ent && ent.source === "OVERRIDE" && (
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="font-medium mb-1">Account comped by ChoreChampz</div>
          {ent.overrideReason && <p className="text-slate-700 text-sm">{ent.overrideReason}</p>}
          <p className="text-sm text-slate-500 mt-2">
            Plan: <strong>{ent.plan}</strong>
            {ent.overrideUntil && <> · until {new Date(ent.overrideUntil).toLocaleDateString()}</>}
          </p>
          <p className="text-xs text-slate-500 mt-3">
            No payment required. Contact support if anything looks off.
          </p>
        </div>
      )}

      {ent && ent.source !== "OVERRIDE" && (
        <>
          <div className="rounded-lg border border-slate-200 p-3 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm text-slate-500">Current plan</div>
              <div className="text-lg font-semibold">
                {ent.plan} <span className="text-sm font-normal text-slate-500">({ent.status})</span>
              </div>
              {ent.trialEndsAt && ent.source === "TRIAL" && (
                <div className="text-sm text-slate-600 mt-1">
                  Trial ends {new Date(ent.trialEndsAt).toLocaleDateString()}
                </div>
              )}
              {ent.currentPeriodEnd && ent.source === "STRIPE" && (
                <div className="text-sm text-slate-600 mt-1">
                  {ent.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
                  {new Date(ent.currentPeriodEnd).toLocaleDateString()}
                </div>
              )}
            </div>
            {ent.isPaid && ent.source === "STRIPE" && (
              <Tooltip label="Manage subscription, update card, or cancel" side="left">
                <Button onClick={() => portalM.mutate()} disabled={portalM.isPending}>
                  {portalM.isPending ? "Opening…" : "Manage subscription"}
                </Button>
              </Tooltip>
            )}
          </div>

          {!ent.isPaid || ent.source === "TRIAL" ? (
            <div className={"grid gap-4 " + (basic && premium ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
              {basic && (
                <PlanCard
                  title="Basic"
                  price={formatPrice(basic, "$— / month")}
                  features={["Up to 3 kids", "Standard rewards", "Email support"]}
                  cta="Choose Basic"
                  onClick={() => checkoutM.mutate("BASIC")}
                  disabled={checkoutM.isPending}
                />
              )}
              {premium && (
                <PlanCard
                  title="Premium"
                  price={formatPrice(premium, "$— / month")}
                  features={["Unlimited kids", "Custom categories", "Photo proof retention", "CSV export"]}
                  cta="Choose Premium"
                  onClick={() => checkoutM.mutate("PREMIUM")}
                  disabled={checkoutM.isPending}
                  accent
                />
              )}
            </div>
          ) : null}
        </>
      )}
      {checkoutM.error && (
        <div className="mt-4 text-sm text-rose-600">{(checkoutM.error as Error).message}</div>
      )}
    </Card>
  );
}

function PlanCard({
  title,
  price,
  features,
  cta,
  onClick,
  disabled,
  accent,
}: {
  title: string;
  price: string;
  features: string[];
  cta: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-4 " + (accent ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-200")
      }
    >
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-xl font-bold mt-1">{price}</p>
      <ul className="mt-3 space-y-1 text-sm text-slate-700">
        {features.map((f) => (
          <li key={f}>• {f}</li>
        ))}
      </ul>
      <Tooltip label="Continue to Stripe checkout" side="top">
        <Button className="mt-4 w-full" onClick={onClick} disabled={disabled}>
          {cta}
        </Button>
      </Tooltip>
    </div>
  );
}
