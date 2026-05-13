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
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "/data/uploads",
  UPLOAD_MAX_BYTES: Number(process.env.UPLOAD_MAX_BYTES ?? 5_242_880),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  APP_URL: process.env.APP_URL ?? "http://localhost:5173",
  SENTRY_DSN: process.env.SENTRY_DSN ?? "",
};
