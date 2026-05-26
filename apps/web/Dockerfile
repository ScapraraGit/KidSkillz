# --- build stage ---------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_BILLING_ENABLED=false
ENV VITE_BILLING_ENABLED=$VITE_BILLING_ENABLED
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ARG VITE_TURNSTILE_SITEKEY=
ENV VITE_TURNSTILE_SITEKEY=$VITE_TURNSTILE_SITEKEY
ARG VITE_SOCIAL_LOGIN_ENABLED=false
ENV VITE_SOCIAL_LOGIN_ENABLED=$VITE_SOCIAL_LOGIN_ENABLED
ARG VITE_GOOGLE_OAUTH_CLIENT_ID=
ENV VITE_GOOGLE_OAUTH_CLIENT_ID=$VITE_GOOGLE_OAUTH_CLIENT_ID

RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --filter @chorechampz/web... --frozen-lockfile=false

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

WORKDIR /app/apps/web
RUN pnpm build

# --- runtime stage -------------------------------------------------------
# `serve` is tiny (~5MB) and handles SPA fallback so React Router routes
# don't 404 on direct hit. Use Railway's $PORT at runtime.
FROM node:20-alpine AS runtime
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/apps/web/dist ./dist
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
