# ChoreChampz — Claude Context

Monorepo. Kids/teens earn credit for chores, parents approve, reward catalog. Multi-family from day one.

## Stack

- pnpm workspaces, Node 20, TypeScript 5.6, ESM (`"type": "module"`).
- `apps/api` — Express 4 + Prisma 5 (Postgres) + Zod + JWT.
- `apps/web` — React 18 + Vite + Tailwind + TanStack Query + Zustand. Doubles as the Capacitor 8 native shell (`apps/web/android` committed; iOS pending a Mac).
- `apps/demo` — internal GIF recorder (not shipped).
- `packages/shared` — DTOs + enums consumed by web and api.

## Architecture rules

- **Routes are thin.** All business logic lives in `apps/api/src/services/*`. A second client (mobile) must not be able to bypass earning/redemption pauses, proof requirements, or balance guards.
- **Tenant isolation.** Every domain table has `familyId`. Every service takes `familyId` as its first arg. Prisma queries always scope by `familyId`. There is no read across families.
- **Append-only ledger.** Balance is `SUM(amount)` over `LedgerEntry`. No mutable balance column. Negative posts blocked by `postLedger()` unless `family.allowNegativeBalance` is on.
- **Recurring tasks** are not materialized — `GET /tasks/today` walks active templates and joins `TaskCompletion` by `(taskId, childId, occurrenceDate)`.
- **Proof requirement resolves child override > task setting.** Six levels in `ProofRequirement` enum.
- **Storage** behind `StorageProvider` interface — swap LocalStorage → S3 by writing one class.
- **Push** behind `PushProvider` interface in [apps/api/src/lib/push-provider.ts](apps/api/src/lib/push-provider.ts) — mirrors `EmailProvider`. `PUSH_ENABLED=false` (default) → `ConsolePushProvider` (no-op log) so dev/CI never need FCM. When `true`: `FcmProvider` via `firebase-admin`. Prefers `FCM_SERVICE_ACCOUNT_JSON` (a single-line JSON of the service-account key, the prod path); falls back to `FCM_PROJECT_ID` + Application Default Credentials (`gcloud auth application-default login`) for local dev when org policy blocks key creation. Delivery enters via `deliverPushMirror` next to `deliverEmailMirror` in [services/notifications.ts](apps/api/src/services/notifications.ts) — fire-and-forget via `setImmediate`, swallows errors, prunes tokens FCM reports invalid. Gated per family by the `pushNotifications` setting.
- **Web-side persistence** is wrapped by [lib/secureStore.ts](apps/web/src/lib/secureStore.ts) — `AsyncKV` adapter that returns `localStorage` on web and Keychain/Keystore (via `@aparajita/capacitor-secure-storage`) on native. JWTs (Zustand `persist`) and device tokens both route through it. On native the auth-store hydrates asynchronously, so [main.tsx](apps/web/src/main.tsx) gates initial render on `awaitBoot()` from [lib/boot.ts](apps/web/src/lib/boot.ts). Never persist auth credentials in WebView `localStorage` on native — always go through this adapter.
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
- Modals do NOT dismiss on backdrop click. [Modal.tsx](apps/web/src/components/Modal.tsx) closes only via the header ✕, an explicit Cancel/footer button, or Esc (Esc kept for WAI-ARIA dialog accessibility). Form-blocking modals (`UpgradePrompt`, `TermsGate`, `HouseholdAckModal`) follow the same rule. The exception is `PhotoLightbox` (image viewer, tap-to-close is intended UX).
- Native shell skips the marketing landing — root `/` redirects to `/login` when `Capacitor.isNativePlatform()` is true. Web behavior unchanged. See [App.tsx](apps/web/src/App.tsx).
- Push lifecycle is wired to the auth-store's token-presence transitions in [App.tsx](apps/web/src/App.tsx) via `useAuth.subscribe` — register on login, teardown on logout. One chokepoint covers parent/child/OAuth login paths without per-page code. Push handlers (deep-link mapping, FCM token POST/DELETE) live in [lib/push.ts](apps/web/src/lib/push.ts), native-only.
- Capacitor build modes: prod default uses `androidScheme=https` and root `.env` (VITE_API_URL=prod). Local Android dev uses `CAP_ENV=dev` (gated in [capacitor.config.ts](apps/web/capacitor.config.ts) → `androidScheme=http`, origin `http://localhost` to avoid mixed-content) + `vite build --mode mobile` loading root [.env.mobile](.env.mobile) (VITE_API_URL=http://10.0.2.2:4000 = emulator's host-loopback). Cleartext to 10.0.2.2 is permitted only by [android/app/src/debug](apps/web/android/app/src/debug) overlay (debug builds only). Use `pnpm --filter @chorechampz/web cap:dev:android` for the dev loop; plain `cap:android` for prod-flavored builds. Native WebView origin `http://localhost` must be in `CORS_ORIGIN` for the API to accept its requests.

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

- No rate limiting, no request logging. (Helmet IS configured in [app.ts](apps/api/src/app.ts) with a custom CSP — the old "no Helmet" note is stale.)
- Container boots via `prisma migrate deploy` (committed migrations only). Never use `db push` against the shared Neon DB.
- `docker-compose.yml` has the `db` service commented out; current setup points at Neon.
- No CI workflow yet.
- iOS mobile shell not scaffolded yet (`cap add ios` requires macOS/Xcode). Android works.
- Push notifications: code path is complete but runtime delivery requires per-developer Firebase provisioning — drop `google-services.json` into [apps/web/android/app/](apps/web/android/app/) (gitignored) and either set `FCM_SERVICE_ACCOUNT_JSON` (prod) or `FCM_PROJECT_ID` + run `gcloud auth application-default login` (dev ADC). Without those, `registerPushForSession()` errors harmlessly on the device and `pushProvider` falls back to `ConsolePushProvider`.

## When editing

- Touching a service? Add or extend a test under `<service>/__tests__/` or `<lib>/__tests__/`. Prefer pure-logic tests (no DB) where possible; for DB tests, use a dedicated test schema.
- Touching the schema? Generate a migration (`pnpm db:migrate`) — don't rely on `db push` for anything that needs history.
- Adding an endpoint? Route file stays thin: validate with Zod, call service, serialize. Tenant scope (`familyId`) is non-negotiable.
- Adding a ledger-affecting flow? Route it through `postLedger()`. Don't write `LedgerEntry` rows directly.
- Adding a web feature (new page, button, modal, control)? See the `chorechampz-web-feature` skill — every primary action and non-obvious icon needs a `<Tooltip>` from `apps/web/src/components/Tooltip.tsx`. Don't use the native `title=""` attribute.
- Adding a new env var (read in `apps/api/src/env.ts` or `import.meta.env.VITE_*` on web)? Update `.env.example` in the same change with a comment explaining the var, default behavior when unset, and which section (Shared/API/Web) it belongs in. Never ship an env var without a sample-file entry — onboarding breaks otherwise.
- Touching native (`apps/web/android/**`, `capacitor.config.ts`)? Re-run `cap sync` (`pnpm --filter @chorechampz/web cap:sync` for prod-flavor, `cap:dev:android` for emulator dev). Web changes only land on the device after a sync — emulator restart doesn't rebuild the APK. Never commit `apps/web/android/app/google-services.json`, `local.properties`, `*.keystore`, or `apps/web/android/app/src/main/assets/public/` (synced web bundle) — all already gitignored.

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
