export const Role = {
  PARENT: "PARENT",
  CHILD: "CHILD",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ProofRequirement = {
  NONE: "NONE",
  NOTES_OPTIONAL: "NOTES_OPTIONAL",
  NOTES_REQUIRED: "NOTES_REQUIRED",
  PHOTO_OPTIONAL: "PHOTO_OPTIONAL",
  PHOTO_REQUIRED: "PHOTO_REQUIRED",
  PHOTO_AND_NOTES: "PHOTO_AND_NOTES",
} as const;
export type ProofRequirement = (typeof ProofRequirement)[keyof typeof ProofRequirement];

export const TaskKind = {
  ONE_TIME: "ONE_TIME",
  RECURRING: "RECURRING",
} as const;
export type TaskKind = (typeof TaskKind)[keyof typeof TaskKind];

export const RecurrenceFrequency = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  CUSTOM: "CUSTOM",
} as const;
export type RecurrenceFrequency = (typeof RecurrenceFrequency)[keyof typeof RecurrenceFrequency];

export const ApprovalStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const InitiativeKind = {
  PLANNED: "PLANNED",
  WRITE_IN: "WRITE_IN",
} as const;
export type InitiativeKind = (typeof InitiativeKind)[keyof typeof InitiativeKind];

export const RewardType = {
  SCREEN_TIME: "SCREEN_TIME",
  GAME_TIME: "GAME_TIME",
  MOVIE_NIGHT: "MOVIE_NIGHT",
  MONEY: "MONEY",
  TREAT: "TREAT",
  ACTIVITY: "ACTIVITY",
  CUSTOM: "CUSTOM",
} as const;
export type RewardType = (typeof RewardType)[keyof typeof RewardType];

export const LedgerKind = {
  TASK: "TASK",
  INITIATIVE: "INITIATIVE",
  INITIATIVE_BONUS: "INITIATIVE_BONUS",
  REDEMPTION: "REDEMPTION",
  ADJUSTMENT_POSITIVE: "ADJUSTMENT_POSITIVE",
  ADJUSTMENT_NEGATIVE: "ADJUSTMENT_NEGATIVE",
} as const;
export type LedgerKind = (typeof LedgerKind)[keyof typeof LedgerKind];

export const ChildAuthMode = {
  INDIVIDUAL: "INDIVIDUAL",
  SHARED_DEVICE: "SHARED_DEVICE",
} as const;
export type ChildAuthMode = (typeof ChildAuthMode)[keyof typeof ChildAuthMode];

export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const; // Sun..Sat
