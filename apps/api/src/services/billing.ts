import Stripe from "stripe";
import type { BillingOverride, PlanTier, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { HttpError } from "../errors.js";

// Lazy singleton — only instantiate Stripe when actually needed. Lets the API
// boot in environments where STRIPE_SECRET_KEY isn't set (CI, beta) without
// crashing on import.
let stripeSingleton: Stripe | null = null;
export function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw HttpError.serviceUnavailable("Stripe not configured", "STRIPE_UNCONFIGURED");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-11-20.acacia" as Stripe.LatestApiVersion,
    });
  }
  return stripeSingleton;
}

export interface Entitlement {
  status: SubscriptionStatus;
  plan: PlanTier;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  isPaid: boolean;
  isPremium: boolean;
  // Where the entitlement decision came from. Lets UI explain why a family is
  // not blocked even with a CANCELED Stripe state (admin comped them).
  source: "STRIPE" | "TRIAL" | "OVERRIDE";
  override: BillingOverride;
  overrideReason: string | null;
  overrideUntil: Date | null;
}

/**
 * Resolve effective billing entitlement for a family.
 *
 * Order:
 *   1. Admin override wins (FREE_FOREVER / COMPED_PREMIUM unconditional,
 *      FREE_UNTIL only while not expired).
 *   2. Otherwise read Stripe-derived state (subscriptionStatus + trialEndsAt).
 *
 * Webhooks keep updating Stripe fields even while an override is active, so
 * clearing an override later restores the correct paid/canceled/etc. state
 * with no manual reconciliation.
 */
export async function getEntitlement(familyId: string): Promise<Entitlement> {
  const fam = await prisma.family.findUnique({
    where: { id: familyId },
    select: {
      subscriptionStatus: true,
      currentPlan: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      billingOverride: true,
      billingOverrideReason: true,
      billingOverrideUntil: true,
    },
  });
  if (!fam) throw HttpError.notFound("Family not found");
  const now = Date.now();

  // Override layer.
  if (fam.billingOverride === "FREE_FOREVER") {
    return overrideEntitlement(fam, "BASIC");
  }
  if (fam.billingOverride === "COMPED_PREMIUM") {
    return overrideEntitlement(fam, "PREMIUM");
  }
  if (fam.billingOverride === "FREE_UNTIL") {
    if (fam.billingOverrideUntil && fam.billingOverrideUntil.getTime() > now) {
      return overrideEntitlement(fam, fam.currentPlan);
    }
    // Expired FREE_UNTIL — fall through to Stripe state.
  }

  // Stripe layer.
  const trialActive = fam.trialEndsAt && fam.trialEndsAt.getTime() > now;
  const isPaid =
    fam.subscriptionStatus === "ACTIVE" || (fam.subscriptionStatus === "TRIALING" && !!trialActive);
  return {
    status: fam.subscriptionStatus,
    plan: fam.currentPlan,
    trialEndsAt: fam.trialEndsAt,
    currentPeriodEnd: fam.currentPeriodEnd,
    cancelAtPeriodEnd: fam.cancelAtPeriodEnd,
    isPaid,
    isPremium: isPaid && fam.currentPlan === "PREMIUM",
    source: trialActive && fam.subscriptionStatus === "TRIALING" ? "TRIAL" : "STRIPE",
    override: fam.billingOverride,
    overrideReason: fam.billingOverrideReason,
    overrideUntil: fam.billingOverrideUntil,
  };
}

function overrideEntitlement(
  fam: {
    billingOverride: BillingOverride;
    billingOverrideReason: string | null;
    billingOverrideUntil: Date | null;
    subscriptionStatus: SubscriptionStatus;
    currentPlan: PlanTier;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  },
  effectivePlan: PlanTier,
): Entitlement {
  return {
    status: "ACTIVE",
    plan: effectivePlan,
    trialEndsAt: fam.trialEndsAt,
    currentPeriodEnd: fam.currentPeriodEnd,
    cancelAtPeriodEnd: fam.cancelAtPeriodEnd,
    isPaid: true,
    isPremium: effectivePlan === "PREMIUM",
    source: "OVERRIDE",
    override: fam.billingOverride,
    overrideReason: fam.billingOverrideReason,
    overrideUntil: fam.billingOverrideUntil,
  };
}

/**
 * Set trial window on family create. Idempotent: only sets when trialEndsAt is
 * currently null. No Stripe API call — Stripe customer is created lazily on
 * first checkout.
 */
export async function startTrial(familyId: string): Promise<void> {
  const fam = await prisma.family.findUnique({
    where: { id: familyId },
    select: { trialEndsAt: true },
  });
  if (!fam || fam.trialEndsAt) return;
  const trialEndsAt = new Date(Date.now() + env.BILLING_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.family.update({
    where: { id: familyId },
    data: { subscriptionStatus: "TRIALING", trialEndsAt },
  });
}

export interface PlanPrice {
  plan: PlanTier;
  priceId: string;
  unitAmount: number; // cents
  currency: string;
  interval: string; // "month" | "year"
}

// Cache Stripe price lookups for 10 minutes so /billing/status isn't a Stripe
// round-trip per call. Prices change rarely; admin can restart to invalidate.
let priceCache: { at: number; data: PlanPrice[] } | null = null;
const PRICE_TTL_MS = 10 * 60_000;

export async function listPlanPrices(): Promise<PlanPrice[]> {
  if (!env.STRIPE_SECRET_KEY) return [];
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.data;
  const ids: { plan: PlanTier; id: string }[] = [];
  if (env.STRIPE_PRICE_BASIC_MONTHLY) ids.push({ plan: "BASIC", id: env.STRIPE_PRICE_BASIC_MONTHLY });
  if (env.STRIPE_PRICE_PREMIUM_MONTHLY) ids.push({ plan: "PREMIUM", id: env.STRIPE_PRICE_PREMIUM_MONTHLY });
  const data: PlanPrice[] = [];
  for (const { plan, id } of ids) {
    try {
      const p = await stripe().prices.retrieve(id);
      data.push({
        plan,
        priceId: p.id,
        unitAmount: p.unit_amount ?? 0,
        currency: p.currency,
        interval: p.recurring?.interval ?? "month",
      });
    } catch (e) {
      console.error(`[billing:listPlanPrices ${plan}]`, e);
    }
  }
  priceCache = { at: Date.now(), data };
  return data;
}

export async function ensureStripeCustomer(familyId: string): Promise<string> {
  const fam = await prisma.family.findUnique({
    where: { id: familyId },
    select: {
      id: true,
      name: true,
      stripeCustomerId: true,
      users: { where: { role: "PARENT" }, select: { email: true, name: true }, take: 1 },
    },
  });
  if (!fam) throw HttpError.notFound("Family not found");
  if (fam.stripeCustomerId) return fam.stripeCustomerId;
  const owner = fam.users[0];
  const customer = await stripe().customers.create({
    email: owner?.email ?? undefined,
    name: fam.name,
    metadata: { familyId: fam.id },
  });
  await prisma.family.update({
    where: { id: familyId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export async function createCheckoutSession(familyId: string, plan: PlanTier): Promise<string> {
  const priceId = plan === "PREMIUM" ? env.STRIPE_PRICE_PREMIUM_MONTHLY : env.STRIPE_PRICE_BASIC_MONTHLY;
  if (!priceId) throw HttpError.serviceUnavailable("Plan price not configured", "PLAN_UNCONFIGURED");
  const customerId = await ensureStripeCustomer(familyId);
  const base = env.APP_URL.replace(/\/$/, "");
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/parent/settings?status=success#billing`,
    cancel_url: `${base}/parent/settings?status=cancel#billing`,
    client_reference_id: familyId,
    metadata: { familyId, plan },
    subscription_data: { metadata: { familyId, plan } },
  });
  if (!session.url) throw HttpError.serviceUnavailable("Checkout session missing URL");
  return session.url;
}

export async function createPortalSession(familyId: string): Promise<string> {
  const fam = await prisma.family.findUnique({
    where: { id: familyId },
    select: { stripeCustomerId: true },
  });
  if (!fam?.stripeCustomerId) throw HttpError.badRequest("No Stripe customer on file", "NO_CUSTOMER");
  const base = env.APP_URL.replace(/\/$/, "");
  const session = await stripe().billingPortal.sessions.create({
    customer: fam.stripeCustomerId,
    return_url: `${base}/parent/settings#billing`,
  });
  return session.url;
}

const stripeStatusMap: Record<string, SubscriptionStatus> = {
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "CANCELED",
  unpaid: "UNPAID",
  paused: "PAST_DUE",
};

function priceToPlan(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_PREMIUM_MONTHLY) return "PREMIUM";
  if (priceId === env.STRIPE_PRICE_BASIC_MONTHLY) return "BASIC";
  return null;
}

/**
 * Handle a verified Stripe event. Idempotent via the StripeEvent table —
 * duplicate event ids are no-ops.
 */
export async function handleWebhook(event: Stripe.Event): Promise<void> {
  // Idempotency: try to claim the event id; if already present, skip.
  try {
    await prisma.stripeEvent.create({
      data: {
        id: event.id,
        type: event.type,
        payload: event as unknown as object,
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002") return; // duplicate — already processed
    throw e;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const familyId = (session.metadata?.familyId as string) || (session.client_reference_id as string);
      if (familyId && typeof session.subscription === "string") {
        await prisma.family.update({
          where: { id: familyId },
          data: { stripeSubscriptionId: session.subscription },
        });
        await prisma.stripeEvent.update({ where: { id: event.id }, data: { familyId } });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const familyId = (sub.metadata?.familyId as string) || null;
      const fam = familyId
        ? await prisma.family.findUnique({ where: { id: familyId }, select: { id: true } })
        : await prisma.family.findFirst({
            where: { stripeSubscriptionId: sub.id },
            select: { id: true },
          });
      if (!fam) {
        console.warn("[webhook] subscription event with no matching family", {
          subId: sub.id,
          metadataFamilyId: sub.metadata?.familyId,
        });
        break;
      }
      const status = stripeStatusMap[sub.status] ?? "INCOMPLETE";
      const priceId = sub.items.data[0]?.price?.id;
      const plan = priceToPlan(priceId) ?? undefined;
      console.log("[webhook] subscription update", {
        familyId: fam.id,
        eventType: event.type,
        status,
        priceId,
        envBasic: env.STRIPE_PRICE_BASIC_MONTHLY,
        envPremium: env.STRIPE_PRICE_PREMIUM_MONTHLY,
        resolvedPlan: plan,
      });
      await prisma.family.update({
        where: { id: fam.id },
        data: {
          stripeSubscriptionId: sub.id,
          subscriptionStatus: status,
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          ...(plan ? { currentPlan: plan } : {}),
        },
      });
      await prisma.stripeEvent.update({ where: { id: event.id }, data: { familyId: fam.id } });
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      if (typeof inv.subscription === "string") {
        const fam = await prisma.family.findFirst({
          where: { stripeSubscriptionId: inv.subscription },
          select: { id: true },
        });
        if (fam) {
          await prisma.family.update({
            where: { id: fam.id },
            data: { subscriptionStatus: "PAST_DUE" },
          });
          await prisma.stripeEvent.update({ where: { id: event.id }, data: { familyId: fam.id } });
        }
      }
      break;
    }
    default:
      // Unhandled type — row inserted for audit. No state mutation.
      break;
  }
}

// --- Admin overrides ---

export interface SetOverrideInput {
  type: BillingOverride;
  reason: string;
  until?: Date | null;
}

export async function setBillingOverride(
  familyId: string,
  adminId: string,
  input: SetOverrideInput,
): Promise<void> {
  if (input.type === "NONE") {
    throw HttpError.badRequest("Use clearBillingOverride for NONE", "INVALID_OVERRIDE");
  }
  if (input.type === "FREE_UNTIL" && !input.until) {
    throw HttpError.badRequest("FREE_UNTIL requires `until`", "MISSING_UNTIL");
  }
  if (input.type !== "FREE_UNTIL" && input.until) {
    throw HttpError.badRequest("`until` only valid with FREE_UNTIL", "INVALID_UNTIL");
  }
  const current = await prisma.family.findUnique({
    where: { id: familyId },
    select: { billingOverride: true },
  });
  if (!current) throw HttpError.notFound("Family not found");

  await prisma.$transaction([
    prisma.family.update({
      where: { id: familyId },
      data: {
        billingOverride: input.type,
        billingOverrideReason: input.reason,
        billingOverrideBy: adminId,
        billingOverrideAt: new Date(),
        billingOverrideUntil: input.until ?? null,
      },
    }),
    prisma.billingOverrideLog.create({
      data: {
        familyId,
        adminId,
        action: "SET",
        prevType: current.billingOverride,
        newType: input.type,
        reason: input.reason,
        until: input.until ?? null,
      },
    }),
  ]);
}

export async function clearBillingOverride(familyId: string, adminId: string, reason: string): Promise<void> {
  const current = await prisma.family.findUnique({
    where: { id: familyId },
    select: { billingOverride: true },
  });
  if (!current) throw HttpError.notFound("Family not found");
  if (current.billingOverride === "NONE") return;

  await prisma.$transaction([
    prisma.family.update({
      where: { id: familyId },
      data: {
        billingOverride: "NONE",
        billingOverrideReason: null,
        billingOverrideBy: adminId,
        billingOverrideAt: new Date(),
        billingOverrideUntil: null,
      },
    }),
    prisma.billingOverrideLog.create({
      data: {
        familyId,
        adminId,
        action: "CLEAR",
        prevType: current.billingOverride,
        newType: "NONE",
        reason,
      },
    }),
  ]);
}

export async function listOverrideLog(familyId: string) {
  return prisma.billingOverrideLog.findMany({
    where: { familyId },
    orderBy: { createdAt: "desc" },
  });
}
