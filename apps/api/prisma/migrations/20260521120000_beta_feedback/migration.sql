-- Beta tester feedback + checklist progress tracking. JSONB payload keeps the
-- survey flexible (questions evolve without a migration); overallRating /
-- recommend / tags are column-projected so admin triage lists can sort + filter
-- without parsing JSON on every row.

CREATE TABLE "BetaFeedback" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "overallRating" INTEGER,
  "recommend" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "payload" JSONB NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BetaFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BetaFeedback_familyId_createdAt_idx" ON "BetaFeedback" ("familyId", "createdAt");
CREATE INDEX "BetaFeedback_userId_idx" ON "BetaFeedback" ("userId");

CREATE TABLE "BetaChecklistProgress" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "completed" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "submittedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BetaChecklistProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BetaChecklistProgress_userId_key" ON "BetaChecklistProgress" ("userId");
CREATE INDEX "BetaChecklistProgress_familyId_idx" ON "BetaChecklistProgress" ("familyId");
