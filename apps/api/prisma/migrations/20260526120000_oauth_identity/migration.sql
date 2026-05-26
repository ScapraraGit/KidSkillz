-- Phase 0 of social login (plans/09-social-login-google.md).
-- Adds OAuthProvider enum + OAuthIdentity table. Additive only — no existing
-- column or table is modified. User.passwordHash already nullable, supports
-- passwordless social-only users in Phase 3.

CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE');

CREATE TABLE "OAuthIdentity" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "provider"      "OAuthProvider" NOT NULL,
  "providerSub"   TEXT NOT NULL,
  "email"         TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "linkedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastLoginAt"   TIMESTAMP(3),

  CONSTRAINT "OAuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthIdentity_provider_providerSub_key"
  ON "OAuthIdentity"("provider", "providerSub");

CREATE UNIQUE INDEX "OAuthIdentity_provider_userId_key"
  ON "OAuthIdentity"("provider", "userId");

CREATE INDEX "OAuthIdentity_userId_idx" ON "OAuthIdentity"("userId");

ALTER TABLE "OAuthIdentity"
  ADD CONSTRAINT "OAuthIdentity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
