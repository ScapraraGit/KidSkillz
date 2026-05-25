import type { NextFunction, Request, Response } from "express";
import type { FamilyMembership, Role } from "@prisma/client";
import { verifyToken, type JWTPayload } from "../lib/auth.js";
import { HttpError } from "../errors.js";
import { prisma } from "../db.js";
import { caregiverWindowActive, type CaregiverScope } from "../lib/invitations.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JWTPayload;
      // Active FamilyMembership for PARENT/CAREGIVER tokens that carry `mid`.
      // Null for CHILD and for legacy single-family tokens.
      membership?: FamilyMembership | null;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization") ?? "";
  const [scheme, headerToken] = header.split(" ");
  // Allow ?token=... for GET-only flows like <img>/<a href> for proof images.
  const queryToken = req.method === "GET" && typeof req.query.token === "string" ? req.query.token : null;
  const token = scheme === "Bearer" && headerToken ? headerToken : queryToken;
  if (!token) return next(HttpError.unauthorized());
  try {
    const payload = verifyToken(token);
    // family-select tokens are single-purpose; reject them everywhere except
    // the explicit /auth/select-family handler (which calls verifyToken directly).
    if (payload.scope === "family-select") {
      return next(HttpError.unauthorized("Family not selected"));
    }
    // tokenVersion gate. Tokens minted before the user bumped it (logout-everywhere)
    // are rejected immediately, before they can touch any handler. Skipped when the
    // token predates the field (`tv === undefined`) and the user hasn't bumped yet.
    if (payload.tv !== undefined) {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true, isActive: true },
      });
      if (!user || !user.isActive) return next(HttpError.unauthorized("Session ended"));
      if (user.tokenVersion !== payload.tv) {
        return next(HttpError.unauthorized("Session ended"));
      }
    }
    // PARENT/CAREGIVER tokens with `mid` must resolve to an active membership
    // whose familyId matches `fid`. This is the tenant-scope check: a stolen
    // token from family A can never grant access to family B because both
    // values are bound at mint time.
    if (payload.mid) {
      const m = await prisma.familyMembership.findUnique({ where: { id: payload.mid } });
      if (!m || m.userId !== payload.sub || m.familyId !== payload.fid || m.status !== "ACTIVE") {
        return next(HttpError.unauthorized("Session ended"));
      }
      if (m.validUntil && m.validUntil.getTime() < Date.now()) {
        return next(HttpError.unauthorized("Membership expired"));
      }
      req.membership = m;
    } else {
      req.membership = null;
    }
    req.auth = payload;
    next();
  } catch {
    next(HttpError.unauthorized("Invalid or expired token"));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(HttpError.unauthorized());
  if (!req.auth.adm) return next(HttpError.forbidden("Admin only"));
  // Belt-and-suspenders: confirm flag still set in DB (token could outlive a revoke).
  prisma.user
    .findUnique({ where: { id: req.auth.sub }, select: { isAdmin: true, isActive: true } })
    .then((u) => {
      if (!u || !u.isAdmin || !u.isActive) return next(HttpError.forbidden("Admin only"));
      next();
    })
    .catch(next);
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
      // Caregiver window + scope live on FamilyMembership only. Legacy tokens
      // without `mid` look up the user's first active membership so existing
      // sessions don't break across the Phase 3 cutover.
      let m = req.membership;
      if (!m) {
        m = await prisma.familyMembership.findFirst({
          where: { userId: req.auth.sub, status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
        });
        if (!m) throw HttpError.forbidden("Caregiver has no active membership");
      }
      const validFrom = m.validFrom;
      const validUntil = m.validUntil;
      const scope = (m.scope as CaregiverScope | null) ?? null;
      if (!caregiverWindowActive(validFrom, validUntil)) {
        throw HttpError.forbidden("Caregiver access window expired");
      }
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
