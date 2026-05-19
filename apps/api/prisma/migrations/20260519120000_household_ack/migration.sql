-- Extend LegalAcceptanceKind enum with two acknowledgement event types now
-- captured post-signup via the "How ChoreChampz works" modal instead of inline
-- checkboxes on the signup form. ALTER TYPE ADD VALUE is non-destructive.
ALTER TYPE "LegalAcceptanceKind" ADD VALUE IF NOT EXISTS 'HOUSEHOLD_TOOL_ACK';
ALTER TYPE "LegalAcceptanceKind" ADD VALUE IF NOT EXISTS 'NO_CASH_VALUE_ACK';

-- Track when a user dismissed the household-tool acknowledgement modal so we
-- can gate the dashboard until both acknowledgements are recorded.
ALTER TABLE "User" ADD COLUMN "householdAckAt" TIMESTAMP(3);
