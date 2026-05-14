-- CreateTable
CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "actorId" TEXT,
  "kind" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_familyId_createdAt_idx" ON "AuditEvent"("familyId", "createdAt");
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
