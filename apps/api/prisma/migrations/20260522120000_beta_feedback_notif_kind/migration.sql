-- Add new NotificationKind enum value used by the beta feedback admin alert.
-- ALTER TYPE ADD VALUE is non-destructive and safe on populated tables.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'BETA_FEEDBACK_RECEIVED';
