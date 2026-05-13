# ChoreChamps — Post-MVP TODO

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

- [ ] **Per-task multi-assign** — promote `Task.assignedToId` → `assignedToIds[]` OR new `TaskAssignment` join. Migration risk; soft path: keep current model, add UI shortcut "create-for-all" that already exists. **L**
- [ ] **Recurring redemptions / standing orders** — `Reward.autoRedeemSchedule` JSON. Cron posts. **M**
- [ ] **Streak grace days** — `ChildProfile.streakGraceCount` int (default 0). Parent grants from Kids page. Streak calc skips one missed day per grace. **S**
- [ ] **Negative-credit task / debt mechanic** — `Task.missedPenalty` int? Posted by NO_MISSES-like nightly job when task unfinished. Off by default. Family setting opt-in. **M**
- [ ] **Task categories with icons** — `Category` table or seeded enum; UI groups today's tasks by category. **S**
- [ ] **Multi-pin savings goals** — change `ChildProfile.savingsGoalRewardId` → join table top-3. Dashboard shows mini-grid. **S**
- [ ] **Sibling-private mode** — `Family.siblingPrivacy` boolean; when on, kid pages never see other kids' balances/levels. **S**
- [ ] **Adult self-assign tasks** — allow `Task.assignedToId` = PARENT user. Affects `listTodayForChild` only if signed in as that parent. **M**

## Tier 4 — Operational / quality

- [ ] **Backup + restore docs** — `/docs/operations/backup.md`; document Neon PITR, restore drill steps. **S**
- [ ] **Audit log table** — `AuditEvent { familyId, actorId, kind, targetType, targetId, payload, createdAt }`. Fire on member changes, settings, deletions. Parent UI to view. **M**
- [ ] **API versioning** — prefix all routes under `/v1/`. Update web `API_URL` join. Keep `/health` unversioned. **S**
- [ ] **Structured request logs** — replace morgan with pino or pino-http; include request-id, userId, familyId. **S**
- [ ] **Healthcheck DB ping** — `/health` runs `prisma.$queryRaw\`SELECT 1\``; degrade to 503 on fail. **S**
- [ ] **Migration rollback docs** — add `/docs/operations/migrations.md`; document Prisma no-down-script reality + revert pattern (new forward migration). **S**
- [ ] **README + CONTRIBUTING** — human-facing setup, run, deploy. Link to `CLAUDE.md` for AI context. **S**

## Tier 5 — Accessibility + polish

- [ ] **Keyboard nav audit** — tab order through Modal, Dropdown (NotificationBell, StartTimerButton). Esc to close. **S**
- [ ] **Color contrast pass** — run axe DevTools on every page; fix WCAG AA failures (amber-50 on white likely culprit). **S**
- [ ] **Screen reader sweep** — NVDA + VoiceOver test of key kid flows: submit task, redeem reward, view notification. **S**
- [ ] **`prefers-reduced-motion` respect** — gate confetti, `animate-pop`, pet bounce behind media query. **S**

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
