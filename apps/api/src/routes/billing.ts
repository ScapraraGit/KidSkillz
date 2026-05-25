import { Router, raw } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type Stripe from "stripe";
import { env } from "../env.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";

// Billing actions (checkout, portal) are gated on the per-family billing owner
// rather than role=PARENT. A co-parent who joined an existing family later can
// see entitlement status but cannot move money until ownership is transferred.
// Legacy single-family tokens with no `mid` fall back to role=PARENT for back-compat
// during the Phase 2 cutover.
async function requireBillingOwner(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) return next(HttpError.unauthorized());
    if (req.membership) {
      if (req.membership.role !== "PARENT") return next(HttpError.forbidden("Parents only"));
      if (!req.membership.isBillingOwner) {
        return next(HttpError.forbidden("Only the family billing owner can manage billing"));
      }
      return next();
    }
    if (req.auth.role !== "PARENT") return next(HttpError.forbidden("Parents only"));
    next();
  } catch (e) {
    next(e as Error);
  }
}
import {
  createCheckoutSession,
  createPortalSession,
  getEntitlement,
  handleWebhook,
  listPlanPrices,
  stripe,
} from "../services/billing.js";

export const billingRouter = Router();

// Master kill-switch — when off, every /billing/* route 404s.
billingRouter.use((_req, res, next) => {
  if (!env.BILLING_ENABLED) return res.status(404).json({ error: "NOT_FOUND" });
  next();
});

billingRouter.get("/status", requireAuth, async (req, res) => {
  const [ent, plans] = await Promise.all([getEntitlement(req.auth!.fid), listPlanPrices()]);
  res.json({ entitlement: ent, plans });
});

const checkoutSchema = z.object({ plan: z.enum(["BASIC", "PREMIUM"]) });

billingRouter.post("/checkout", requireAuth, requireBillingOwner, async (req, res) => {
  const { plan } = checkoutSchema.parse(req.body);
  const url = await createCheckoutSession(req.auth!.fid, plan);
  res.json({ url });
});

billingRouter.post("/portal", requireAuth, requireBillingOwner, async (req, res) => {
  const url = await createPortalSession(req.auth!.fid);
  res.json({ url });
});

/**
 * Stripe webhook. Mounted with `express.raw` so the signature can be verified
 * against the unparsed body. The /v1 mount in app.ts wires this BEFORE
 * express.json so JSON parsing doesn't run on this path.
 */
export const billingWebhookHandler = [
  raw({ type: "application/json" }),
  async (req: any, res: any, next: any) => {
    if (!env.BILLING_ENABLED) return res.status(404).json({ error: "NOT_FOUND" });
    if (!env.STRIPE_WEBHOOK_SECRET) {
      return next(HttpError.serviceUnavailable("Webhook secret unconfigured", "WEBHOOK_UNCONFIGURED"));
    }
    const sig = req.header("stripe-signature");
    if (!sig) return next(HttpError.badRequest("Missing stripe-signature", "BAD_SIGNATURE"));
    let event: Stripe.Event;
    try {
      event = stripe().webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      return next(HttpError.badRequest("Invalid Stripe signature", "BAD_SIGNATURE"));
    }
    try {
      await handleWebhook(event);
      res.json({ received: true });
    } catch (e) {
      next(e);
    }
  },
];
