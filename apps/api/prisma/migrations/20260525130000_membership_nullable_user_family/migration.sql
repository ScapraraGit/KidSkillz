-- Phase 2 of multi-family membership (plans/08-multi-family-membership.md).
-- Relaxes User.familyId to nullable and adds RefreshToken.familyMembershipId
-- so refresh rotation remembers the active family. No data is modified here.

ALTER TABLE "User" ALTER COLUMN "familyId" DROP NOT NULL;

ALTER TABLE "RefreshToken"
  ADD COLUMN "familyMembershipId" TEXT;

-- Best-effort FK so cascade works if the membership is hard-deleted (cleanup
-- on family delete). SetNull keeps the refresh row alive — the consumer will
-- treat NULL `mid` as "no active family" and force re-selection.
ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_familyMembershipId_fkey"
    FOREIGN KEY ("familyMembershipId") REFERENCES "FamilyMembership"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
