import { HttpError } from "../errors.js";
import { ensureChildInFamily } from "./children.js";
import { postLedger } from "./ledger.js";
import { evaluateLevelUp } from "./levels.js";
import { evaluateChallenges } from "./challenges.js";

export async function postAdjustment(input: {
  familyId: string;
  parentUserId: string;
  childId: string;
  amount: number; // signed
  reason: string;
}) {
  await ensureChildInFamily(input.familyId, input.childId);
  if (!input.reason.trim()) throw HttpError.badRequest("Reason is required");
  if (input.amount === 0) throw HttpError.badRequest("Amount cannot be zero");

  const kind = input.amount > 0 ? "ADJUSTMENT_POSITIVE" : "ADJUSTMENT_NEGATIVE";
  const entry = await postLedger({
    familyId: input.familyId,
    childId: input.childId,
    amount: input.amount,
    kind,
    reason: input.reason.trim(),
    sourceType: "ADJUSTMENT",
    createdById: input.parentUserId,
  });
  if (input.amount > 0) {
    await evaluateChallenges(
      { familyId: input.familyId, childId: input.childId, parentUserId: input.parentUserId },
      { type: "ADJUSTMENT", credits: input.amount },
    );
    await evaluateLevelUp({
      familyId: input.familyId,
      childId: input.childId,
      createdById: input.parentUserId,
    });
  }
  return entry;
}
