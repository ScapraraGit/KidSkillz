# ChoreChampz — Post-MVP TODO

Working plan for everything beyond the gamification suite already shipped (levels, pets, challenges, kudos, savings goal, notifications, focus timer, security middleware).

Status legend:

- [ ] open
- [~] in progress
- [x] done

Effort: **S** = under 1d · **M** = 1–3d · **L** = >3d. Effort is rough.

---

## Tier 1 — Hard blockers for public launch

- [x] **Email verification on parent register** — gate critical ops until verified. Reuse Resend, new `EmailVerification` table or token in `User`. **M**
- [x] **Password reset flow** — `POST /auth/forgot-password` → email link → `POST /auth/reset-password` with hashed token + TTL. **M**
- [x] **Terms of Service + Privacy Policy pages** — static routes + acceptance checkbox on register + version pin on `User.acceptedTermsVersion`. **S**
- [x] **Account deletion / data export** — kid + parent: download JSON of own data; hard-delete family with cascade confirmation. **M**
- [x] **CI workflow** — GitHub Actions: install, lint, typecheck, test, prisma validate. Block merges on red. **S**
- [x] **Photo proof retention policy** — auto-purge proof photos older than N days; per-family setting (default 90). Cron-driven. **M**
- [x] **Mobile responsive audit** — every page on 375px width. Kid Dashboard, Approvals table, Tasks table. Fix worst offenders. **S**

## Tier 2 — Should-have before broader rollout

- [ ] **Allowance / weekly auto-credit** — `Family.allowanceConfig` JSON (amount, dayOfWeek, enabled per kid), cron posts `LedgerKind.ALLOWANCE`. New enum value. **M** _(deferred per user)_
- [x] **Vacation mode** — `Family.vacationMode { active, endsAt }`. Pauses earning, freezes streaks, hides streak-saver. Parent toggle. **S**
- [x] **Bulk approve in parent Approvals** — multi-select checkbox + "Approve selected" button. Reuse approve endpoint in loop or new `POST /completions/bulk-approve`. **S**
- [x] **Photo lightbox / proof viewer** — click thumbnail → modal with full image. Replace current `target="_blank"` link in `Approvals.tsx`. **S**
- [x] **Ledger search/filter** — date range, kind multi-select, kid filter on `/parent/ledger`. **S**
- [x] **Error tracking (Sentry)** — wire `@sentry/node` in `apps/api/src/index.ts` after errorHandler, `@sentry/react` in `apps/web/src/main.tsx`. DSN via env. **S**
- [x] **Email notifications mirror** — when `createNotification()` fires for kid with email OR for parent of kid, also send via Resend. Batched daily digest preferred. **M**
- [x] **Onboarding wizard hardening** — extend `OnboardingTour` to gate first-run: must create 1 kid + 1 task + 1 reward before reaching full dashboard. **S**

## Tier 3 — Feature gaps users will ask for fast

- [x] **Per-task multi-assign → Team mode** — `AssignmentMode.TEAM` + new `TaskJoin` table + `Task.teamSplit` (EVEN | FULL). Kids "Join team" on dashboard; approval splits credit across joiners (EVEN ceiling-divides, FULL pays each joiner full amount). Late-joiner race closed by snapshotting `createdAt <= submittedAt`. Partial unique indexes on TaskJoin close the NULL-occurrence-date duplicate-row gap. **L**
- [ ] **Recurring redemptions / standing orders** — `Reward.autoRedeemSchedule` JSON. Cron posts. **M** _(deferred per user)_
- [x] **Streak grace days** — `ChildProfile.streakGraceCount` int. Parent grants from Edit Child modal. Pure-function `computeStreakWithGrace` ([lib/streak.ts](apps/api/src/lib/streak.ts)) consumes one token per missed non-vacation day. 7 unit tests. **S**
- [x] **Negative-credit task / debt mechanic** — `Task.missedPenalty` int + `ChildProfile.penaltiesExempt` + `family.penaltiesEnabled` master switch. New `LedgerKind.PENALTY`. Nightly job [run-penalty-sweep.ts](apps/api/prisma/run-penalty-sweep.ts) sweeps yesterday's missed RECURRING ASSIGNED tasks; idempotent via `sourceId=${taskId}:${yesterday}` inside a per-child transaction. ASSIGNED-only — pool/team modes intentionally skipped (ambiguous attribution). **M**
- [x] **Task categories with icons** — new `TaskCategory` table, `Task.categoryId` FK, 7 default categories seeded on family creation, parent CRUD UI in Settings → Categories. **S**
- [x] **Multi-pin savings goals** — `ChildSavingsGoal` join table (1..3 positions, unique per kid). Legacy `ChildProfile.savingsGoalRewardId` kept for back-compat, mirrors position-1. Migration backfills from legacy column. Edit Child modal shows 3 slot dropdowns. **S**
- [x] **Sibling-private mode** — `FamilySettings.siblingPrivacy` flag exposed in parent Settings. Existing kid-facing endpoints already scope by `userId`/`childId`; flag wired for any future cross-kid UI to honor. **S**
- [x] **Adult self-assign → Missed Opportunity** — reframed from "parent earns" to FOMO mechanic. New `MissedOpportunity` table + `POST /tasks/:id/parent-claim`. Blocks subsequent kid submission. Kid dashboard shows GENTLE/SAVAGE/OFF overlay per `FamilySettings.missedOpportunityMode`. Parent triggers via "I did it" row action on Tasks page. **M**

## Tier 4 — Operational / quality

- [x] **Backup + restore docs** — [docs/operations/backup.md](docs/operations/backup.md): Neon PITR walkthrough, restore drill checklist, photo backup notes, ledger-integrity sanity SQL. **S**
- [x] **Audit log table** — `AuditEvent` model + [services/audit.ts](apps/api/src/services/audit.ts) + parent-only `GET /v1/audit`. Fires on family settings update, child create/update, task delete, adjustments. **M**
- [x] **API versioning** — All business endpoints mounted under `/v1` (including `/uploads`); `/health` stays unversioned for LB probes. Web `api()` + `uploadUrl()` updated. Future `/v2` ships alongside `/v1` without retiring it. **S**
- [x] **Structured request logs** — `pino-http` replaces morgan. JSON in prod, pretty in dev. Request-id from `X-Request-ID` or generated UUID. Custom props inject `userId` + `familyId` from `req.auth`. **S**
- [x] **Healthcheck DB ping** — `/health` runs `prisma.$queryRaw\`SELECT 1\`` with a 1.5s timeout; returns 503 on failure. **S**
- [x] **Migration rollback docs** — [docs/operations/migrations.md](docs/operations/migrations.md): forward-only model, two-phase pattern for destructive changes, recovery via PITR. **S**
- [x] **README + CONTRIBUTING** — README refreshed with `/v1`, audit, pino, ops links. [CONTRIBUTING.md](CONTRIBUTING.md) covers workflow, conventions, schema discipline, security expectations. **S**

## Tier 5 — Accessibility + polish

- [x] **Keyboard nav audit** — [Modal.tsx](apps/web/src/components/Modal.tsx) gained focus trap (Tab/Shift+Tab cycle), Esc-to-close, focus-return-on-close, `role="dialog"` + `aria-modal`. [NotificationBell.tsx](apps/web/src/components/NotificationBell.tsx) + StartTimerButton in [Dashboard.tsx](apps/web/src/pages/child/Dashboard.tsx) now Esc-close, expose `aria-haspopup` + `aria-expanded`, and unread notification rows became real `<button>` elements (Enter/Space activate). **S**
- [x] **Color contrast pass** — Bumped sub-text from `text-slate-400` → `text-slate-500/600` and 10px → 11px in NotificationBell timestamp + Modal close button. Amber surfaces audited: `text-amber-900` on `bg-amber-50` passes AA. Full axe sweep deferred to staging pre-beta. **S**
- [x] **Screen reader sweep** — Icon-only buttons now carry descriptive `aria-label`s ([PhotoLightbox.tsx](apps/web/src/components/PhotoLightbox.tsx) thumb, NotificationBell items, Modal close). Decorative imgs inside button-with-label use `alt=""` to avoid double-announce. Live NVDA/VoiceOver pass still pending pre-beta. **S**
- [x] **`prefers-reduced-motion` respect** — Global CSS gate in [index.css](apps/web/src/index.css) zeroes out `.animate-pop` + all keyframe/transition durations under the media query. [lib/motion.ts](apps/web/src/lib/motion.ts) exposes `prefersReducedMotion()`; [lib/celebrate.ts](apps/web/src/lib/celebrate.ts) suppresses confetti when set. Sound is independent — not gated. Pet bounce is pure CSS, covered by the global rule. **S**

---

## Suggested execution order

If executing in order: 4 → 6 → 5 → 1 → 2 → 3 → 8 → 9 → 7. Reasoning:

- Land **CI** first (#4) so all subsequent PRs gain coverage.
- **Retention policy** (#6) and **mobile audit** (#7) need design decisions; raise early.
- Auth blockers (#1, #2) before legal (#3) before deletion (#4-tier1).
- Allowance + vacation (Tier 2 leaders) unlock real-family usage.

## Cross-cutting reminders

- New ledger writes via `postLedger()`.
- New API queries scope by `familyId`.
- New web feature: tooltip on every primary action (`apps/web/src/components/Tooltip.tsx`), no `title=""`.
- New schema field: mirror to `packages/shared/src/types.ts` + `enums.ts`.
- New endpoint: thin route, zod validate, service holds logic, serializer for response.

## Out-of-scope for this list (already shipped or different track)

- Gamification (levels, pets, challenges, kudos, savings goal, notifications, focus timer) — done.
- Tenant-isolation audit — done.
- Helmet / rate-limit / morgan — done.
- Web test infra — done; add tests as features land.
- Subscription / billing — defer until product-market fit signal.
- Native mobile app — defer; PWA install (`manifest.json` + service worker) is a Tier 3 candidate if needed.
