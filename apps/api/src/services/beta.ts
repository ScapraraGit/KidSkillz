import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { createNotification } from "./notifications.js";

// Survey shape lives in the service so the route stays thin. The payload column
// is JSONB — questions can evolve without a migration. Add new optional fields
// here; old submissions remain valid.

const ratingScale = z.number().int().min(1).max(5);

export const checklistKeys = [
  "create_family",
  "add_child",
  "create_task",
  "assign_reward",
  "complete_task",
  "approve_completion",
  "redeem_reward",
  "test_recurring",
  "test_initiative",
  "test_mobile",
  "test_desktop",
] as const;
export type ChecklistKey = (typeof checklistKeys)[number];

export const feedbackPayloadSchema = z.object({
  testerInfo: z
    .object({
      name: z.string().trim().max(80).optional(),
      email: z.string().trim().email().max(200).optional().or(z.literal("")),
      role: z.enum(["PARENT", "GUARDIAN", "OTHER"]).optional(),
      numChildren: z.number().int().min(0).max(20).optional(),
      childAgeRanges: z.array(z.string().max(40)).max(10).optional(),
    })
    .default({}),
  device: z
    .object({
      type: z.enum(["MOBILE", "DESKTOP", "TABLET"]).optional(),
      browser: z.string().max(80).optional(),
      testingMinutes: z.number().int().min(0).max(600).optional(),
    })
    .default({}),
  ratings: z.object({
    easeOfSetup: ratingScale.optional(),
    easeOfNavigation: ratingScale.optional(),
    clarityOfInstructions: ratingScale.optional(),
    visualAppeal: ratingScale.optional(),
    childEngagement: ratingScale.optional(),
    motivationFactor: ratingScale.optional(),
    rewardEffectiveness: ratingScale.optional(),
    overall: ratingScale,
  }),
  openEnded: z
    .object({
      confused: z.string().max(2000).optional(),
      workedWell: z.string().max(2000).optional(),
      frustrating: z.string().max(2000).optional(),
      featureRequest: z.string().max(2000).optional(),
      bugs: z.string().max(2000).optional(),
      blockers: z.string().max(2000).optional(),
      whatBringsBack: z.string().max(2000).optional(),
      childWouldEnjoy: z.string().max(2000).optional(),
    })
    .default({}),
  recommend: z.enum(["YES", "NO", "MAYBE"]),
});

export type FeedbackPayload = z.infer<typeof feedbackPayloadSchema>;

export const submitFeedbackInputSchema = z.object({
  payload: feedbackPayloadSchema,
  userAgent: z.string().max(500).optional(),
});

// Light tag heuristics — admins can later override / curate. Cheap to compute,
// makes the inbox triage-able without an LLM pass.
function deriveTags(p: FeedbackPayload): string[] {
  const tags = new Set<string>();
  if (p.openEnded.bugs && p.openEnded.bugs.trim().length > 0) tags.add("bug");
  if (p.openEnded.featureRequest && p.openEnded.featureRequest.trim().length > 0) {
    tags.add("feature_request");
  }
  if (p.openEnded.confused && p.openEnded.confused.trim().length > 0) tags.add("confusion");
  if (p.openEnded.frustrating && p.openEnded.frustrating.trim().length > 0) tags.add("frustration");
  if (p.openEnded.workedWell && p.openEnded.workedWell.trim().length > 0) tags.add("praise");
  if (p.ratings.overall <= 2) tags.add("low_rating");
  if (p.ratings.overall >= 4) tags.add("high_rating");
  if (p.recommend === "NO") tags.add("would_not_recommend");
  return Array.from(tags);
}

const SUBMIT_COOLDOWN_MS = 30_000;

export async function submitFeedback(
  familyId: string,
  userId: string,
  raw: unknown,
): Promise<{ id: string; tags: string[] }> {
  const input = submitFeedbackInputSchema.parse(raw);
  const tags = deriveTags(input.payload);

  // Cheap spam/abuse guard: reject a second submission within 30s. Doesn't need
  // Redis — Prisma index on (userId, createdAt) makes the lookup fast enough.
  const last = await prisma.betaFeedback.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last && Date.now() - last.createdAt.getTime() < SUBMIT_COOLDOWN_MS) {
    throw HttpError.unprocessable("Please wait a moment before submitting again", "TOO_FAST");
  }

  const created = await prisma.betaFeedback.create({
    data: {
      familyId,
      userId,
      overallRating: input.payload.ratings.overall,
      recommend: input.payload.recommend,
      tags,
      payload: input.payload,
      userAgent: input.userAgent,
    },
  });

  // Mark checklist as submitted so the funnel signal is clean even if the user
  // skipped checklist toggles. Upsert keeps it idempotent across resubmissions.
  await prisma.betaChecklistProgress.upsert({
    where: { userId },
    create: { familyId, userId, completed: [], submittedAt: new Date() },
    update: { submittedAt: new Date() },
  });

  // Fire-and-forget admin alert. Doesn't block the submitter's response — if
  // notifying admins fails, the feedback is already persisted and the user
  // shouldn't see a partial failure for an internal-side-effect.
  setImmediate(() => {
    void notifyAdminsOfFeedback({
      feedbackId: created.id,
      submitterUserId: userId,
      submitterFamilyId: familyId,
      overallRating: input.payload.ratings.overall,
      recommend: input.payload.recommend,
      tags,
    }).catch((e) => console.error("[beta:notifyAdmins]", e));
  });

  return { id: created.id, tags };
}

interface AdminAlertOpts {
  feedbackId: string;
  submitterUserId: string;
  submitterFamilyId: string;
  overallRating: number;
  recommend: "YES" | "NO" | "MAYBE";
  tags: string[];
}

async function notifyAdminsOfFeedback(opts: AdminAlertOpts): Promise<void> {
  const [admins, submitter, submitterFamily] = await Promise.all([
    prisma.user.findMany({
      where: { isAdmin: true, isActive: true },
      select: { id: true, familyId: true },
    }),
    prisma.user.findUnique({ where: { id: opts.submitterUserId }, select: { name: true } }),
    prisma.family.findUnique({ where: { id: opts.submitterFamilyId }, select: { name: true } }),
  ]);
  if (admins.length === 0) return;

  const stars = "★".repeat(opts.overallRating) + "☆".repeat(5 - opts.overallRating);
  const tagSuffix = opts.tags.length > 0 ? ` · ${opts.tags.join(", ")}` : "";
  const title = `New beta feedback: ${stars} (${opts.recommend.toLowerCase()})`;
  const body = `From ${submitter?.name ?? "unknown"} · ${submitterFamily?.name ?? "unknown family"}${tagSuffix}`;

  await Promise.all(
    admins.map(async (admin) => {
      try {
        // In-app bell row scoped to the admin's own familyId (Notification has
        // a familyId NOT NULL). createNotification also fire-and-forget mirrors
        // to email when the admin's family.settings.emailNotifications is on —
        // so a single call delivers both channels.
        // Phase 2 multi-family: PARENT admins may have null User.familyId — fall
        // back to their first active membership family for the notification scope.
        let adminFamilyId = admin.familyId;
        if (!adminFamilyId) {
          const m = await prisma.familyMembership.findFirst({
            where: { userId: admin.id, status: "ACTIVE" },
            orderBy: { createdAt: "asc" },
            select: { familyId: true },
          });
          adminFamilyId = m?.familyId ?? null;
        }
        if (!adminFamilyId) return;
        await createNotification({
          familyId: adminFamilyId,
          userId: admin.id,
          kind: "BETA_FEEDBACK_RECEIVED",
          title,
          body,
          payload: {
            feedbackId: opts.feedbackId,
            submitterUserId: opts.submitterUserId,
            submitterFamilyId: opts.submitterFamilyId,
            overallRating: opts.overallRating,
            recommend: opts.recommend,
            tags: opts.tags,
          },
        });
      } catch (e) {
        console.error("[beta:notifyAdmin]", admin.id, e);
      }
    }),
  );
}

const checklistKeySchema = z.enum(checklistKeys);

export const updateChecklistInputSchema = z.object({
  completed: z.array(checklistKeySchema).max(checklistKeys.length),
});

export async function getChecklist(familyId: string, userId: string) {
  const row = await prisma.betaChecklistProgress.findUnique({ where: { userId } });
  if (!row) return { completed: [] as ChecklistKey[], submittedAt: null as string | null };
  return {
    completed: row.completed as ChecklistKey[],
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
  };
}

export async function updateChecklist(familyId: string, userId: string, raw: unknown) {
  const { completed } = updateChecklistInputSchema.parse(raw);
  // De-dup defensively — payload comes from the client.
  const uniq = Array.from(new Set(completed));
  await prisma.betaChecklistProgress.upsert({
    where: { userId },
    create: { familyId, userId, completed: uniq },
    update: { completed: uniq },
  });
  return { completed: uniq };
}

export { deriveTags };

async function hydrateUsersAndFamilies(userIds: string[], familyIds: string[]) {
  const [users, families] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: Array.from(new Set(userIds)) } },
      select: { id: true, name: true, email: true },
    }),
    prisma.family.findMany({
      where: { id: { in: Array.from(new Set(familyIds)) } },
      select: { id: true, name: true },
    }),
  ]);
  const uMap = new Map(users.map((u) => [u.id, u]));
  const fMap = new Map(families.map((f) => [f.id, f]));
  return { uMap, fMap };
}

export async function adminListFeedback(limit = 200) {
  const rows = await prisma.betaFeedback.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const { uMap, fMap } = await hydrateUsersAndFamilies(
    rows.map((r) => r.userId),
    rows.map((r) => r.familyId),
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    overallRating: r.overallRating,
    recommend: r.recommend,
    tags: r.tags,
    payload: r.payload,
    userAgent: r.userAgent,
    user: uMap.get(r.userId) ?? null,
    family: fMap.get(r.familyId) ?? null,
  }));
}

export async function adminListChecklistProgress() {
  const rows = await prisma.betaChecklistProgress.findMany({
    orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
  });
  const { uMap, fMap } = await hydrateUsersAndFamilies(
    rows.map((r) => r.userId),
    rows.map((r) => r.familyId),
  );
  return rows.map((r) => ({
    userId: r.userId,
    familyId: r.familyId,
    completed: r.completed as ChecklistKey[],
    submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
    user: uMap.get(r.userId) ?? null,
    family: fMap.get(r.familyId) ?? null,
  }));
}
