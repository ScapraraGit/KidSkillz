import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../env.js";
import type { Role } from "@prisma/client";

export interface JWTPayload {
  sub: string; // user id
  fid: string; // family id
  role: Role;
  adm?: boolean; // admin flag — gates /admin endpoints
  tv?: number;   // tokenVersion at mint; rejected on mismatch (logout-everywhere)
}

// Access tokens are short-lived; refresh tokens carry the long horizon.
// Override via JWT_ACCESS_TTL if the deployment needs different timing.
const ACCESS_TTL = env.JWT_ACCESS_TTL;

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TTL } as SignOptions);
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, env.JWT_SECRET) as JWTPayload;
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const comparePassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
