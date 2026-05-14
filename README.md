# ChoreChampz

Kids and teens earn credits for chores, tasks, good behavior, planning ahead, and going above and beyond. Parents approve, configure rules, and run a reward catalog. Multi-family by design, even though this POC runs locally on Docker Compose.

## Stack

- **Frontend** — React 18 + Vite + TypeScript + Tailwind + TanStack Query + Zustand
- **API** — Node 20 + Express + Zod + Prisma
- **DB** — PostgreSQL 16
- **Storage** — local Docker volume (abstracted behind a `StorageProvider` interface for swapping in S3 later)
- **Monorepo** — pnpm workspaces; shared package for DTOs/enums consumed by both web and API

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

Then:

- Web: http://localhost:5173
- API: http://localhost:4000 (`GET /health` for an LB-friendly DB-ping probe; everything else under `/v1`)
- Postgres: localhost:5432

The API container applies pending migrations via `prisma migrate deploy` and runs `prisma seed` on first boot.

### Demo logins

| Role        | Email / ID                | Password / PIN |
| ----------- | ------------------------- | -------------- |
| Parent      | `dad@example.com`         | `password123`  |
| Parent      | `mom@example.com`         | `password123`  |
| Child — Ava | (lookup family "Caprara") | PIN `1234`     |
| Child — Leo | (lookup family "Caprara") | PIN `4321`     |

The seed creates an Ava task awaiting approval, a planned-initiative request from Ava, a pending screen-time redemption from Leo, a few approved tasks, and a positive adjustment so balances aren't zero.

## Local non-Docker development

You'll need Node 20 and pnpm, plus a Postgres on `5432`.

```bash
pnpm install
cp .env.example .env  # edit DATABASE_URL if needed
pnpm --filter @chorechampz/api prisma db push
pnpm --filter @chorechampz/api seed
pnpm --filter @chorechampz/api dev   # in one terminal
pnpm --filter @chorechampz/web dev   # in another
```

## Project layout

```
chorechampz/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── index.ts          Express bootstrap
│   │       ├── env.ts
│   │       ├── db.ts             Prisma client
│   │       ├── errors.ts         AppError + HttpError factory
│   │       ├── middleware/       requireAuth, requireRole, errorHandler
│   │       ├── lib/              auth (JWT/bcrypt), storage, time helpers
│   │       ├── services/         business logic (the mobile-app-ready layer)
│   │       └── routes/           Express handlers (thin)
│   └── web/
│       └── src/
│           ├── App.tsx           role-aware routing
│           ├── store/auth.ts     persisted session
│           ├── lib/api.ts        fetch wrapper + upload helpers
│           ├── components/       AppLayout, Modal, ui primitives
│           └── pages/
│               ├── Login.tsx
│               ├── parent/{Dashboard,Approvals,Tasks,Rewards,Children,Ledger,Settings}.tsx
│               └── child/{Dashboard,Rewards,Initiative,Activity}.tsx
├── packages/shared/              cross-cut DTOs + enum constants
├── docker-compose.yml
└── .env.example
```

## How the model works

### Currency: append-only ledger

`LedgerEntry` is the single source of truth. Every approval, redemption, and adjustment posts a row; balance is derived as `SUM(amount)`. No mutable balance column. This is also how we get a complete audit trail "for free" (`/ledger?childId=…`).

Negative balances are blocked by `postLedger()` unless the family setting `allowNegativeBalance` is on. The schema permits negatives so that toggle does not require a migration.

### Recurring tasks

Templates with a `recurrence` JSON: `{ frequency: DAILY|WEEKLY|CUSTOM, daysOfWeek?: number[], expiresAt?: ISO }`. We do **not** materialize occurrences ahead of time. The "today" view (`GET /tasks/today`) walks active templates and computes whether today qualifies, then joins to `TaskCompletion` by `(taskId, childId, occurrenceDate)`. Adding new recurrence rules later is a code change, not a migration.

### Initiative

Two flavors:

- **PLANNED** — child proposes before doing it. On parent approval, an automatic bonus posts as a separate `INITIATIVE_BONUS` ledger entry. The bonus is configured per family (`initiativeBonus.plannedFlatBonus`, `plannedMultiplier`).
- **WRITE_IN** — child reports something already done. No bonus by default; parent can still override the credit value.

The UI visually distinguishes the two and shows planned-initiative as bonus-eligible.

### Proof of completion

Six levels: `NONE`, `NOTES_OPTIONAL`, `NOTES_REQUIRED`, `PHOTO_OPTIONAL`, `PHOTO_REQUIRED`, `PHOTO_AND_NOTES`. Resolved per submission as: **child override → task setting**. The family setting `defaultProofRequirement` is the floor for newly-created tasks (UI default).

Photos are uploaded to `POST /uploads/proof` (multipart, max 5MB, jpg/png), stored in the API container under `/data/uploads` (Docker volume). The `LocalStorage` class implements a `StorageProvider` interface — swap to S3 by writing one new class.

Image viewing in the parent UI uses a `?token=` fallback because plain `<a href>` tags can't send Authorization headers. The middleware accepts the token via query string only on `GET` requests.

### Pause flags

Each `ChildProfile` has `redemptionPaused` and `earningPaused`. UI explains the reason; service layer enforces both at submission time.

### Multi-family / tenant isolation

Every domain table carries `familyId`. Every authenticated request resolves to a `JWTPayload { sub, fid, role }` — services accept `familyId` as their first argument and Prisma queries scope to it. There is no code path that reads across families.

## API surface

All business endpoints are versioned under `/v1`. `/health` is the only unversioned route (used by load-balancer probes; pings the DB).

| Method         | Path (under `/v1`)                                  | Notes                                                                          |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| POST           | `/auth/parent/login`                                | email + password                                                               |
| POST           | `/auth/child/login`                                 | `{childId, pin}` (individual) or `{childId, familyPassword}` (shared device)   |
| GET            | `/auth/families/lookup?name=`                       | lightweight family lookup for shared-device profile picker                     |
| GET            | `/auth/me`                                          | session check                                                                  |
| GET/PATCH      | `/family`, `/family/settings`                       | parent settings                                                                |
| GET/POST/PATCH | `/children`, `/children/:id`                        | parents create/edit; pause flags + streak grace + savings goals here           |
| GET            | `/children/:id/balance`, `/children/:id/stats`      | derived from ledger                                                            |
| CRUD           | `/tasks` · GET `/tasks/today`                       | today resolves recurring + pool + team on the fly                              |
| POST           | `/tasks/:id/{join,leave,parent-claim}`              | team-mode + parent Missed Opportunity                                          |
| CRUD           | `/task-categories`                                  | parent-managed icons + names                                                   |
| GET/POST       | `/completions`, `/completions/:id/{approve,reject}` | child submits, parent reviews                                                  |
| GET/POST       | `/initiative`, `/initiative/:id/{approve,reject}`   | bonus on PLANNED                                                               |
| CRUD           | `/rewards`                                          |                                                                                |
| GET/POST       | `/redemptions`, `/redemptions/:id/{approve,reject}` |                                                                                |
| POST           | `/adjustments`                                      | parent-only, signed amount                                                     |
| GET            | `/ledger?childId=&limit=`                           | ledger view                                                                    |
| GET            | `/audit?limit=&kind=&before=`                       | parent-only audit trail (settings changes, member edits, adjustments, deletes) |
| GET            | `/dashboard/parent` · `/dashboard/child`            | aggregates everything for landing pages                                        |
| GET            | `/missed-opportunities/recent?days=`                | kid dashboard FOMO overlay feed                                                |
| POST/GET       | `/uploads/proof` (multipart) · `/uploads/:key`      | proof storage                                                                  |

All endpoints return `{ error, message }` on failure and 401 on missing/expired tokens. Request logs are emitted as line-delimited JSON via `pino-http` (pretty-printed in dev). Auth surface is rate-limited at 30 req / 15 min per IP; everything else at 300 req / min.

## Notes for future mobile-app readiness

- The API is JSON-only and stateless apart from JWTs. The same endpoints work for a React Native client.
- All business rules live in `apps/api/src/services/*` — routes are thin. A second client cannot bypass earning/redemption pauses, proof requirements, or balance guards.
- Shared DTOs and enums live in `packages/shared` so a future RN app can depend on the same types.
- Photo upload uses standard multipart; on mobile, just `FormData` it.
- For mobile push notifications, the natural extensions are: a `Device` table (userId, platform, pushToken) and a notifier hook fired from `approveCompletion`, `submitCompletion`, etc.

## Notes for future SaaS hosting

- Tenant scope is enforced in services; nothing assumes a single family.
- Every config knob is environment-driven (`DATABASE_URL`, `JWT_SECRET`, `UPLOAD_DIR`, `CORS_ORIGIN`, …). No `localhost` is hardcoded — `VITE_API_URL` is build-time configurable.
- Storage abstraction (`StorageProvider`) means moving to S3/R2 is a one-class swap and an env wiring.
- For Fly.io / Render: deploy `apps/api` as a single Node process, swap `pnpm dev` for `pnpm build && pnpm start` in production. The Postgres is managed (Fly Postgres / Supabase). Replace `prisma db push` with proper `prisma migrate deploy` once you want migration history (POC uses `db push` for simplicity).
- For real auth: replace local `bcrypt + JWT` with a hosted IdP (Clerk, Auth0, Supabase Auth) — the role/family claims map directly into the existing `JWTPayload` shape so middleware would barely change.
- Rate limiting and request logging are intentionally not in the POC.

## Things deliberately left out

- Hardened image processing (no virus scan, no resize/strip-EXIF)
- Auto-approval branch when `reward.requiresApproval = false` (today all redemptions go through the approval queue, even auto-eligible ones)
- ISO-week-aligned weekly resets (the week stat uses a rolling 7-day window — simpler and arguably more correct)
- Push notifications (in-app + email mirror are wired; APNs/FCM are not)

## Operations

- **Backup + restore drills**: see [docs/operations/backup.md](./docs/operations/backup.md). Quarterly drill recommended.
- **Migrations**: forward-only, two-phase for destructive changes. See [docs/operations/migrations.md](./docs/operations/migrations.md).
- **Nightly jobs**: [.github/workflows/nightly-jobs.yml](./.github/workflows/nightly-jobs.yml) runs `penalty-sweep` + `photo-purge` at 09:10 UTC daily. Manual trigger via Actions tab.
- **Health probe**: `GET /health` pings the DB with a 1.5s timeout; returns 503 on failure for the load balancer to drain traffic.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Architectural conventions in [CLAUDE.md](./CLAUDE.md) are authoritative.

## Tearing it down

```bash
docker compose down -v   # also wipes the volume + Postgres data + uploads
```
