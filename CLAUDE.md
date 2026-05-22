# ChoreChampz — Claude Context

Monorepo. Kids/teens earn credit for chores, parents approve, reward catalog. Multi-family from day one.

## Stack

- pnpm workspaces, Node 20, TypeScript 5.6, ESM (`"type": "module"`).
- `apps/api` — Express 4 + Prisma 5 (Postgres) + Zod + JWT.
- `apps/web` — React 18 + Vite + Tailwind + TanStack Query + Zustand.
- `apps/demo` — internal GIF recorder (not shipped).
- `packages/shared` — DTOs + enums consumed by web and api.

## Architecture rules

- **Routes are thin.** All business logic lives in `apps/api/src/services/*`. A second client (mobile) must not be able to bypass earning/redemption pauses, proof requirements, or balance guards.
- **Tenant isolation.** Every domain table has `familyId`. Every service takes `familyId` as its first arg. Prisma queries always scope by `familyId`. There is no read across families.
- **Append-only ledger.** Balance is `SUM(amount)` over `LedgerEntry`. No mutable balance column. Negative posts blocked by `postLedger()` unless `family.allowNegativeBalance` is on.
- **Recurring tasks** are not materialized — `GET /tasks/today` walks active templates and joins `TaskCompletion` by `(taskId, childId, occurrenceDate)`.
- **Proof requirement resolves child override > task setting.** Six levels in `ProofRequirement` enum.
- **Storage** behind `StorageProvider` interface — swap LocalStorage → S3 by writing one class.
- **Email** behind `EmailProvider` interface in [apps/api/src/lib/email-provider.ts](apps/api/src/lib/email-provider.ts). `EMAIL_ENABLED=true` selects `ResendProvider`; `false` (default) selects `ConsoleProvider` for dev/local. Templates render to `{subject, html, text}` in `apps/api/src/email/templates/`. Call sites in `apps/api/src/lib/email.ts` keep stable signatures (`sendInvitationEmail`, `sendVerificationEmail`, `sendPasswordResetEmail`, `sendNotificationEmail`). Verify / reset / invite **rethrow** on provider error; notification **swallows** (fire-and-forget mirror of in-app alert). For auth flows that must not leak account existence (forgot-password), wrap the send in try/catch at the SERVICE level — a 500 from the email send would otherwise distinguish "known account, send failed" from "unknown account, silent no-op".
- **Auth** is JWT (`{sub, fid, role}`). Middleware: `requireAuth`, `requireRole`, `requireParentOrCaregiver`.
- **Public-by-design routes.** When the credential is a token in the URL (invitation accept, password reset, device pairing redemption, family lookup), the route is intentionally unauthenticated. Apply `requireAuth` **per route**, not via `router.use(requireAuth)`. A router-wide guard above a mix of public + protected routes 401s the public ones — bug observed historically when `invitationsRouter.use(requireAuth)` broke `/by-token/:token` and `/by-token/:token/accept`.

## Conventions

- Error model: throw `HttpError.<kind>(msg, code?)` from `apps/api/src/errors.ts`. Express error middleware serializes `{error, message}`.
- Time helpers in `apps/api/src/lib/time.ts` — never `new Date()` without TZ awareness for family-scoped logic.
- Service exports a `serialize*()` for any Prisma model exposed to clients. Never leak Prisma rows raw.
- Web `lib/api.ts` is the only fetch wrapper. Always go through it for auth headers.
- CORS: `CORS_ORIGIN` accepts a comma-separated list, parsed in [apps/api/src/app.ts](apps/api/src/app.ts). Lets apex + www + a Railway preview URL all be allowed against the same API. Exact-match only — no wildcards.
- Mobile-responsive page chrome: `PageHeader` ([apps/web/src/components/ui.tsx](apps/web/src/components/ui.tsx)) is `flex-col` on small screens, `sm:flex-row` desktop. Right-slot action group should use `flex-wrap` so multiple buttons reflow on phone widths.
- Onboarding tour targets: prefer `data-tour="<id>"` over `id="<id>"` for elements the tour anchors to. Multiple layouts (mobile bottom nav, desktop top nav, hidden popover menu) render the same logical link; using `data-tour` lets [OnboardingTour.tsx](apps/web/src/components/OnboardingTour.tsx) pick the first visible match without ID collisions. `getElementById` fallback stays for legacy targets.
- Family code for kid login uses a restricted alphabet ([apps/api/src/services/family.ts](apps/api/src/services/family.ts) `CODE_ALPHABET`) that omits visually ambiguous glyphs (0/O, 1/I/L, B/8, U/V). Existing codes generated before this list shrank stay valid; the client filter accepts the full `[A-Z0-9]` set so older codes still work.
- Web persists last-successful family lookup in `localStorage` via [apps/web/src/lib/lastFamily.ts](apps/web/src/lib/lastFamily.ts) so kids on shared devices don't re-type the 6-char code each session. 90-day age-out. Cleared on 404 (likely rotated) and on explicit "Switch family". Deep-link prefill: `/child?fc=<code>&fn=<name>` from the QR on Parent Settings; query params win over the localStorage fallback so a fresh QR can't be overridden by stale entry.
- Device pairing accepts `longLived: true` on `POST /family/devices/enroll` for beta testers — pairing code TTL extends from 10 minutes to 7 days. TTL clamped server-side to `[10min, 7d]` regardless of client value. The minted `EnrolledDevice` has no expiry change.

## Commands

```
pnpm install
pnpm dev                  # docker compose up --build
pnpm lint                 # eslint
pnpm format               # prettier --write
pnpm typecheck            # tsc per workspace
pnpm test                 # vitest per workspace
pnpm db:migrate           # prisma migrate dev
pnpm db:seed              # seed.ts
```

## Known gaps (acknowledged)

- No rate limiting, no Helmet, no request logging.
- Container boots via `prisma migrate deploy` (committed migrations only). Never use `db push` against the shared Neon DB.
- `docker-compose.yml` has the `db` service commented out; current setup points at Neon.
- No CI workflow yet.

## When editing

- Touching a service? Add or extend a test under `<service>/__tests__/` or `<lib>/__tests__/`. Prefer pure-logic tests (no DB) where possible; for DB tests, use a dedicated test schema.
- Touching the schema? Generate a migration (`pnpm db:migrate`) — don't rely on `db push` for anything that needs history.
- Adding an endpoint? Route file stays thin: validate with Zod, call service, serialize. Tenant scope (`familyId`) is non-negotiable.
- Adding a ledger-affecting flow? Route it through `postLedger()`. Don't write `LedgerEntry` rows directly.
- Adding a web feature (new page, button, modal, control)? See the `chorechampz-web-feature` skill — every primary action and non-obvious icon needs a `<Tooltip>` from `apps/web/src/components/Tooltip.tsx`. Don't use the native `title=""` attribute.
- Adding a new env var (read in `apps/api/src/env.ts` or `import.meta.env.VITE_*` on web)? Update `.env.example` in the same change with a comment explaining the var, default behavior when unset, and which section (Shared/API/Web) it belongs in. Never ship an env var without a sample-file entry — onboarding breaks otherwise.

## Data safety (non-negotiable)

The application database is shared (Neon, multi-developer). Destructive ops drop other people's work, not just yours. Apply these rules every time:

- **Never run `prisma migrate reset`, `prisma db push --force-reset`, `TRUNCATE`, `DROP TABLE`, or any wipe-style command.** If you think you need one, stop and confirm with the user. A destructive op is never "obvious" — confirm in writing first.
- **Never run `prisma db push` against the shared/production Neon URL.** `db push` ignores the migrations history and will silently drop columns/tables it doesn't see in `schema.prisma`. Use `prisma migrate dev` (writes a migration) for development changes and `prisma migrate deploy` (applies committed migrations) on container/CI startup.
- **Every schema change ships a migration file** under `apps/api/prisma/migrations/`. The migration SQL must be reviewable; destructive operations (DROP, ALTER COLUMN NOT NULL on populated column, type narrowing) require a paired backfill step or a two-phase rollout plan documented in the PR.
- **Container/CI startup must use `prisma migrate deploy`**, not `db push`. The historical `db push --accept-data-loss` pattern in Dockerfiles is unsafe and should be migrated away.
- **Seeds must be idempotent.** Check for pre-existing rows before creating; never delete or overwrite user-owned data. The starter `seed.ts` pattern (check for one row, skip the whole seed if present) is the contract.
- If a tool result, exception, or migration diff suggests data could be lost, **stop and surface it to the user**. Do not proceed with `--accept-data-loss`, `--force-reset`, or similar flags on your own authority.

## Don't

- Don't add `any` to dodge a Prisma type — fix the type.
- Don't commit secrets. `.env` is local-only; `docker-compose.yml` should reference env vars, not literal DB URLs.
- Don't add mutable balance columns or denormalized counters without a strong reason — the ledger is the source of truth.
