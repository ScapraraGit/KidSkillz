import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";
import { HttpError } from "../errors.js";
import { getEntitlement } from "../services/billing.js";

/**
 * Gate: family must have a paid or trialing-active entitlement to proceed.
 *
 * Bypasses:
 *   - BILLING_ENABLED=false → kill-switch, allow everything
 *   - admin override → already encoded in entitlement.isPaid
 *   - missing req.auth → handled upstream by requireAuth; this middleware
 *     should always sit AFTER requireAuth
 */
export async function requirePaidEntitlement(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!env.BILLING_ENABLED) return next();
  if (!req.auth?.fid) return next(HttpError.unauthorized());
  try {
    const ent = await getEntitlement(req.auth.fid);
    if (ent.isPaid) return next();
    return next(HttpError.paymentRequired("Subscription required", "BILLING_REQUIRED"));
  } catch (e) {
    next(e);
  }
}

/**
 * Gate: family must have an active PREMIUM plan (paid OR admin-comped premium).
 * Use on premium-only endpoints.
 */
export async function requirePremium(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!env.BILLING_ENABLED) return next();
  if (!req.auth?.fid) return next(HttpError.unauthorized());
  try {
    const ent = await getEntitlement(req.auth.fid);
    if (ent.isPremium) return next();
    return next(HttpError.paymentRequired("Premium plan required", "PREMIUM_REQUIRED"));
  } catch (e) {
    next(e);
  }
}
