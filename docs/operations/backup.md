# Backup + restore

ChoreChamps stores authoritative state in Postgres (Neon in production). Restore-readiness rests on three pieces: Neon Point-in-Time Recovery, schema migrations replayed via `prisma migrate deploy`, and proof photos backed up from the storage volume.

## What's stored where

| Asset                             | Location                                         | Restoration source       |
| --------------------------------- | ------------------------------------------------ | ------------------------ |
| All relational data (Family, User, LedgerEntry, etc.) | Postgres (Neon)                                 | Neon PITR / branch       |
| Proof photos                      | `apps/api/data/uploads` (Docker) or S3 (planned) | Object-store backup      |
| Migration history                 | `apps/api/prisma/migrations/*` (in git)          | git                      |
| Family settings JSON              | `Family.settings` column                         | Postgres                 |
| Audit trail                       | `AuditEvent` + `LedgerEntry` (append-only)       | Postgres                 |
| Secrets (JWT signing, Resend key) | `.env` / hosting provider                        | Your secret manager      |

Everything except the photos and secrets is plain Postgres, so restoring the database recovers the application.

## Neon PITR

Neon retains write-ahead logs for the lifetime of your plan's history window. Recovery is via the **Branches** feature.

### Restore drill (do this once)

1. **Pick a target timestamp.** Use one within the last hour for the drill; production restores target the timestamp just before whatever destroyed the data.
2. **Create a recovery branch.** Neon UI → Branches → New branch → "Restored from" → timestamp.
3. **Copy the recovery connection string.** Neon presents a new `DATABASE_URL` for the branch. It is read-write by default.
4. **Validate against application code.**
   ```bash
   DATABASE_URL='<recovery-url>' pnpm --filter @chorechamps/api exec prisma db pull --print
   # Inspect: tables match HEAD schema, no surprise drift.
   ```
5. **Spot-check tenant isolation.** Run a couple of `SELECT count(*) FROM "LedgerEntry" WHERE "familyId" = '<known-id>';` against the recovery branch — counts should match expectations for that point in time.
6. **Promote when ready.** Either repoint the app at the recovery branch (Neon → Branches → Make primary) or `pg_dump` from recovery and `pg_restore` into the original primary.
7. **Tear down practice branches.** Neon bills per branch storage delta; delete the drill branch when done.

### Common scenarios

| Scenario                                        | First move                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Accidental destructive query (`DELETE`, `DROP`) | Restore branch 1 minute before incident; copy missing rows back.                        |
| Compromised credential, want clean state        | Restore branch just before suspected breach; rotate `JWT_SECRET` (invalidates all sessions). |
| Bad migration deployed to prod                  | Restore branch _before_ migration; redeploy with corrected forward-only migration (see [migrations.md](./migrations.md)). |
| Schema fine but ledger corrupted by a bug       | Restore branch, then export only `LedgerEntry` and `LedgerKind`-affected tables; replay into primary. |

## Proof photos

`StorageProvider.LocalStorage` writes to a Docker volume; this is **not** backed up out of the box.

- For dev / Docker Compose: photos vanish when you `docker compose down -v`. Acceptable.
- For prod: switch to S3 (or equivalent) by implementing a new `StorageProvider` class. Enable bucket versioning + lifecycle to retain deleted photos for at least the family's `photoRetentionDays` window. The `purgeExpiredPhotos` job deletes the application-side key, not the underlying versioned object.

## Audit trail and ledger

`LedgerEntry` is append-only by convention. `postLedger()` is the only writer. To prove the ledger is intact after a restore:

```sql
-- Per-child balance from the ledger
SELECT "childId", SUM("amount") AS balance FROM "LedgerEntry" GROUP BY "childId";

-- Daily ledger volume (looks for gaps where backups were missed)
SELECT date_trunc('day', "createdAt") AS day, COUNT(*) FROM "LedgerEntry" GROUP BY 1 ORDER BY 1;
```

`AuditEvent` records actor-driven mutations to the family. Useful as a sanity check after restore — if the audit trail jumps from "yesterday" to "tomorrow" you've restored to the wrong point.

## Drills

Run a restore drill **quarterly**. Record:

- Date of drill
- Source timestamp targeted
- Time-to-validate-query (TTV)
- Anything that surprised you

Keep the record in `docs/operations/backup-drills.md` (create as needed).

## What you do NOT need to back up separately

- `apps/api/data/uploads/.thumbnail-cache` (regeneratable)
- `node_modules`, `.next`, build artifacts
- Notification rows (rebuilt from in-app events)
- Migration files (lives in git)
