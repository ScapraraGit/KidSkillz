-- Billing: subscription state on Family, admin override, Stripe event idempotency, override audit log.

CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'UNPAID');
CREATE TYPE "PlanTier" AS ENUM ('BASIC', 'PREMIUM');
CREATE TYPE "BillingOverride" AS ENUM ('NONE', 'FREE_FOREVER', 'FREE_UNTIL', 'COMPED_PREMIUM');

ALTER TABLE "Family"
  ADD COLUMN "subscriptionStatus"    "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  ADD COLUMN "trialEndsAt"           TIMESTAMP(3),
  ADD COLUMN "stripeCustomerId"      TEXT,
  ADD COLUMN "stripeSubscriptionId"  TEXT,
  ADD COLUMN "currentPlan"           "PlanTier" NOT NULL DEFAULT 'BASIC',
  ADD COLUMN "currentPeriodEnd"      TIMESTAMP(3),
  ADD COLUMN "cancelAtPeriodEnd"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "billingOverride"       "BillingOverride" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "billingOverrideReason" TEXT,
  ADD COLUMN "billingOverrideBy"     TEXT,
  ADD COLUMN "billingOverrideAt"     TIMESTAMP(3),
  ADD COLUMN "billingOverrideUntil"  TIMESTAMP(3);

CREATE UNIQUE INDEX "Family_stripeCustomerId_key" ON "Family"("stripeCustomerId");
CREATE UNIQUE INDEX "Family_stripeSubscriptionId_key" ON "Family"("stripeSubscriptionId");

CREATE TABLE "StripeEvent" (
  "id"          TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "familyId"    TEXT,
  CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StripeEvent_familyId_idx" ON "StripeEvent"("familyId");
CREATE INDEX "StripeEvent_type_idx" ON "StripeEvent"("type");
ALTER TABLE "StripeEvent" ADD CONSTRAINT "StripeEvent_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BillingOverrideLog" (
  "id"        TEXT NOT NULL,
  "familyId"  TEXT NOT NULL,
  "adminId"   TEXT NOT NULL,
  "action"    TEXT NOT NULL,
  "prevType"  "BillingOverride" NOT NULL,
  "newType"   "BillingOverride" NOT NULL,
  "reason"    TEXT,
  "until"     TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingOverrideLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BillingOverrideLog_familyId_createdAt_idx" ON "BillingOverrideLog"("familyId", "createdAt");
CREATE INDEX "BillingOverrideLog_adminId_idx" ON "BillingOverrideLog"("adminId");
ALTER TABLE "BillingOverrideLog" ADD CONSTRAINT "BillingOverrideLog_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
