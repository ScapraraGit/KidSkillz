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
  JWT_SECRET: req("JWT_SECRET", "dev-secret-change-me"),
  JWT_TTL: process.env.JWT_TTL ?? "7d",
  // Short-lived access token. 15 minutes is the common balance between user
  // friction and stolen-token window.
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? "15m",
  // Refresh token lifetime. Each use rotates and resets the clock client-side.
  REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
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
  DEVICE_PAIRING_ENABLED:
    (process.env.DEVICE_PAIRING_ENABLED ?? "false").toLowerCase() === "true",
};
