import { HttpError } from "../errors.js";
import { ensureChildInFamily } from "./children.js";
import { postLedger } from "./ledger.js";

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
  return postLedger({
    familyId: input.familyId,
    childId: input.childId,
    amount: input.amount,
    kind,
    reason: input.reason.trim(),
    sourceType: "ADJUSTMENT",
    createdById: input.parentUserId,
  });
}
