import type {
  ApprovalStatus,
  ChildAuthMode,
  InitiativeKind,
  LedgerKind,
  ProofRequirement,
  RecurrenceFrequency,
  RewardType,
  Role,
  TaskKind,
} from "./enums.js";

export interface FamilySettings {
  childAuthMode: ChildAuthMode;
  defaultProofRequirement: ProofRequirement;
  allowNegativeBalance: boolean;
  initiativeBonus: {
    enabled: boolean;
    plannedFlatBonus: number;     // credits added on top when planned-initiative is approved
    plannedMultiplier: number;    // 1 = none, 1.5 = +50% of suggested
  };
  latePenalty: {
    enabled: boolean;
    graceMinutes: number;         // grace window after deadline still considered on-time
    lateMultiplier: number;       // late zone extends from deadline+grace to deadline + grace*lateMultiplier
    latePercent: number;          // 0..1; portion of creditValue awarded during late zone
    creditFloor: number;          // award beyond late zone (0 for strict, 1 for gentle)
  };
  screenTime: {
    incrementMinutes: number;     // 30
    maxPerRedemptionMinutes: number; // 60
  };
  timezone: string;               // IANA, e.g. "America/Phoenix"
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
  timezone: "America/Phoenix",
};

export interface Recurrence {
  frequency: RecurrenceFrequency;
  daysOfWeek?: number[]; // 0..6 when CUSTOM/WEEKLY
  expiresAt?: string | null;
}

export interface RewardMetadata {
  // SCREEN_TIME / GAME_TIME — quantity-based
  unitMinutes?: number;       // step size (e.g. 30)
  maxPerRedemption?: number;  // e.g. 60
  // MONEY
  currency?: string;
  amountPerCredit?: number;
  // free-form notes
  notes?: string;
}

export interface AuthUserDTO {
  id: string;
  familyId: string;
  role: Role;
  name: string;
  email?: string | null;
  avatarColor?: string;
  onboardedAt?: string | null;
}

export interface MeResponseDTO {
  user: AuthUserDTO;
  settings: FamilySettings;
  needsOnboarding: boolean;
}

export interface ChildDTO {
  id: string;
  familyId: string;
  name: string;
  avatarColor: string;
  redemptionPaused: boolean;
  earningPaused: boolean;
  proofRequirementOverride?: ProofRequirement | null;
  balance: number;
}

export interface TaskDTO {
  id: string;
  familyId: string;
  title: string;
  description?: string | null;
  creditValue: number;
  category?: string | null;
  kind: TaskKind;
  recurrence?: Recurrence | null;
  dueAt?: string | null;
  dueByTime?: string | null;       // "HH:MM" family TZ — recurring tasks only
  proofRequirement: ProofRequirement;
  isActive: boolean;
  assignedToId: string;
}

export type LateTier = "ON_TIME" | "LATE" | "SEVERE";

export interface SuggestedAwardDTO {
  credits: number;          // recommended award after applying decay
  tier: LateTier;           // which bucket the submission fell into
  lateMinutes: number;      // submittedAt - deadline (0 if on time)
  deadline: string | null;  // ISO timestamp of the computed deadline; null if task has no time-window
}

export interface TodayTaskOccurrenceDTO {
  task: TaskDTO;
  occurrenceDate: string; // YYYY-MM-DD in family TZ
  completionId?: string | null;
  completionStatus?: ApprovalStatus | null;
}

export interface TaskCompletionDTO {
  id: string;
  taskId: string;
  childId: string;
  status: ApprovalStatus;
  notes?: string | null;
  photoKey?: string | null;
  occurrenceDate?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  creditAwarded?: number | null;
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
