-- Phase 1 of multi-family membership (plans/08-multi-family-membership.md).
-- Adds FamilyMembership table + enums, backfills one row per PARENT/CAREGIVER
-- user. CHILD users stay on User.familyId. No existing columns dropped or
-- altered. User.familyId stays NOT NULL until Phase 2.

CREATE TYPE "MembershipRole" AS ENUM ('PARENT', 'CAREGIVER');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "FamilyMembership" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "familyId"       TEXT NOT NULL,
  "role"           "MembershipRole" NOT NULL,
  "status"         "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "validFrom"      TIMESTAMP(3),
  "validUntil"     TIMESTAMP(3),
  "scope"          JSONB,
  "isBillingOwner" BOOLEAN NOT NULL DEFAULT false,
  "invitedById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FamilyMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FamilyMembership_userId_familyId_key"
  ON "FamilyMembership" ("userId", "familyId");
CREATE INDEX "FamilyMembership_familyId_idx" ON "FamilyMembership" ("familyId");
CREATE INDEX "FamilyMembership_userId_idx"   ON "FamilyMembership" ("userId");

ALTER TABLE "FamilyMembership"
  ADD CONSTRAINT "FamilyMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FamilyMembership_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "FamilyMembership_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one membership per existing PARENT/CAREGIVER User. CAREGIVER scope
-- fields copied from User (Phase 3 will drop them from User).
INSERT INTO "FamilyMembership"
  ("id", "userId", "familyId", "role", "status",
   "validFrom", "validUntil", "scope", "isBillingOwner",
   "invitedById", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  u."id",
  u."familyId",
  u."role"::text::"MembershipRole",
  'ACTIVE',
  u."validFrom",
  u."validUntil",
  u."scope",
  false,
  u."invitedById",
  u."createdAt",
  NOW()
FROM "User" u
WHERE u."role" IN ('PARENT', 'CAREGIVER');

-- Mark first PARENT (oldest createdAt) per family as billing owner.
WITH first_parent AS (
  SELECT DISTINCT ON (m."familyId") m."id" AS membership_id, m."familyId"
  FROM "FamilyMembership" m
  WHERE m."role" = 'PARENT' AND m."status" = 'ACTIVE'
  ORDER BY m."familyId", m."createdAt" ASC, m."id" ASC
)
UPDATE "FamilyMembership" m
SET "isBillingOwner" = true
FROM first_parent fp
WHERE m."id" = fp.membership_id;
