import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { verifyToken, type JWTPayload } from "../lib/auth.js";
import { HttpError } from "../errors.js";

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
  const queryToken =
    req.method === "GET" && typeof req.query.token === "string" ? req.query.token : null;
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
