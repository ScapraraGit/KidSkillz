-- CreateEnum
CREATE TYPE "AssignmentMode" AS ENUM ('ASSIGNED', 'UP_FOR_GRABS');

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_assignedToId_fkey";

-- AlterTable
ALTER TABLE "Task"
  ADD COLUMN "assignmentMode" "AssignmentMode" NOT NULL DEFAULT 'ASSIGNED',
  ALTER COLUMN "assignedToId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
