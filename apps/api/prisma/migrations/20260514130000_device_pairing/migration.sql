-- Device pairing: EnrolledDevice + DeviceEnrollment.

CREATE TABLE "EnrolledDevice" (
  "id"              TEXT NOT NULL,
  "familyId"        TEXT NOT NULL,
  "label"           TEXT NOT NULL,
  "deviceTokenHash" TEXT NOT NULL,
  "enrolledAt"      TIMESTAMP(3),
  "lastSeenAt"      TIMESTAMP(3),
  "revokedAt"       TIMESTAMP(3),
  "revokedById"     TEXT,
  "createdById"     TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrolledDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnrolledDevice_deviceTokenHash_key" ON "EnrolledDevice"("deviceTokenHash");
CREATE INDEX "EnrolledDevice_familyId_idx" ON "EnrolledDevice"("familyId");

ALTER TABLE "EnrolledDevice"
  ADD CONSTRAINT "EnrolledDevice_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DeviceEnrollment" (
  "id"               TEXT NOT NULL,
  "familyId"         TEXT NOT NULL,
  "codeHash"         TEXT NOT NULL,
  "nonceHash"        TEXT,
  "label"            TEXT,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "consumedAt"       TIMESTAMP(3),
  "consumedDeviceId" TEXT,
  "createdById"      TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceEnrollment_codeHash_key" ON "DeviceEnrollment"("codeHash");
CREATE UNIQUE INDEX "DeviceEnrollment_nonceHash_key" ON "DeviceEnrollment"("nonceHash");
CREATE INDEX "DeviceEnrollment_familyId_expiresAt_idx" ON "DeviceEnrollment"("familyId", "expiresAt");

ALTER TABLE "DeviceEnrollment"
  ADD CONSTRAINT "DeviceEnrollment_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
