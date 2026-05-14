-- AlterEnum
ALTER TYPE "AssignmentMode" ADD VALUE 'TEAM';

-- CreateEnum
CREATE TYPE "TeamSplit" AS ENUM ('EVEN', 'FULL');

-- CreateEnum
CREATE TYPE "MissedOpportunityMode" AS ENUM ('OFF', 'GENTLE', 'SAVAGE');

-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'PENALTY';

-- AlterTable: ChildProfile
ALTER TABLE "ChildProfile"
  ADD COLUMN "streakGraceCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "penaltiesExempt" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Task
ALTER TABLE "Task"
  ADD COLUMN "teamSplit" "TeamSplit" NOT NULL DEFAULT 'EVEN',
  ADD COLUMN "missedPenalty" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "categoryId" TEXT;

-- CreateTable: TaskCategory
CREATE TABLE "TaskCategory" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "color" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskCategory_familyId_name_key" ON "TaskCategory"("familyId", "name");
CREATE INDEX "TaskCategory_familyId_idx" ON "TaskCategory"("familyId");
ALTER TABLE "TaskCategory" ADD CONSTRAINT "TaskCategory_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Task.categoryId
CREATE INDEX "Task_categoryId_idx" ON "Task"("categoryId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TaskCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: TaskJoin
CREATE TABLE "TaskJoin" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "occurrenceDate" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskJoin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskJoin_taskId_childId_occurrenceDate_key" ON "TaskJoin"("taskId", "childId", "occurrenceDate");
CREATE INDEX "TaskJoin_familyId_idx" ON "TaskJoin"("familyId");
CREATE INDEX "TaskJoin_taskId_occurrenceDate_idx" ON "TaskJoin"("taskId", "occurrenceDate");
ALTER TABLE "TaskJoin" ADD CONSTRAINT "TaskJoin_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskJoin" ADD CONSTRAINT "TaskJoin_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: MissedOpportunity
CREATE TABLE "MissedOpportunity" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "occurrenceDate" TEXT,
  "claimedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MissedOpportunity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MissedOpportunity_taskId_occurrenceDate_key" ON "MissedOpportunity"("taskId", "occurrenceDate");
CREATE INDEX "MissedOpportunity_familyId_createdAt_idx" ON "MissedOpportunity"("familyId", "createdAt");
ALTER TABLE "MissedOpportunity" ADD CONSTRAINT "MissedOpportunity_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissedOpportunity" ADD CONSTRAINT "MissedOpportunity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ChildSavingsGoal
CREATE TABLE "ChildSavingsGoal" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "rewardId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChildSavingsGoal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChildSavingsGoal_childId_position_key" ON "ChildSavingsGoal"("childId", "position");
CREATE UNIQUE INDEX "ChildSavingsGoal_childId_rewardId_key" ON "ChildSavingsGoal"("childId", "rewardId");
CREATE INDEX "ChildSavingsGoal_familyId_idx" ON "ChildSavingsGoal"("familyId");
ALTER TABLE "ChildSavingsGoal" ADD CONSTRAINT "ChildSavingsGoal_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildSavingsGoal" ADD CONSTRAINT "ChildSavingsGoal_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: ChildSavingsGoal from legacy ChildProfile.savingsGoalRewardId (position 1)
INSERT INTO "ChildSavingsGoal" ("id", "familyId", "childId", "rewardId", "position", "createdAt")
SELECT gen_random_uuid()::text, cp."familyId", cp."userId", cp."savingsGoalRewardId", 1, NOW()
FROM "ChildProfile" cp
WHERE cp."savingsGoalRewardId" IS NOT NULL;
