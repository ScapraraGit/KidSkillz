/**
 * Pure helper: given a credit pot, a deduplicated list of recipient childIds, and the
 * team-split mode, return per-recipient credit amounts. EVEN ceiling-divides so the
 * total awarded is always >= base credits (rounding favors kids). FULL awards the full
 * base to every recipient.
 */
export function computeTeamSplit(
  credits: number,
  childIds: string[],
  mode: "EVEN" | "FULL",
): { childId: string; amount: number }[] {
  if (childIds.length === 0) return [];
  if (mode === "FULL") return childIds.map((id) => ({ childId: id, amount: credits }));
  const each = Math.ceil(credits / childIds.length);
  return childIds.map((id) => ({ childId: id, amount: each }));
}
