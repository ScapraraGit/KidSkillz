-- Mobile (Capacitor) groundwork (plans/mobile-capacitor.md, appendices A2/A3).
-- Additive only — no existing column or table is modified.
--   * PushToken: native/web push device registrations (Phase 3).
--   * IapSubscription + IapEntitlementGrant: in-app-purchase subscriptions and
--     their revocable per-family grants (Phase 5). A single store subscription
--     can fund multiple families; revoking a grant detaches one family without
--     canceling the underlying subscription.

CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

CREATE TYPE "GrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- PushToken -----------------------------------------------------------------

CREATE TABLE "PushToken" (
  "id"         TEXT NOT NULL,
  "familyId"   TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "platform"   "PushPlatform" NOT NULL,
  "token"      TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

CREATE INDEX "PushToken_familyId_idx" ON "PushToken"("familyId");

CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

ALTER TABLE "PushToken"
  ADD CONSTRAINT "PushToken_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "Family"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushToken"
  ADD CONSTRAINT "PushToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- IapSubscription -----------------------------------------------------------

CREATE TABLE "IapSubscription" (
  "id"                    TEXT NOT NULL,
  "purchaserUserId"       TEXT NOT NULL,
  "platform"              "PushPlatform" NOT NULL,
  "productId"             TEXT NOT NULL,
  "originalTransactionId" TEXT NOT NULL,
  "status"                "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
  "expiresAt"             TIMESTAMP(3),
  "autoRenewing"          BOOLEAN NOT NULL DEFAULT true,
  "lastVerifiedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IapSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IapSubscription_originalTransactionId_key"
  ON "IapSubscription"("originalTransactionId");

CREATE INDEX "IapSubscription_purchaserUserId_idx" ON "IapSubscription"("purchaserUserId");

CREATE INDEX "IapSubscription_status_idx" ON "IapSubscription"("status");

ALTER TABLE "IapSubscription"
  ADD CONSTRAINT "IapSubscription_purchaserUserId_fkey"
    FOREIGN KEY ("purchaserUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- IapEntitlementGrant -------------------------------------------------------

CREATE TABLE "IapEntitlementGrant" (
  "id"              TEXT NOT NULL,
  "subscriptionId"  TEXT NOT NULL,
  "familyId"        TEXT NOT NULL,
  "status"          "GrantStatus" NOT NULL DEFAULT 'ACTIVE',
  "grantedByUserId" TEXT NOT NULL,
  "grantedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedByUserId" TEXT,
  "revokedAt"       TIMESTAMP(3),

  CONSTRAINT "IapEntitlementGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IapEntitlementGrant_subscriptionId_familyId_key"
  ON "IapEntitlementGrant"("subscriptionId", "familyId");

CREATE INDEX "IapEntitlementGrant_familyId_idx" ON "IapEntitlementGrant"("familyId");

CREATE INDEX "IapEntitlementGrant_status_idx" ON "IapEntitlementGrant"("status");

ALTER TABLE "IapEntitlementGrant"
  ADD CONSTRAINT "IapEntitlementGrant_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "IapSubscription"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IapEntitlementGrant"
  ADD CONSTRAINT "IapEntitlementGrant_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "Family"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
