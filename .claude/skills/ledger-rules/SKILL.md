---
name: ledger-rules
description: Authoritative rules for posting, reading, and changing credit balances in ChoreChampz. Use whenever editing code that touches LedgerEntry, balances, completions approval, redemption approval, adjustments, or initiative bonuses.
---

# ChoreChampz ledger rules

The `LedgerEntry` table is the single source of truth for child credit balances. There is no mutable balance column anywhere.

## Invariants

1. **Append-only.** Never `update` or `delete` a `LedgerEntry`. Corrections post a new compensating row with `kind = ADJUSTMENT` and `reason` explaining why.
2. **All writes go through `postLedger()`** in [apps/api/src/services/ledger.ts](apps/api/src/services/ledger.ts). Direct `prisma.ledgerEntry.create(...)` outside that file is a bug.
3. **Balance = `SUM(amount)`** via `getBalance(childId)`. Do not denormalize.
4. **Negative posts** check `family.allowNegativeBalance`. If off and balance would go negative, throw `INSUFFICIENT_CREDITS`. This is enforced inside `postLedger()` — don't reimplement it.
5. **Zero-amount posts** are forbidden.
6. **Transactional.** Any approval flow that posts a ledger entry as part of changing a domain row's status must wrap both in `prisma.$transaction`.
7. **Idempotency.** Status guards (`if (x.status !== "PENDING") throw conflict`) prevent re-approval double-posts. Always check status before posting.
8. **Audit trail.** Set `sourceType` and `sourceId` on every ledger row whose origin is a domain row. Set `createdById` to the acting parent's user id (or `null` for system).

## Allowed `LedgerKind` values per flow

| Flow                              | Kind                     | Amount sign                   |
| --------------------------------- | ------------------------ | ----------------------------- |
| Approved task completion          | `TASK`                   | positive                      |
| Planned-initiative approval bonus | `INITIATIVE_BONUS`       | positive                      |
| Write-in initiative (no bonus)    | `TASK` (or `INITIATIVE`) | positive                      |
| Reward redemption approval        | `REDEMPTION`             | negative                      |
| Parent adjustment                 | `ADJUSTMENT`             | signed                        |
| Correction / reversal             | `ADJUSTMENT`             | signed (opposite of original) |

## Code patterns

**Posting credit on approval (canonical):**

```ts
await prisma.$transaction(async (tx) => {
  const upd = await tx.<row>.update({
    where: { id }, data: { status: "APPROVED", ... },
  });
  if (credits > 0) {
    await postLedger({
      tx, familyId, childId, amount: credits, kind: "TASK",
      reason: `Task: ${task.title}`,
      sourceType: "TASK_COMPLETION", sourceId: id,
      createdById: parentUserId,
    });
  }
  return upd;
});
```

**Reading balance:**

```ts
const balance = await getBalance(childId);
```

Never sum ledger entries inline — always go through `getBalance` or `prisma.ledgerEntry.aggregate` with explicit `_sum`.

## Red flags

- A new `balance` column in any model → reject.
- `prisma.ledgerEntry.update` / `delete` → reject.
- Approval flow that updates status outside `$transaction` and posts ledger separately → fix.
- Negative `postLedger` call without checking the kind makes sense → fix.
- New domain row that affects balance but does not post a ledger entry → bug.

## Tests

Add cases for: zero-amount rejection, negative-balance enforcement with `allowNegativeBalance` on/off, idempotent re-approval, transactional rollback when ledger fails. Pure-logic tests over `awards.ts` are already in [apps/api/src/services/**tests**/awards.test.ts](apps/api/src/services/__tests__/awards.test.ts).
