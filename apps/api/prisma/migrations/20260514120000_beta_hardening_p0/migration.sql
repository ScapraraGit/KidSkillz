-- Beta hardening P0: PIN lockout, shared-device password, family lookup code,
-- idempotency cache for ledger mutations.

-- Family: shared-device password + lookup code.
ALTER TABLE "Family"
  ADD COLUMN "familyCode" TEXT,
  ADD COLUMN "devicePasswordHash" TEXT;

CREATE UNIQUE INDEX "Family_familyCode_key" ON "Family"("familyCode");

-- User: PIN lockout counters.
ALTER TABLE "User"
  ADD COLUMN "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pinLockedUntil" TIMESTAMP(3);

-- Idempotency cache for ledger-affecting mutations.
CREATE TABLE "IdempotencyKey" (
  "id"           TEXT NOT NULL,
  "familyId"     TEXT NOT NULL,
  "key"          TEXT NOT NULL,
  "route"        TEXT NOT NULL,
  "statusCode"   INTEGER NOT NULL,
  "responseJson" JSONB NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyKey_familyId_key_key" ON "IdempotencyKey"("familyId", "key");
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");
