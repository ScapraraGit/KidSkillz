-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('COMPLETION_APPROVED', 'COMPLETION_REJECTED', 'REDEMPTION_APPROVED', 'REDEMPTION_REJECTED', 'INITIATIVE_APPROVED', 'INITIATIVE_REJECTED', 'CHALLENGE_COMPLETED', 'LEVEL_UP', 'KUDOS');

-- AlterTable
ALTER TABLE "ChildProfile" ADD COLUMN     "savingsGoalRewardId" TEXT;

-- AlterTable
ALTER TABLE "TaskCompletion" ADD COLUMN     "parentNote" TEXT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_familyId_idx" ON "Notification"("familyId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
