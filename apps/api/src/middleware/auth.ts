import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { verifyToken, type JWTPayload } from "../lib/auth.js";
import { HttpError } from "../errors.js";
import { prisma } from "../db.js";
import { caregiverWindowActive, type CaregiverScope } from "../lib/invitations.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JWTPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const [scheme, headerToken] = header.split(" ");
  // Allow ?token=... for GET-only flows like <img>/<a href> for proof images.
  const queryToken = req.method === "GET" && typeof req.query.token === "string" ? req.query.token : null;
  const token = scheme === "Bearer" && headerToken ? headerToken : queryToken;
  if (!token) return next(HttpError.unauthorized());
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    next(HttpError.unauthorized("Invalid or expired token"));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(HttpError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(HttpError.forbidden());
    next();
  };
}

type ScopeKey = keyof Omit<CaregiverScope, "kidIds">;

// Allows PARENT unconditionally. Allows CAREGIVER if active window + scope flag set.
// Optional kidId enforces caregiver kidIds restriction (empty list = all kids).
export function requireParentOrCaregiver(
  scopeKey: ScopeKey,
  getKidId?: (req: Request) => string | undefined,
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth) throw HttpError.unauthorized();
      if (req.auth.role === "PARENT") return next();
      if (req.auth.role !== "CAREGIVER") throw HttpError.forbidden();
      const user = await prisma.user.findUnique({ where: { id: req.auth.sub } });
      if (!user || !user.isActive) throw HttpError.forbidden("Caregiver inactive");
      if (!caregiverWindowActive(user.validFrom, user.validUntil)) {
        throw HttpError.forbidden("Caregiver access window expired");
      }
      const scope = (user.scope as CaregiverScope | null) ?? null;
      if (!scope || !scope[scopeKey]) throw HttpError.forbidden("Caregiver lacks permission");
      if (getKidId && scope.kidIds.length > 0) {
        const kidId = getKidId(req);
        if (kidId && !scope.kidIds.includes(kidId)) {
          throw HttpError.forbidden("Caregiver not assigned to this child");
        }
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
