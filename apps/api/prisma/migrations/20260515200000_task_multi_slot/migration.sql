-- Multi-per-day tasks. Adds Task.timesPerDay + Task.slotLabels and a slotIndex
-- discriminator to TaskCompletion, TaskJoin, MissedOpportunity. Existing rows
-- default to slotIndex=0 / timesPerDay=1, preserving prior single-slot behavior.

-- 1. Task: per-day slot count + optional UI labels.
ALTER TABLE "Task" ADD COLUMN "timesPerDay" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Task" ADD COLUMN "slotLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 2. TaskCompletion: slot column + swap unique constraint.
ALTER TABLE "TaskCompletion" ADD COLUMN "slotIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TaskCompletion" DROP CONSTRAINT IF EXISTS "TaskCompletion_taskId_childId_occurrenceDate_key";
DROP INDEX IF EXISTS "TaskCompletion_taskId_childId_occurrenceDate_key";
ALTER TABLE "TaskCompletion"
  ADD CONSTRAINT "TaskCompletion_taskId_childId_occurrenceDate_slotIndex_key"
  UNIQUE ("taskId", "childId", "occurrenceDate", "slotIndex");

-- 3. TaskJoin: slot column + replace partial uniqueness indexes.
ALTER TABLE "TaskJoin" ADD COLUMN "slotIndex" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "TaskJoin_uniq_recurring";
DROP INDEX IF EXISTS "TaskJoin_uniq_onetime";
CREATE UNIQUE INDEX "TaskJoin_uniq_recurring"
  ON "TaskJoin" ("taskId", "childId", "occurrenceDate", "slotIndex")
  WHERE "occurrenceDate" IS NOT NULL;
CREATE UNIQUE INDEX "TaskJoin_uniq_onetime"
  ON "TaskJoin" ("taskId", "childId", "slotIndex")
  WHERE "occurrenceDate" IS NULL;

-- 4. MissedOpportunity: slot column + swap unique.
ALTER TABLE "MissedOpportunity" ADD COLUMN "slotIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MissedOpportunity" DROP CONSTRAINT IF EXISTS "MissedOpportunity_taskId_occurrenceDate_key";
DROP INDEX IF EXISTS "MissedOpportunity_taskId_occurrenceDate_key";
ALTER TABLE "MissedOpportunity"
  ADD CONSTRAINT "MissedOpportunity_taskId_occurrenceDate_slotIndex_key"
  UNIQUE ("taskId", "occurrenceDate", "slotIndex");
