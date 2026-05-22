import "dotenv/config";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    const dbKeys = Object.keys(process.env).filter((k) => /DATA|URL|PG|POSTGRES/i.test(k));
    console.error("env keys matching DATA/URL/PG/POSTGRES:", dbKeys);
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: req("DATABASE_URL"),
  // JWT_SECRET is required. No fallback — prod deploys must fail loudly if the
  // secret is missing rather than silently boot with a weak key.
  JWT_SECRET: (() => {
    const v = process.env.JWT_SECRET;
    if (!v || v.length < 32) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("JWT_SECRET must be set to a 32+ char random value in production");
      }
      // Dev/test: allow weak secret but warn loudly.
      if (!v) console.warn("[env] JWT_SECRET unset; using insecure dev value");
      return v ?? "dev-only-insecure-secret-do-not-use-in-prod";
    }
    return v;
  })(),
  JWT_TTL: process.env.JWT_TTL ?? "7d",
  // Short-lived access token. 15 minutes is the common balance between user
  // friction and stolen-token window.
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? "15m",
  // Refresh token lifetime. Shortened from 30d → 7d to reduce the stolen-token
  // window since refresh tokens live in localStorage (XSS-exposed) pending the
  // httpOnly cookie migration.
  REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
  // Run the idempotent seed at container startup. Off by default in prod — a
  // buggy seed shouldn't crash a deploy. Flip on for first-deploy or local dev.
  SEED_ON_STARTUP: (process.env.SEED_ON_STARTUP ?? "false").toLowerCase() === "true",
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "/data/uploads",
  UPLOAD_MAX_BYTES: Number(process.env.UPLOAD_MAX_BYTES ?? 5_242_880),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  APP_URL: process.env.APP_URL ?? "http://localhost:5173",
  SENTRY_DSN: process.env.SENTRY_DSN ?? "",
  // Photo proof is hidden behind a feature flag until S3 storage + automatic
  // retention/expiry sweeps are wired up. Until then the only proof options
  // surfaced anywhere are NONE / NOTES_OPTIONAL / NOTES_REQUIRED. Flip to "true"
  // when S3 + the photo-retention cron are both deployed.
  PHOTO_PROOF_ENABLED: (process.env.PHOTO_PROOF_ENABLED ?? "false").toLowerCase() === "true",
  // Cloudflare Turnstile secret for the siteverify call. Unset = fail-open (dev/local).
  TURNSTILE_SECRET: process.env.TURNSTILE_SECRET ?? "",
  // Gates the device-pairing endpoints + middleware. Off by default until the
  // web /pair page + Settings devices card ship in the follow-up PR.
  DEVICE_PAIRING_ENABLED: (process.env.DEVICE_PAIRING_ENABLED ?? "false").toLowerCase() === "true",
  // Guardian consent acknowledgement on child-profile creation. Off for personal
  // family deployments. Flip on for school/organization deployments where staff
  // (not the legal guardian) create profiles and a documented guardian consent
  // record is required for each child. When true: the web modal shows the
  // consent block and the API requires consentAcknowledged=true and writes a
  // LegalAcceptance row tagged CHILD_PROFILE_CONSENT.
  ORG_CONSENT_REQUIRED: (process.env.ORG_CONSENT_REQUIRED ?? "false").toLowerCase() === "true",
  // Resend transactional email. EMAIL_ENABLED is the kill-switch: when false
  // (default) the provider factory returns a ConsoleProvider so dev/local does
  // not hit the network and verification/reset flows still log a usable URL.
  // Flip true only once the sending domain is verified in Resend.
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "ChoreChampz <no-reply@chorechampz.com>",
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO ?? "",
  EMAIL_ENABLED: (process.env.EMAIL_ENABLED ?? "false").toLowerCase() === "true",
  // --- Billing (Stripe) ---
  // BILLING_ENABLED is the server-side master kill-switch. When false:
  //   - /billing/* routes 404
  //   - requirePaidEntitlement middleware short-circuits to allow
  //   - admin override endpoints remain available (so comps can be staged)
  // Default false during beta; flip true post-launch.
  BILLING_ENABLED: (process.env.BILLING_ENABLED ?? "false").toLowerCase() === "true",
  BILLING_TRIAL_DAYS: Number(process.env.BILLING_TRIAL_DAYS ?? 10),
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  STRIPE_PRICE_BASIC_MONTHLY: process.env.STRIPE_PRICE_BASIC_MONTHLY ?? "",
  STRIPE_PRICE_PREMIUM_MONTHLY: process.env.STRIPE_PRICE_PREMIUM_MONTHLY ?? "",
};
