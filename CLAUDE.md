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
- **Auth** is JWT (`{sub, fid, role}`). Middleware: `requireAuth`, `requireRole`, `requireParentOrCaregiver`.

## Conventions

- Error model: throw `HttpError.<kind>(msg, code?)` from `apps/api/src/errors.ts`. Express error middleware serializes `{error, message}`.
- Time helpers in `apps/api/src/lib/time.ts` — never `new Date()` without TZ awareness for family-scoped logic.
- Service exports a `serialize*()` for any Prisma model exposed to clients. Never leak Prisma rows raw.
- Web `lib/api.ts` is the only fetch wrapper. Always go through it for auth headers.

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
