# Plan 1 — Stripe Billing (beta-hidden)

## Goal

Charge for family access. 10-day free trial → paid. Hide UI behind flag during beta. Allow premium tier upcharge.

## Schema (apps/api/prisma/schema.prisma)

Add to `Family`:

```prisma
subscriptionStatus    SubscriptionStatus @default(TRIALING)
trialEndsAt           DateTime?
stripeCustomerId      String?  @unique
stripeSubscriptionId  String?  @unique
currentPlan           PlanTier @default(BASIC)
currentPeriodEnd      DateTime?
cancelAtPeriodEnd     Boolean  @default(false)

billingOverride       BillingOverride @default(NONE)
billingOverrideReason String?
billingOverrideBy     String?     // PlatformAdmin.id
billingOverrideAt     DateTime?
billingOverrideUntil  DateTime?   // null = no expiry (used with FREE_UNTIL)
```

New enums:

- `SubscriptionStatus` — TRIALING, ACTIVE, PAST_DUE, CANCELED, INCOMPLETE, UNPAID
- `PlanTier` — BASIC, PREMIUM
- `BillingOverride` — NONE, FREE_FOREVER, FREE_UNTIL, COMPED_PREMIUM

New model `PlatformAdmin` (platform-scoped, not family-scoped):

- `id`, `email @unique`, `passwordHash`, `name`, `createdAt`, `lastLoginAt?`
- Separate from `User` so family `Role` enum stays unchanged and JWT `fid` assumption holds.
- Seeded via env-driven bootstrap script, not self-registration.

New model `BillingOverrideLog`:

- `id`, `familyId`, `adminId`, `action` (SET/CLEAR), `prevType`, `newType`, `reason`, `until?`, `createdAt`.
- Append-only audit trail for comped accounts.

New model `StripeEvent`:

- `id` (Stripe event id, unique), `type`, `payload Json`, `processedAt`, `familyId?`
- Idempotency for webhook replay.

Migration: `20260514_billing/`.

## Env (apps/api/src/env.ts)

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_BASIC_MONTHLY
STRIPE_PRICE_PREMIUM_MONTHLY
BILLING_ENABLED=false        # master kill-switch (server)
BILLING_TRIAL_DAYS=10
PLATFORM_ADMIN_JWT_SECRET    # separate from family JWT secret
PLATFORM_ADMIN_BOOTSTRAP_EMAIL    # initial super-admin seeded on first boot
PLATFORM_ADMIN_BOOTSTRAP_PASSWORD
```

Web (apps/web):

```
VITE_BILLING_ENABLED=false   # UI kill-switch (separate from server)
```

Both default `false` for beta. Flip later. Hide every billing UI surface behind `import.meta.env.VITE_BILLING_ENABLED === "true"`.

## Service layer (apps/api/src/services/billing.ts — new)

Functions, all `familyId`-scoped:

- `ensureStripeCustomer(familyId)` — lazy-create on first need.
- `startTrial(familyId)` — set TRIALING + `trialEndsAt = now+10d` on family creation. No Stripe call yet.
- `createCheckoutSession(familyId, plan: PlanTier)` — Stripe Checkout, success/cancel URLs back to web.
- `createPortalSession(familyId)` — Stripe customer portal for self-service.
- `cancelSubscription(familyId, atPeriodEnd: boolean)`.
- `handleWebhook(event)` — switch on `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_failed`. Idempotent via `StripeEvent`.
- `getEntitlement(familyId): { status, plan, trialEndsAt, isPaid, isPremium, source }` — `source` ∈ `STRIPE | TRIAL | OVERRIDE`. **Override check runs first.**
  - `FREE_FOREVER` → `{status: ACTIVE, plan: BASIC, isPaid: true, source: OVERRIDE}`.
  - `COMPED_PREMIUM` → `{status: ACTIVE, plan: PREMIUM, isPaid: true, isPremium: true, source: OVERRIDE}`.
  - `FREE_UNTIL` + `billingOverrideUntil > now` → ACTIVE/OVERRIDE; expired falls through to Stripe state.
  - `NONE` → existing Stripe/trial logic.
- `setBillingOverride(familyId, adminId, {type, reason, until?})` — writes Family fields + `BillingOverrideLog` row.
- `clearBillingOverride(familyId, adminId, reason)` — resets to NONE, logs.

## Routes (apps/api/src/routes/billing.ts — new)

Thin per CLAUDE.md:

- `POST /billing/checkout` — body `{plan}`, parent-only, returns Checkout URL.
- `POST /billing/portal` — parent-only, returns portal URL.
- `GET /billing/status` — entitlement payload for current family.
- `POST /billing/webhook` — **before** JSON body parser (raw body for signature verify). Wire in `apps/api/src/index.ts` before `express.json()`.
- All gated by `BILLING_ENABLED`. When off, return 404.

## Middleware

New `requirePaidEntitlement` in `apps/api/src/middleware/billing.ts`:

- Reads `getEntitlement(familyId)`.
- TRIALING + `trialEndsAt > now` → allow.
- ACTIVE → allow.
- Else → 402 Payment Required `{error: "BILLING_REQUIRED"}`.
- Bypass when `BILLING_ENABLED=false`.
- Bypass for `/auth/*`, `/billing/*`, `/legal/*`, `/health`.

Mount globally in `index.ts` after `requireAuth`. Whitelist exceptions explicit.

Premium gate: `requirePremium` for premium-only endpoints. `COMPED_PREMIUM` override satisfies this.

Webhook keeps updating Stripe fields on the Family even while override active — so removing override later restores correct Stripe state without manual reconciliation. Middleware ignores Stripe state while override active.

## Admin override surface

New middleware `requireSuperAdmin` in `apps/api/src/middleware/platform-admin.ts`:

- Separate JWT shape `{sub: adminId, kind: "platform"}`. Different signing key (`PLATFORM_ADMIN_JWT_SECRET`) so family tokens can never escalate.
- Reject if `kind !== "platform"` or admin row missing.

New routes under `apps/api/src/routes/admin/billing.ts` (mounted at `/admin`):

- `POST /admin/auth/login` — email + password, returns platform JWT.
- `GET /admin/families?override=<type>&q=<search>` — list families, filterable by override type.
- `GET /admin/families/:id` — family detail incl. current entitlement + Stripe state + override.
- `POST /admin/families/:id/billing-override` — body `{type: BillingOverride, reason: string, until?: ISO}`. Writes Family fields, appends `BillingOverrideLog`.
- `DELETE /admin/families/:id/billing-override` — body `{reason}`. Resets to NONE, logs.
- `GET /admin/families/:id/billing-override/log` — audit trail.

All `requireSuperAdmin`. Not gated by `BILLING_ENABLED` — admins need access even before billing flips on (to pre-comp beta loyalists).

## Premium-tier candidate features (upcharge)

Pick from existing surface:

- Unlimited children (BASIC = 3).
- Custom reward catalog beyond N entries.
- Photo proof storage retention >30 days.
- Multi-caregiver invites.
- Advanced analytics / missed-opportunity reports.
- Custom task categories beyond default set.
- Export-to-CSV (audit, ledger).

Enforce in services that already take `familyId`: read `getEntitlement(familyId).isPremium` at service entry, throw `HttpError.forbidden("PREMIUM_REQUIRED")` when over limit.

## Trial bootstrap

In `POST /auth/parent/register` (auth.ts:40): after Family create, call `startTrial(family.id)`. No Stripe call. UI shows trial banner only when `VITE_BILLING_ENABLED=true`.

## Web (all behind `VITE_BILLING_ENABLED`)

New files:

- `apps/web/src/pages/parent/Billing.tsx` — plan picker, current status, "Manage" button → portal.
- `apps/web/src/components/TrialBanner.tsx` — countdown banner in AppLayout when trialing.
- `apps/web/src/components/UpgradePrompt.tsx` — modal when 402/PREMIUM_REQUIRED returned.

Wire in `App.tsx`: conditional `<Route path="/parent/billing">`. Hide from nav (`AppLayout.tsx`) when flag off.
`lib/api.ts`: intercept 402 → dispatch `UpgradePrompt`.

When `getEntitlement().source === "OVERRIDE"`, `Billing.tsx` replaces plan picker with comped notice:

- "Account comped by ChoreChampz" + reason + expiry (if FREE_UNTIL).
- Hide Checkout / Manage buttons.
- `TrialBanner` suppressed.

New admin web app surface (separate route tree `/admin/*`, separate auth store):

- `apps/web/src/pages/admin/Login.tsx`
- `apps/web/src/pages/admin/Families.tsx` — search + filter by override.
- `apps/web/src/pages/admin/FamilyDetail.tsx` — entitlement, Stripe state, set/clear override modal, audit log.

Admin pages gated by platform JWT in localStorage under separate key (`platformAdminToken`). Never share with family token.

## Webhook security

- Raw body via `express.raw({type: 'application/json'})` on that single route.
- Verify signature with `STRIPE_WEBHOOK_SECRET`.
- Insert `StripeEvent` row first; if dup, skip.

## Tests

- `services/__tests__/billing.test.ts` — entitlement matrix (trialing-active, trialing-expired, active, past_due, canceled), idempotency on duplicate webhook event id.
- Override matrix — FREE_FOREVER beats CANCELED Stripe, COMPED_PREMIUM passes `requirePremium`, expired FREE_UNTIL falls through to Stripe state, clearing override restores Stripe-derived entitlement.
- `BillingOverrideLog` append-only — each set/clear appends row, never mutates prior.
- Middleware test — bypass list, flag-off short-circuit, override bypasses 402.
- Platform-admin auth — family JWT rejected by `requireSuperAdmin`, platform JWT rejected by `requireAuth`.
- No real Stripe in tests — mock SDK.

## Rollout

1. Schema + migration + entitlement service (BILLING_ENABLED=false). Ship dark.
2. Webhook + checkout/portal routes. Internal-only test with Stripe test keys.
3. Beta: flag stays off, no UI visible.
4. Flip `BILLING_ENABLED=true` + `VITE_BILLING_ENABLED=true` post-beta. Backfill existing families: `trialEndsAt=now+30d` grace.

## Risks

- Webhook ordering — always trust DB row state, not local timestamps.
- Trial-end race — recheck entitlement on each gated request, don't cache.
- Currency/tax — start US-only, Stripe Tax later.
- Override abuse — only super-admin role can set. Every change audited in `BillingOverrideLog`. No self-comp possible (admin acts on `:familyId`, not own).
- Token confusion — platform JWT and family JWT use distinct secrets + `kind` claim. Cross-acceptance impossible.
- Bootstrap admin — `PLATFORM_ADMIN_BOOTSTRAP_*` envs create initial admin only if zero admins exist. Idempotent; safe to leave set.
