# Migration discipline

Prisma's migration model is **forward-only**: it does not generate down-scripts, and `prisma migrate reset` drops the schema. In production, recovery from a bad migration is a new forward migration, not a rollback.

This doc documents how we deploy, how we recover, and where the sharp edges are.

## Forward-only mental model

Every change to `apps/api/prisma/schema.prisma` becomes a timestamped folder under `apps/api/prisma/migrations/` containing the SQL Prisma generated (plus manual edits when needed). Production runs `prisma migrate deploy` — apply pending migrations in order. There is **no rollback command**.

Implications:

1. Treat every prod-bound migration as if you could not undo it. Review SQL before merging.
2. Schema changes ship in two phases when the change is destructive or risky (see "Two-phase pattern" below).
3. Manual SQL edits to a migration are fine before applying to prod, never after.

## Local workflow

```bash
# 1. Edit schema.prisma
# 2. Generate migration (creates folder + SQL, applies to local DB)
pnpm --filter @chorechamps/api prisma migrate dev --name <short_snake_case>

# 3. Inspect the generated SQL — Prisma occasionally generates inefficient or
#    surprising DDL (especially for ENUM changes and nullability). Edit if needed
#    BEFORE committing.
$EDITOR apps/api/prisma/migrations/<timestamp>_<name>/migration.sql

# 4. Verify against a fresh DB
pnpm --filter @chorechamps/api prisma migrate reset --force
pnpm --filter @chorechamps/api seed
```

## Production deploy

CI runs `prisma validate` on every PR. Deploy applies migrations with `prisma migrate deploy`. If the deploy fails partway through, Prisma marks the partially-applied migration as failed and refuses to proceed. Recovery:

1. Inspect `_prisma_migrations` table to see which migration is stuck.
2. Either fix it forward (write a new migration that completes the work) or, if safe, `prisma migrate resolve --applied <name>` to mark it complete after manual SQL.
3. Never delete a migration folder once it's been applied to any environment.

## Two-phase pattern for destructive changes

Renaming or dropping a column safely takes two deploys.

### Drop a column

| Deploy | Migration                                                       | App behavior                            |
| ------ | --------------------------------------------------------------- | --------------------------------------- |
| 1      | Stop reading and writing the column in app code                 | Existing column ignored; data preserved |
| 2      | `ALTER TABLE ... DROP COLUMN ...`                               | Column is gone                          |

Skipping deploy 1 means a brief window where prod code expects the column but the DB has dropped it → 500s.

### Rename a column

| Deploy | Migration                                                              | App behavior                                 |
| ------ | ---------------------------------------------------------------------- | -------------------------------------------- |
| 1      | `ALTER TABLE t ADD COLUMN new_name <type>; UPDATE t SET new_name = old_name;` | App writes to both columns; reads from `old_name` |
| 2      | App reads from `new_name`; backfill any missed rows                    | Both columns in sync                         |
| 3      | `ALTER TABLE t DROP COLUMN old_name;`                                  | Done                                         |

Use Prisma's `@map("old_name")` to rename in the schema without an actual DDL rename, then drop the alias later.

### Make a NOT NULL column nullable (or vice versa)

Nullable → NOT NULL requires a backfill, then a constraint addition. Always staged:

```sql
-- Deploy 1
UPDATE "Task" SET "categoryId" = '<default>' WHERE "categoryId" IS NULL;
-- Deploy 2
ALTER TABLE "Task" ALTER COLUMN "categoryId" SET NOT NULL;
```

Doing both in one migration on a large table holds an exclusive lock long enough to take prod down.

## Bad migration recovery

If a migration corrupted data or has a schema you can't keep:

1. **Stop traffic** (or put app in maintenance mode).
2. **Use Neon PITR** to restore the database to just before the migration applied. See [backup.md](./backup.md).
3. **Revert the offending migration** in git (delete the folder, revert the schema change).
4. **Write a corrected forward migration** and redeploy.
5. **Replay any data writes that happened post-PITR-target.** Read them from logs or the application's audit trail before discarding the failed state.

There is no "down migration" Prisma can generate. Recovery is always via PITR + a new forward migration.

## Manual SQL in migrations

You can hand-write SQL in a migration when Prisma can't express what you want:

- Partial unique indexes (Postgres `WHERE` clause)
- `CONCURRENTLY` index builds (cannot run inside a transaction; split into its own migration file)
- Data backfills via `INSERT INTO ... SELECT FROM ...`
- Trigger / function definitions

Examples in this repo:

- `20260513210000_taskjoin_partial_unique` — partial unique indexes that Prisma's `@@unique` does not generate.
- `20260513200000_tier3_features` — backfill of `ChildSavingsGoal` from the legacy `savingsGoalRewardId` column.

When you hand-edit, remember to comment the **intent** in the SQL. Future-you will thank you.

## What to commit

| File / change                                          | Commit? |
| ------------------------------------------------------ | ------- |
| `apps/api/prisma/schema.prisma`                        | ✅       |
| `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql` | ✅       |
| `apps/api/prisma/migrations/migration_lock.toml`       | ✅       |
| Anything under `apps/api/prisma/migrations/.dev/`      | ❌       |
| Generated Prisma client (`node_modules/.prisma`)       | ❌ (ignored) |

## Never do

- `prisma migrate reset` against a non-local database.
- Edit a migration file after it has been applied to any shared environment.
- Apply a migration directly with `psql` and not via `prisma migrate deploy` (skips the bookkeeping table).
- Delete a migration folder. If it's bad, write a forward fix.
