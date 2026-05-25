-- Phase 3 of multi-family membership (plans/08-multi-family-membership.md).
-- Nulls User.familyId for adults, drops legacy CAREGIVER scope columns from
-- User (they now live on FamilyMembership), enforces CHILD-must-have-family.
--
-- Safety: existing CAREGIVER memberships were backfilled in Phase 1 with the
-- caregiver's old User.validFrom/validUntil/scope copied across, so the data
-- isn't lost — just relocated. Running this against a DB that hasn't applied
-- Phase 1 + Phase 2 will silently null caregiver windows. Don't.

-- Null adult familyId. Children keep their familyId.
UPDATE "User"
SET "familyId" = NULL
WHERE "role" IN ('PARENT', 'CAREGIVER');

-- CHILD users must have a familyId. Adults must not (their family scope comes
-- from FamilyMembership). Enforced with one CHECK so a future seed/import
-- can't accidentally re-couple an adult to a single family.
ALTER TABLE "User"
  ADD CONSTRAINT "User_familyId_role_check"
  CHECK (
    ("role" = 'CHILD'  AND "familyId" IS NOT NULL) OR
    ("role" IN ('PARENT', 'CAREGIVER') AND "familyId" IS NULL)
  );

-- Drop legacy CAREGIVER scope columns. FamilyMembership now owns them per-family.
ALTER TABLE "User"
  DROP COLUMN "validFrom",
  DROP COLUMN "validUntil",
  DROP COLUMN "scope";
