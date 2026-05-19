import type {
  ApprovalStatus,
  AssignmentMode,
  ChallengeKind,
  ChallengeWindow,
  ChildAuthMode,
  ChildViewMode,
  InitiativeKind,
  InvitationKind,
  InvitationStatus,
  LedgerKind,
  MissedOpportunityMode,
  NotificationKind,
  ProofRequirement,
  RecurrenceFrequency,
  RewardType,
  Role,
  TaskKind,
  TeamSplit,
} from "./enums.js";

export interface CaregiverScope {
  canApproveTasks: boolean;
  canApproveRedemptions: boolean;
  canApproveInitiatives: boolean;
  canViewLedger: boolean;
  kidIds: string[];
}

export interface InvitationDTO {
  id: string;
  kind: InvitationKind;
  status: InvitationStatus;
  email: string | null;
  inviteeName: string | null;
  validFrom: string | null;
  validUntil: string | null;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
}

export interface FamilySettings {
  childAuthMode: ChildAuthMode;
  defaultProofRequirement: ProofRequirement;
  allowNegativeBalance: boolean;
  initiativeBonus: {
    enabled: boolean;
    plannedFlatBonus: number; // credits added on top when planned-initiative is approved
    plannedMultiplier: number; // 1 = none, 1.5 = +50% of suggested
  };
  latePenalty: {
    enabled: boolean;
    graceMinutes: number; // grace window after deadline still considered on-time
    lateMultiplier: number; // late zone extends from deadline+grace to deadline + grace*lateMultiplier
    latePercent: number; // 0..1; portion of creditValue awarded during late zone
    creditFloor: number; // award beyond late zone (0 for strict, 1 for gentle)
  };
  screenTime: {
    incrementMinutes: number; // 30
    maxPerRedemptionMinutes: number; // 60
  };
  /** Days to retain proof photos before auto-purge. Set to 0 to keep forever. */
  photoRetentionDays: number;
  /** Mirror in-app notifications to email for any user with an email on file. Default off. */
  emailNotifications?: boolean;
  /** When active, blocks new completion submissions and freezes streak loss family-wide. */
  vacationMode?: {
    active: boolean;
    startsAt?: string | null; // ISO; set by server when active flips on
    endsAt?: string | null; // ISO; once past, server auto-deactivates
    note?: string | null;
  };
  /** When true, kid-facing endpoints scrub siblings' balances, levels, leaderboards. */
  siblingPrivacy?: boolean;
  /** Master switch for negative-credit penalties on missed tasks. Off by default. */
  penaltiesEnabled?: boolean;
  /** Parent-self-claim FOMO overlay tone for kid dashboard. */
  missedOpportunityMode?: MissedOpportunityMode;
  timezone: string; // IANA, e.g. "America/Phoenix"
}

export const DEFAULT_FAMILY_SETTINGS: FamilySettings = {
  childAuthMode: "INDIVIDUAL",
  defaultProofRequirement: "NOTES_OPTIONAL",
  allowNegativeBalance: false,
  initiativeBonus: {
    enabled: true,
    plannedFlatBonus: 2,
    plannedMultiplier: 1.25,
  },
  latePenalty: {
    enabled: true,
    graceMinutes: 30,
    lateMultiplier: 2.0,
    latePercent: 0.5,
    creditFloor: 1,
  },
  screenTime: {
    incrementMinutes: 30,
    maxPerRedemptionMinutes: 60,
  },
  photoRetentionDays: 90,
  emailNotifications: false,
  vacationMode: { active: false, startsAt: null, endsAt: null, note: null },
  siblingPrivacy: false,
  penaltiesEnabled: false,
  missedOpportunityMode: "GENTLE",
  timezone: "America/Phoenix",
};

export interface Recurrence {
  frequency: RecurrenceFrequency;
  daysOfWeek?: number[]; // 0..6. Required for WEEKLY/CUSTOM. Optional on DAILY — when set (e.g. [1,2,3,4,5]) DAILY runs only on those days ("weekdays only"). Omit/empty on DAILY = every day.
  expiresAt?: string | null;
}

export interface RewardMetadata {
  // SCREEN_TIME / GAME_TIME — quantity-based
  unitMinutes?: number; // step size (e.g. 30)
  maxPerRedemption?: number; // e.g. 60
  // MONEY
  currency?: string;
  amountPerCredit?: number;
  // free-form notes
  notes?: string;
}

/**
 * Customizable avatar (DiceBear "avataaars" style). Arrays are option pools the
 * renderer picks from; a one-element array pins the value. Unset = library default.
 */
export interface AvatarConfig {
  top?: string[];
  topProbability?: number;
  hairColor?: string[];
  hatColor?: string[];
  accessories?: string[];
  accessoriesColor?: string[];
  accessoriesProbability?: number;
  facialHair?: string[];
  facialHairColor?: string[];
  facialHairProbability?: number;
  clothing?: string[];
  clothesColor?: string[];
  clothingGraphic?: string[];
  eyes?: string[];
  eyebrows?: string[];
  mouth?: string[];
  skinColor?: string[];
  backgroundColor?: string[];
  /** Companion pet identifier (e.g. "dragon"). Rendered next to avatar; evolves with level. */
  pet?: string;
}

export interface AuthUserDTO {
  id: string;
  familyId: string;
  role: Role;
  name: string;
  email?: string | null;
  avatarColor?: string;
  avatarConfig?: AvatarConfig | null;
  onboardedAt?: string | null;
  validUntil?: string | null;
  emailVerifiedAt?: string | null;
  acceptedTermsVersion?: number | null;
  acceptedTermsAt?: string | null;
  isAdmin?: boolean;
}

/**
 * Current ToS revision. Bump when material changes ship; users with
 * acceptedTermsVersion < CURRENT_TERMS_VERSION get re-prompted on next session.
 */
export const CURRENT_TERMS_VERSION = 2;

/** Current Privacy Policy revision. Tracked alongside ToS via LegalAcceptance audit log. */
export const CURRENT_PRIVACY_VERSION = 3;

/** Server-recorded legal-acceptance event kinds. Mirrors api LegalAcceptanceKind enum. */
export type LegalAcceptanceKind =
  | "TERMS"
  | "PRIVACY"
  | "CHILD_PROFILE_CONSENT"
  | "UPLOAD_ACK"
  | "HOUSEHOLD_TOOL_ACK"
  | "NO_CASH_VALUE_ACK";

export interface FeatureFlagsDTO {
  /** Whether photo proof on tasks is currently available end-to-end. When false, web hides PHOTO_* options and API rejects them. */
  photoProof: boolean;
  /** Whether device pairing is enabled. When true, kid login requires a paired device; familyCode/family-password flow is hidden. */
  devicePairing: boolean;
  /** Whether guardian consent must be captured when creating a child profile. True for school/organization deployments where staff create profiles on behalf of guardians. False for personal family use. */
  orgConsentRequired: boolean;
}

export interface MeResponseDTO {
  user: AuthUserDTO;
  settings: FamilySettings;
  needsOnboarding: boolean;
  needsHouseholdAck: boolean;
  features: FeatureFlagsDTO;
}

export interface ChildDTO {
  id: string;
  familyId: string;
  name: string;
  avatarColor: string;
  avatarConfig?: AvatarConfig | null;
  redemptionPaused: boolean;
  earningPaused: boolean;
  proofRequirementOverride?: ProofRequirement | null;
  soundEnabled: boolean;
  viewMode: ChildViewMode;
  /** @deprecated use savingsGoalRewardIds. Mirrors position-1 entry for back-compat. */
  savingsGoalRewardId?: string | null;
  /** Up to 3 reward IDs in display order. Empty if kid hasn't pinned any. */
  savingsGoalRewardIds: string[];
  streakGraceCount: number;
  penaltiesExempt: boolean;
  balance: number;
}

export interface TaskDTO {
  id: string;
  familyId: string;
  title: string;
  description?: string | null;
  creditValue: number;
  /** Free-text legacy category. Prefer categoryId + TaskCategoryDTO going forward. */
  category?: string | null;
  categoryId?: string | null;
  kind: TaskKind;
  recurrence?: Recurrence | null;
  dueAt?: string | null;
  dueByTime?: string | null; // "HH:MM" family TZ — recurring tasks only
  /** Times this RECURRING task must be done per day (1..10). ONE_TIME is always 1. */
  timesPerDay: number;
  /** Per-slot UI labels. Length 0 (use "#N" fallback) or equal to timesPerDay. */
  slotLabels: string[];
  defaultDurationMinutes?: number | null; // optional kid-focus timer suggestion
  proofRequirement: ProofRequirement;
  isActive: boolean;
  assignmentMode: AssignmentMode;
  /** EVEN splits creditValue across joiners (rounded up). FULL gives each joiner full creditValue. */
  teamSplit: TeamSplit;
  /** Negative-credit penalty when kid misses this task. 0 = no penalty. Only applied when family.penaltiesEnabled. */
  missedPenalty: number;
  /** Null when assignmentMode is UP_FOR_GRABS or TEAM. */
  assignedToId: string | null;
}

export interface TaskCategoryDTO {
  id: string;
  familyId: string;
  name: string;
  icon: string;
  color?: string | null;
  position: number;
}

export interface TaskJoinDTO {
  id: string;
  taskId: string;
  childId: string;
  occurrenceDate: string | null;
  slotIndex: number;
  createdAt: string;
}

export interface MissedOpportunityDTO {
  id: string;
  taskId: string;
  occurrenceDate: string | null;
  slotIndex: number;
  claimedByUserId: string;
  claimedByName?: string;
  taskTitle?: string;
  createdAt: string;
}

export type LateTier = "ON_TIME" | "LATE" | "SEVERE";

export interface SuggestedAwardDTO {
  credits: number; // recommended award after applying decay
  tier: LateTier; // which bucket the submission fell into
  lateMinutes: number; // submittedAt - deadline (0 if on time)
  deadline: string | null; // ISO timestamp of the computed deadline; null if task has no time-window
}

export interface TodayTaskOccurrenceDTO {
  task: TaskDTO;
  occurrenceDate: string; // YYYY-MM-DD in family TZ
  /** 0-based slot within the occurrence day. 0 for ONE_TIME / single-slot RECURRING. */
  slotIndex: number;
  /** Resolved slot label (slotLabels[slotIndex] when set, otherwise "#N"). */
  slotLabel: string;
  completionId?: string | null;
  completionStatus?: ApprovalStatus | null;
  /** TEAM mode only: whether this kid has joined the team for this occurrence. */
  joined?: boolean;
  /** TEAM mode only: childIds on the team roster for this occurrence. */
  teamJoinerIds?: string[];
}

export interface TaskCompletionDTO {
  id: string;
  taskId: string;
  childId: string;
  status: ApprovalStatus;
  notes?: string | null;
  photoKey?: string | null;
  occurrenceDate?: string | null;
  slotIndex: number;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  creditAwarded?: number | null;
  parentNote?: string | null;
  suggestedAward?: SuggestedAwardDTO | null;
  task?: TaskDTO;
  child?: { id: string; name: string; avatarColor: string };
}

export interface InitiativeRequestDTO {
  id: string;
  familyId: string;
  childId: string;
  kind: InitiativeKind;
  title: string;
  description?: string | null;
  suggestedCredits: number;
  status: ApprovalStatus;
  notes?: string | null;
  photoKey?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  creditAwarded?: number | null;
  bonusApplied?: number | null;
  child?: { id: string; name: string; avatarColor: string };
}

export interface RewardDTO {
  id: string;
  familyId: string;
  name: string;
  description?: string | null;
  creditCost: number;
  type: RewardType;
  requiresApproval: boolean;
  isActive: boolean;
  weeklyLimit?: number | null;
  dailyLimit?: number | null;
  metadata: RewardMetadata;
  eligibleChildIds: string[]; // empty = all
}

export interface RedemptionDTO {
  id: string;
  rewardId: string;
  childId: string;
  status: ApprovalStatus;
  creditCost: number;
  quantity: number;
  notes?: string | null;
  requestedAt: string;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  reward?: RewardDTO;
  child?: { id: string; name: string; avatarColor: string };
}

export interface LedgerEntryDTO {
  id: string;
  childId: string;
  amount: number;
  kind: LedgerKind;
  reason: string;
  sourceType?: string | null;
  sourceId?: string | null;
  createdById?: string | null;
  createdAt: string;
  /** Optional kudos message attached at approval time (TASK entries only). */
  parentNote?: string | null;
}

export interface ChildStatsDTO {
  balance: number;
  weekEarned: number;
  weekSpent: number;
  streakDays: number;
  initiativeScore: number;
  aboveAndBeyondCount: number;
  badges: string[];
}

export interface ParentDashboardDTO {
  children: ChildDTO[];
  pendingCompletions: TaskCompletionDTO[];
  pendingInitiative: InitiativeRequestDTO[];
  pendingRedemptions: RedemptionDTO[];
  recentLedger: LedgerEntryDTO[];
  weeklyTotals: { childId: string; earned: number; spent: number }[];
}

export interface ChildDashboardDTO {
  child: ChildDTO;
  stats: ChildStatsDTO;
  todayTasks: TodayTaskOccurrenceDTO[];
  recentLedger: LedgerEntryDTO[];
  pendingCompletionCount: number;
  pendingRedemptionCount: number;
}

export interface ChallengeDTO {
  id: string;
  familyId: string;
  kind: ChallengeKind;
  title: string;
  target: number;
  window: ChallengeWindow;
  rewardCredits: number;
  isActive: boolean;
  startsAt: string;
  endsAt?: string | null;
}

/**
 * periodKey format: "YYYY-MM-DD" for DAY window, "YYYY-Www" (ISO week) for WEEK window.
 */
export interface ChallengeProgressDTO {
  id: string;
  challengeId: string;
  childId: string;
  periodKey: string;
  value: number;
  completedAt?: string | null;
  challenge?: ChallengeDTO;
}

export const CHALLENGE_PERIOD_KEY_PATTERN = /^(\d{4}-\d{2}-\d{2}|\d{4}-W\d{2})$/;

export interface LevelDTO {
  level: number;
  xp: number; // lifetime positive ledger sum
  xpInLevel: number; // xp above current level threshold
  xpToNext: number; // xp needed to reach next level from current threshold
}

export interface NotificationDTO {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}
