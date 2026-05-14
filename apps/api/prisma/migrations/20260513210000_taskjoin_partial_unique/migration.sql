-- Replace the original full composite unique with two partial unique indexes so that
-- (taskId, childId, NULL occurrenceDate) is also constrained to one row. Postgres
-- treats NULLs as distinct under a regular UNIQUE, which would otherwise let two
-- ONE_TIME TEAM-task joins for the same kid coexist and double-count in splits.

-- Drop the constraint name Prisma generates, plus the matching index, defensively
-- (some envs may have just the index, not the constraint).
ALTER TABLE "TaskJoin" DROP CONSTRAINT IF EXISTS "TaskJoin_taskId_childId_occurrenceDate_key";
DROP INDEX IF EXISTS "TaskJoin_taskId_childId_occurrenceDate_key";

CREATE UNIQUE INDEX "TaskJoin_uniq_recurring"
  ON "TaskJoin" ("taskId", "childId", "occurrenceDate")
  WHERE "occurrenceDate" IS NOT NULL;

CREATE UNIQUE INDEX "TaskJoin_uniq_onetime"
  ON "TaskJoin" ("taskId", "childId")
  WHERE "occurrenceDate" IS NULL;
