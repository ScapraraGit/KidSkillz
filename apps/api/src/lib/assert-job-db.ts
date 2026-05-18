/**
 * Guard for nightly maintenance jobs. Refuses to run if DATABASE_URL hostname
 * is not in EXPECTED_DB_HOST_ALLOWLIST (comma-separated suffix list).
 * No-op when EXPECTED_DB_HOST_ALLOWLIST is unset (local dev / tests).
 */
export function assertJobDatabaseHost(): void {
  const allowlist = process.env.EXPECTED_DB_HOST_ALLOWLIST;
  if (!allowlist) return;

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }

  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }

  const suffixes = allowlist
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ok = suffixes.some((suffix) => host === suffix || host.endsWith(suffix));
  if (!ok) {
    throw new Error(
      `Refusing to run job: DATABASE_URL host '${host}' not in EXPECTED_DB_HOST_ALLOWLIST (${suffixes.join(", ")})`,
    );
  }
}
