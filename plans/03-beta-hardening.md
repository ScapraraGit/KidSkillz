# Beta Hardening Plan

Pre-beta gap closure beyond shipped Tier 1–4 TODO items. Scope: auth abuse, uploads, privacy/legal, ops, quality, ledger integrity.

Effort: **S** <1d · **M** 1–3d · **L** >3d.

---

## P0 — Ship before any external beta user

### 1. Per-child PIN lockout — **S**
Threat: 4-digit PIN = 10k space; IP rate limiter useless on shared NAT or shared device.

- Schema: `ChildProfile.failedPinAttempts Int @default(0)`, `ChildProfile.pinLockedUntil DateTime?`.
- Service `apps/api/src/services/child-auth.ts`:
  - On wrong PIN: increment counter, on N≥5 set `pinLockedUntil = now + backoff(attempts)`. Exponential: 1m → 5m → 30m → 24h.
  - On success: reset counter + lock.
- Route [apps/api/src/routes/auth.ts:122](apps/api/src/routes/auth.ts#L122) checks lock before compare.
- Parent UI: "Unlock PIN" button on Edit Child modal — clears lock + counter. Audit-log it.
- Tests: pure-function `evaluatePinAttempt(state, ok, now)` → next state.

### 2. Shared-device login bcrypt amplification — **S**
[apps/api/src/routes/auth.ts:134-143](apps/api/src/routes/auth.ts#L134-L143) iterates every parent's bcrypt. N bcrypts/req = DoS + parent-count timing leak.

- Schema: `Family.devicePasswordHash String?` (separate from parent passwords).
- Parent Settings page: "Set shared-device password" form. Required when `childAuthMode = SHARED_DEVICE`.
- Login: compare once vs `devicePasswordHash`. Migrate existing families: first parent password copied on first SHARED_DEVICE login, prompt parent to set explicit device pw.
- Tests: route returns 401 in constant bcrypts regardless of parent count.

### 3. `/families/lookup` enumeration — **S**
Unauth partial-match leaks family + kid names globally.

- Replace with exact-match-only `name + familyCode` (6-char alphanumeric stored on Family).
- Family settings page surfaces familyCode; parent shares verbally with device.
- Hard rate limit: 10/min/IP via stricter `expressRateLimit` on this route.
- Audit log on every lookup hit (familyId, ip).

### 4. Upload hardening — **M**
[apps/api/src/routes/uploads.ts](apps/api/src/routes/uploads.ts)

- Add `file-type` lib: read first 4100 bytes of buffer, reject if detected mime ∉ {image/jpeg, image/png}.
- `sharp(buffer).rotate().toFormat(detected)` re-encodes; strips EXIF/GPS. Cap dimensions 4096×4096.
- `GET /v1/uploads/:key`: derive owning familyId from key prefix (`fam_<id>/...`) and require `req.auth.fid === keyFamilyId`. Reject `..`, `/`, `\` in `:key` param via Zod regex.
- Storage layer: store keys as `fam_<familyId>/<uuid>.<ext>`. Migration backfills existing keys + DB references.
- Tests: spoofed `.png` containing PHP → 400; cross-family key fetch → 404.

### 5. CAPTCHA / Turnstile on unauth endpoints — **S**
Targets: `/auth/parent/register`, `/auth/forgot-password`, `/auth/families/lookup` (after #3).

- Cloudflare Turnstile (free, no PII). `TURNSTILE_SECRET` env, `VITE_TURNSTILE_SITEKEY`.
- Middleware `requireTurnstile` POSTs `cf-turnstile-response` body field to siteverify. Fail-open if env unset (dev).

### 6. Ledger idempotency — **S**
Double-tap on flaky mobile = double credit.

- Client sends `Idempotency-Key: <uuid>` header on approve/redeem/adjust.
- Middleware `apps/api/src/middleware/idempotency.ts`: `IdempotencyKey` table `(key, familyId, route, responseJson, createdAt)` unique on `(familyId, key)`. Cache 24h. Return cached response on hit.
- Apply to: `POST /completions/:id/approve`, `/completions/bulk-approve`, `/redemptions/:id/approve`, `/adjustments`.

### 7. Nightly ledger reconciliation — **S**
- Job `apps/api/prisma/run-ledger-recon.ts`: per child, assert `SUM(amount) >= 0` (unless `family.allowNegativeBalance`). Alert via Sentry `captureMessage` on drift.
- Wire into [.github/workflows/nightly-jobs.yml](.github/workflows/nightly-jobs.yml).

---

## P1 — Ship in first beta week

### 8. JWT lifecycle — **M**
Stolen token currently forever-valid.

- Short access token: 15 min. Refresh token: 30 days, httpOnly cookie + rotation on use.
- `User.tokenVersion Int @default(0)`. `signToken` embeds it. `requireAuth` rejects mismatch. Logout-everywhere = bump version.
- New routes: `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`.

### 9. Password policy — **S**
- Add `zxcvbn` server-side: score ≥ 3 required.
- Reject top-10k common passwords (bundled list).
- Web shows strength meter inline.

### 10. CORS + CSP tighten — **S**
[apps/api/src/index.ts:39-47](apps/api/src/index.ts#L39-L47)

- `credentials: false` (JWT lives in header).
- Re-enable Helmet CSP with explicit allowlist: `default-src 'self'`, `img-src 'self' data: <storage-host>`, `connect-src 'self' <api-host> <sentry-ingest>`, `frame-ancestors 'none'`, `base-uri 'self'`.
- Test in staging — confetti / web fonts likely to break.

### 11. Sentry PII scrubbing — **S**
- `beforeSend` strips: `event.user.email`, `event.user.ip_address`, request body for `/auth/*`, query `token=` params.
- Verify in staging — trigger error w/ email payload, inspect captured event.

### 12. Email deliverability — **S**
- Resend domain: SPF (`include:resend.com`), DKIM (Resend-provided), DMARC `p=quarantine; rua=...`.
- Test with mail-tester.com — score ≥ 9.

### 13. Restore drill — **S**
Docs exist ([docs/operations/backup.md](docs/operations/backup.md)) — never executed.

- Provision throwaway Neon branch from PITR snapshot.
- Run app against it, log into seeded family, verify ledger sums.
- Time-box, record runbook timings.

### 14. Playwright smoke — **M**
Currently zero web tests. One golden-path E2E catches the loudest regressions cheap.

- `apps/web/e2e/golden-path.spec.ts`: parent register → verify email (stub) → create kid → create task → kid login → submit w/ photo → parent approve → balance reflects.
- CI job runs against ephemeral docker-compose stack.

### 15. Per-route integration tests — **M**
- `apps/api/src/routes/__tests__/*.test.ts` — supertest against test schema.
- Minimum: auth, tasks, completions/approve, redemptions/approve, adjustments. Happy path + 401 + cross-tenant 404.

---

## P2 — Beta month 1

### 16. COPPA / privacy review — **M**
- Document parental-consent gate: no kid record creatable until parent acceptedTermsVersion ≥ current.
- Privacy Policy declares: sub-processors (Resend, Sentry, Neon, Cloudflare), retention (proof N days, audit 1yr, deleted accounts purge 30d), kid-data parental access right.
- Add per-kid `parentalConsent` audit event on child create. Already covered by [services/audit.ts](apps/api/src/services/audit.ts)? Verify.
- Data export (Tier 1 done) — verify includes proof URLs + audit events.

### 17. Uptime + metrics — **S**
- BetterStack/UptimeRobot pings `/health` every 60s, alerts to email.
- Optional: `/metrics` Prometheus endpoint (prom-client) — request count, latency p95, DB pool in-use.

### 18. Load smoke — **S**
- k6 script: 50 concurrent kid submissions with 500KB photo. Watch latency p95 + Neon pool. Tune `connection_limit` in DATABASE_URL.

### 19. ClamAV upload scan — **M** (optional)
- Defer unless beta surfaces abusive uploads.

### 20. zxcvbn + bot-trap on register — **S** (rolled into #5 + #9)

---

## Sequencing

Week 1: 1 → 2 → 3 → 4 → 6 → 7 (security P0 + ledger safety).
Week 2: 5 → 8 → 9 → 10 → 11 (auth + transport).
Week 3: 12 → 13 → 14 → 15 (deliverability + tests).
Month 2: 16 → 17 → 18 (privacy + ops).

## Dependencies

- #3 blocks #5 (Turnstile applied after exact-match refactor).
- #4 backfill migration runs before any new client deploys.
- #8 requires web refactor of `lib/api.ts` to handle 401 → refresh → retry.
- #14 + #15 prereq: CI workflow already lands ([TODO Tier 1].

## Out of scope

- Native mobile app.
- Real-time (WebSocket) push notifications.
- Stripe billing — separate plan [01-stripe-billing.md](01-stripe-billing.md).
- Multi-region failover.
