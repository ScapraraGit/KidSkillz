-- Family-level beta-program flag. Gates the /beta routes + dashboard banner.
-- Default false so existing families don't see beta surfaces until an admin
-- toggles them in. Non-destructive add with default — backfill not needed.

ALTER TABLE "Family" ADD COLUMN "isBeta" BOOLEAN NOT NULL DEFAULT false;
