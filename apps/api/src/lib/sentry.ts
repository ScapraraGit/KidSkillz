import * as Sentry from "@sentry/node";
import { env } from "../env.js";

let initialized = false;

// Endpoints whose request bodies routinely carry secrets (passwords, reset
// tokens, JWTs, PINs). Bodies on these paths are stripped wholesale before
// events leave the process.
const SENSITIVE_PATH_RE = /\/v1\/auth\//i;

// Query params with secrets that occasionally land in error contexts.
const SENSITIVE_QUERY_KEYS = ["token", "pin", "password", "code", "nonce"];

function scrubUrl(raw: string): string {
  try {
    // URL parser needs an origin — synthesize one if the value is path-only.
    const hasOrigin = /^https?:\/\//.test(raw);
    const u = new URL(hasOrigin ? raw : `http://placeholder.local${raw}`);
    for (const k of SENSITIVE_QUERY_KEYS) {
      if (u.searchParams.has(k)) u.searchParams.set(k, "[Filtered]");
    }
    return hasOrigin ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return raw;
  }
}

export function initSentry(): void {
  if (initialized) return;
  if (!env.SENTRY_DSN) return; // disabled when no DSN provided (dev default).
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      // 1. Identity fields — never ship user email or IP, even if the SDK
      // captured them through a request integration.
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      const req = event.request;
      if (req) {
        const url = typeof req.url === "string" ? req.url : "";
        // 2. Body — wipe on the auth surface, otherwise keep small bodies that
        // help debugging but redact any password-shaped key everywhere.
        if (req.data) {
          if (SENSITIVE_PATH_RE.test(url)) {
            req.data = "[Filtered]";
          } else if (typeof req.data === "object" && req.data !== null) {
            const d = req.data as Record<string, unknown>;
            for (const k of Object.keys(d)) {
              if (/password|token|pin|secret|otp|hash/i.test(k)) d[k] = "[Filtered]";
            }
          }
        }
        // 3. Query string — strip known sensitive param names regardless of path.
        if (url) req.url = scrubUrl(url);
        // 4. Headers — drop authorization / cookies / device tokens.
        if (req.headers && typeof req.headers === "object") {
          const h = req.headers as Record<string, unknown>;
          for (const k of Object.keys(h)) {
            if (/authorization|cookie|x-device-token|x-api-key/i.test(k)) {
              h[k] = "[Filtered]";
            }
          }
        }
      }
      return event;
    },
  });
  initialized = true;
  // eslint-disable-next-line no-console
  console.log("[sentry] initialized");
}

export { Sentry };
