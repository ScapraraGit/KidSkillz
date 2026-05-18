import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors.js";
import { findActiveDeviceByToken, touchDevice } from "../services/device-pairing.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      device?: { id: string; familyId: string };
    }
  }
}

const HEADER = "x-device-token";

/**
 * Gates a route on a valid, non-revoked EnrolledDevice. Attaches
 * `req.device = { id, familyId }` so handlers can scope queries by the device's
 * family without trusting any user-supplied familyId.
 *
 * Pure family-scope check — does NOT identify a user. Pair with PIN check or
 * requireAuth when user identity matters.
 */
export async function requireDeviceToken(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const raw = req.header(HEADER)?.trim();
  if (!raw) return next(HttpError.unauthorized("Device not paired"));
  const device = await findActiveDeviceByToken(raw);
  if (!device) return next(HttpError.unauthorized("Device not paired"));
  req.device = device;
  // Best-effort lastSeenAt bump, fire-and-forget.
  void touchDevice(device.id);
  next();
}
