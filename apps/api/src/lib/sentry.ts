import * as Sentry from "@sentry/node";
import { env } from "../env.js";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (!env.SENTRY_DSN) return; // disabled when no DSN provided (dev default).
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Conservative defaults — bump in production once traffic is understood.
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
  initialized = true;
  // eslint-disable-next-line no-console
  console.log("[sentry] initialized");
}

export { Sentry };
