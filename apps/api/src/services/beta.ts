import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

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

  return { id: created.id, tags };
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
