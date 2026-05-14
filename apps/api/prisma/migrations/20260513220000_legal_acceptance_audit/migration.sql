-- CreateEnum
CREATE TYPE "LegalAcceptanceKind" AS ENUM ('TERMS', 'PRIVACY', 'CHILD_PROFILE_CONSENT', 'UPLOAD_ACK');

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "kind" "LegalAcceptanceKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "subjectChildId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalAcceptance_userId_kind_idx" ON "LegalAcceptance"("userId", "kind");

-- CreateIndex
CREATE INDEX "LegalAcceptance_familyId_idx" ON "LegalAcceptance"("familyId");

-- CreateIndex
CREATE INDEX "LegalAcceptance_createdAt_idx" ON "LegalAcceptance"("createdAt");

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
