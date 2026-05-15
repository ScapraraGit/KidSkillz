import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";
import { HttpError } from "../errors.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

/**
 * Cloudflare Turnstile verifier. Reads `cf-turnstile-response` from the request
 * body. Fails open when TURNSTILE_SECRET is unset so local dev / tests aren't
 * gated behind a third-party call.
 */
export async function requireTurnstile(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!env.TURNSTILE_SECRET) return next();
  const token = (req.body?.["cf-turnstile-response"] as string | undefined) ?? "";
  if (!token) return next(HttpError.badRequest("Missing CAPTCHA token", "CAPTCHA_REQUIRED"));
  try {
    const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    const ip = req.header("cf-connecting-ip") ?? req.ip;
    if (ip) form.set("remoteip", ip);
    const resp = await fetch(VERIFY_URL, { method: "POST", body: form });
    const data = (await resp.json()) as SiteverifyResponse;
    if (!data.success) {
      return next(HttpError.badRequest("CAPTCHA verification failed", "CAPTCHA_FAILED"));
    }
    next();
  } catch (e) {
    console.error("[turnstile:verify]", e);
    next(HttpError.serviceUnavailable("CAPTCHA service unavailable", "CAPTCHA_UNAVAILABLE"));
  }
}
