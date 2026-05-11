FROM node:20-alpine
WORKDIR /app

ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --filter @chorechamps/web... --frozen-lockfile=false

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "dev"]
