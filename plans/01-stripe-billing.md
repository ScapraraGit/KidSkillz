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
```

New enums:

- `SubscriptionStatus` — TRIALING, ACTIVE, PAST_DUE, CANCELED, INCOMPLETE, UNPAID
- `PlanTier` — BASIC, PREMIUM

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
- `getEntitlement(familyId): { status, plan, trialEndsAt, isPaid, isPremium }`.

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

Premium gate: `requirePremium` for premium-only endpoints.

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

## Webhook security

- Raw body via `express.raw({type: 'application/json'})` on that single route.
- Verify signature with `STRIPE_WEBHOOK_SECRET`.
- Insert `StripeEvent` row first; if dup, skip.

## Tests

- `services/__tests__/billing.test.ts` — entitlement matrix (trialing-active, trialing-expired, active, past_due, canceled), idempotency on duplicate webhook event id.
- Middleware test — bypass list, flag-off short-circuit.
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
