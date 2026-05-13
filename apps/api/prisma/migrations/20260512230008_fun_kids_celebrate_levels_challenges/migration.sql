-- CreateEnum
CREATE TYPE "ChallengeKind" AS ENUM ('COMPLETE_N_TASKS', 'EARN_N_CREDITS', 'INITIATIVE_N_TIMES', 'NO_MISSES', 'EARLY_BIRD');

-- CreateEnum
CREATE TYPE "ChallengeWindow" AS ENUM ('DAY', 'WEEK');

-- CreateEnum
CREATE TYPE "ChildViewMode" AS ENUM ('YOUNGER', 'OLDER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerKind" ADD VALUE 'LEVEL_UP';
ALTER TYPE "LedgerKind" ADD VALUE 'CHALLENGE_BONUS';

-- AlterTable
ALTER TABLE "ChildProfile" ADD COLUMN     "soundEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "viewMode" "ChildViewMode" NOT NULL DEFAULT 'YOUNGER';

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "kind" "ChallengeKind" NOT NULL,
    "title" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "window" "ChallengeWindow" NOT NULL,
    "rewardCredits" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeProgress" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Challenge_familyId_idx" ON "Challenge"("familyId");

-- CreateIndex
CREATE INDEX "Challenge_isActive_idx" ON "Challenge"("isActive");

-- CreateIndex
CREATE INDEX "ChallengeProgress_familyId_idx" ON "ChallengeProgress"("familyId");

-- CreateIndex
CREATE INDEX "ChallengeProgress_childId_idx" ON "ChallengeProgress"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeProgress_challengeId_childId_periodKey_key" ON "ChallengeProgress"("challengeId", "childId", "periodKey");

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeProgress" ADD CONSTRAINT "ChallengeProgress_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeProgress" ADD CONSTRAINT "ChallengeProgress_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeProgress" ADD CONSTRAINT "ChallengeProgress_childId_fkey" FOREIGN KEY ("childId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
