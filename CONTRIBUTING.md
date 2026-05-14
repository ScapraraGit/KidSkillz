# Contributing to ChoreChamps

This is a working POC + product. The bar for contributions is correctness, clarity, and respect for the conventions already in place. Read this top to bottom before your first PR.

## Quick start

```bash
pnpm install
cp .env.example .env       # set DATABASE_URL etc.
pnpm --filter @chorechamps/api prisma migrate dev
pnpm --filter @chorechamps/api seed
pnpm dev                   # docker compose up (web + api + db)
```

Or, without Docker, run web and API in two terminals:

```bash
pnpm --filter @chorechamps/api dev
pnpm --filter @chorechamps/web dev
```

## Stack overview

See [README.md](./README.md) for the short version. For deeper architectural conventions read [CLAUDE.md](./CLAUDE.md) — it's the source of truth for "how we do things here" and is intentionally kept terse.

## Branching + PRs

- Branch off `main`; one feature/fix per PR.
- PR title in imperative mood: `add team-mode credit split`, not `added/adding`.
- Reference the TODO.md item(s) you're closing.
- Self-review your diff before requesting review. Catch your own commented-out code.

## Required checks

CI runs:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm --filter @chorechamps/api exec prisma validate
```

All must pass before merge.

## Conventions

### Backend

- **Routes are thin.** Logic lives in `apps/api/src/services/*`. Routes validate input with Zod, call the service, serialize the result.
- **Every domain table has `familyId`.** Every service takes `familyId` as the first arg and scopes Prisma queries to it. No cross-family reads.
- **Append-only ledger.** Balance is `SUM("amount")` over `LedgerEntry`. No mutable balance columns. All credit writes go through `postLedger()`.
- **Throw `HttpError.<kind>(msg, code?)`** from `apps/api/src/errors.ts`. The Express error middleware serializes `{error, message}`.
- **Time helpers** in `apps/api/src/lib/time.ts` — never `new Date()` without TZ-awareness for family-scoped logic.
- **Audit-worthy mutations** (member changes, settings, deletions, adjustments) should call `recordAudit()` from `apps/api/src/services/audit.ts` after the operation succeeds.
- **Long-running side effects** (email, push) do NOT belong inside `prisma.$transaction`. See `createNotification` for the fire-and-forget pattern.

### Frontend

- **One fetch wrapper.** Always go through `apps/web/src/lib/api.ts` for the Auth header.
- **Every primary action and non-obvious icon needs a `<Tooltip>`** from `apps/web/src/components/Tooltip.tsx`. Don't use the native `title=""` attribute.
- **Type imports from `@chorechamps/shared`**, not from `@prisma/client`.

### Shared types

- New schema field → mirror in `packages/shared/src/types.ts`.
- New enum value → mirror in `packages/shared/src/enums.ts`.
- DTOs are what the web sees; do not leak raw Prisma rows.

### Code style

- TypeScript strict, ESM, `"type": "module"`.
- Prettier formats; ESLint catches the rest. Run `pnpm format && pnpm lint --fix` before pushing.
- No `any` for dodging a Prisma type — fix the type.
- Default to writing **no** comments. Add one only when the WHY is non-obvious. Don't write JSDoc for self-evident code.

## Schema changes

See [docs/operations/migrations.md](./docs/operations/migrations.md). Short version:

- Generate via `pnpm --filter @chorechamps/api prisma migrate dev --name <snake_case>`.
- Inspect the generated SQL before committing.
- Forward-only. Destructive changes ship in two phases (deploy 1: stop using the column; deploy 2: drop it).
- Mirror the schema field in `packages/shared/src/types.ts`.

## Testing

- Pure logic? Vitest unit test under `apps/api/src/lib/__tests__/` or `apps/api/src/services/__tests__/`. No DB required.
- DB-dependent service test? Use a dedicated test schema; do not point tests at the dev DB.
- Web logic? Vitest under `apps/web/src/lib/__tests__/`. Component tests are welcome but not required.

Reference tests:

- `apps/api/src/lib/__tests__/streak.test.ts` — pure helper extracted from a service for testability.
- `apps/api/src/services/__tests__/teamSplit.test.ts` — same pattern for team credit split.
- `apps/api/src/services/__tests__/awards.test.ts` — pure award math.

## Security expectations

- Never commit `.env` or secrets. `docker-compose.yml` references env vars only.
- New endpoint that writes credits → must go through `postLedger()`.
- New endpoint that touches a tenant resource → must scope by `familyId`.
- New child-facing endpoint that surfaces other kids' data → respect `family.settings.siblingPrivacy`.
- Auth limiter (`authLimiter` in `apps/api/src/index.ts`) applies to `/v1/auth/*`. Don't lean on it for non-auth endpoints; rely on the global ceiling.

## Operations

- Long-running jobs go under `apps/api/prisma/run-*.ts` and ship with a `jobs:<name>` + `jobs:<name>:ci` script. CI invokes `:ci` (no `dotenv-cli`).
- Cron schedules live in `.github/workflows/nightly-jobs.yml`.
- Audit log review for a family: `GET /v1/audit?limit=200` as a parent.

## Common pitfalls

- **Forgetting the migration** — schema edits without `prisma migrate dev` produce drift the next time someone resets their DB.
- **Forgetting to mirror to shared** — TypeScript will yell, but the warning is at the consumer site, not the schema. Easy to miss.
- **Awaiting a network call inside a transaction** — holds the DB connection open. Defer with `setImmediate`.
- **Forgetting tenant scope** — `prisma.thing.findFirst({ where: { id } })` is a tenant-isolation bug waiting to happen. Always include `familyId`.
- **Adding mutable balance columns** — see the ledger rule above. Don't.

## Questions

Open an issue with the `question` label. For security disclosures, do not open an issue — email the maintainer directly.
