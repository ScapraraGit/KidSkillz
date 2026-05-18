FROM node:20-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

# Install workspace deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --filter @chorechampz/api... --frozen-lockfile=false

# Source
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

WORKDIR /app/apps/api
RUN pnpm prisma generate

EXPOSE 4000
# `migrate deploy` only applies committed migrations from prisma/migrations/. It
# never drops columns or tables on its own — unlike `db push --accept-data-loss`,
# which silently destructively syncs the DB to schema.prisma.
#
# Seed is gated on SEED_ON_STARTUP (default false). Even though the seed is
# idempotent, a buggy seed change shouldn't be able to crash a production deploy
# loop — set SEED_ON_STARTUP=true explicitly for first-deploy or local-dev only.
CMD ["sh", "-c", "pnpm prisma migrate deploy && { [ \"$SEED_ON_STARTUP\" = \"true\" ] && pnpm seed || echo '[startup] SEED_ON_STARTUP!=true, skipping seed'; } && pnpm start"]
