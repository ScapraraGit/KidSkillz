import express from "express";
import "express-async-errors";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { Sentry } from "./lib/sentry.js";
import { errorHandler } from "./middleware/error.js";
import { metricsMiddleware, registry as metricsRegistry } from "./lib/metrics.js";
import { authRouter } from "./routes/auth.js";
import { familyRouter } from "./routes/family.js";
import { childrenRouter } from "./routes/children.js";
import { tasksRouter } from "./routes/tasks.js";
import { completionsRouter } from "./routes/completions.js";
import { initiativeRouter } from "./routes/initiative.js";
import { rewardsRouter } from "./routes/rewards.js";
import { redemptionsRouter } from "./routes/redemptions.js";
import { adjustmentsRouter } from "./routes/adjustments.js";
import { ledgerRouter } from "./routes/ledger.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { uploadsRouter } from "./routes/uploads.js";
import { invitationsRouter } from "./routes/invitations.js";
import { challengesRouter } from "./routes/challenges.js";
import { notificationsRouter } from "./routes/notifications.js";
import { taskCategoriesRouter } from "./routes/task-categories.js";
import { missedOpportunitiesRouter } from "./routes/missed-opportunities.js";
import { auditRouter } from "./routes/audit.js";
import { adminRouter } from "./routes/admin.js";

export interface CreateAppOptions {
  /**
   * Suppresses rate limiters + request logger so supertest doesn't see noise
   * or flaky 429s across rapid-fire test cases. Default false.
   */
  forTests?: boolean;
}

export function createApp(opts: CreateAppOptions = {}) {
  const app = express();
  app.set("trust proxy", 1);

  // CORS_ORIGIN accepts a single origin or a comma-separated list so the apex,
  // www subdomain, and Railway preview URL can all be allowed against the same
  // API deploy. Empty entries are dropped.
  const corsOrigins = env.CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const cspDirectives: Record<string, string[]> = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    // Tailwind ships utility classes at build time, but runtime style injections
    // (e.g. some headless-ui transitions) still need 'unsafe-inline'. Revisit
    // with a nonce/hashed-style strategy when bandwidth allows.
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
    connectSrc: ["'self'", ...corsOrigins].filter(Boolean) as string[],
    fontSrc: ["'self'", "data:"],
    frameSrc: ["'none'"],
    frameAncestors: ["'none'"],
    workerSrc: ["'self'", "blob:"],
    manifestSrc: ["'self'"],
    mediaSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    objectSrc: ["'none'"],
  };
  if (env.NODE_ENV === "production") {
    cspDirectives.upgradeInsecureRequests = [];
  }
  if (env.SENTRY_DSN) {
    try {
      const sentryHost = new URL(env.SENTRY_DSN).origin;
      cspDirectives.connectSrc.push(sentryHost);
    } catch {
      /* ignore malformed DSN */
    }
  }

  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: cspDirectives },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use(cors({ origin: corsOrigins, credentials: false }));
  app.use(express.json({ limit: "1mb" }));

  if (!opts.forTests) {
    app.use(
      pinoHttp({
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : { target: "pino-pretty", options: { colorize: true, singleLine: true } },
        genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID(),
        customProps: (req) => ({
          userId: (req as express.Request).auth?.sub,
          familyId: (req as express.Request).auth?.fid,
        }),
        serializers: {
          req(r: any) {
            return { id: r.id, method: r.method, url: r.url };
          },
          res(r: any) {
            return { statusCode: r.statusCode };
          },
        },
      }),
    );

    app.use(
      rateLimit({
        windowMs: 60_000,
        limit: 300,
        standardHeaders: "draft-7",
        legacyHeaders: false,
      }),
    );
  }

  const authLimiter = opts.forTests
    ? (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
    : rateLimit({
        windowMs: 15 * 60_000,
        limit: 30,
        standardHeaders: "draft-7",
        legacyHeaders: false,
      });

  // Metrics middleware first so we capture timings on every downstream handler.
  // /metrics endpoint itself is intentionally unauthenticated — Prometheus
  // scrapes it from a private network. In a public deploy, gate at the LB.
  if (!opts.forTests) app.use(metricsMiddleware);

  app.get("/metrics", async (_req, res) => {
    res.setHeader("Content-Type", metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  });

  app.get("/health", async (_req, res) => {
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, rej) => setTimeout(() => rej(new Error("db ping timeout")), 1500)),
      ]);
      res.json({ ok: true, db: "ok" });
    } catch (e) {
      res.status(503).json({ ok: false, db: "down", error: (e as Error).message });
    }
  });

  const v1 = express.Router();
  v1.use("/auth", authLimiter, authRouter);
  v1.use("/family", familyRouter);
  v1.use("/children", childrenRouter);
  v1.use("/tasks", tasksRouter);
  v1.use("/completions", completionsRouter);
  v1.use("/initiative", initiativeRouter);
  v1.use("/rewards", rewardsRouter);
  v1.use("/redemptions", redemptionsRouter);
  v1.use("/adjustments", adjustmentsRouter);
  v1.use("/ledger", ledgerRouter);
  v1.use("/dashboard", dashboardRouter);
  v1.use("/invitations", invitationsRouter);
  v1.use("/challenges", challengesRouter);
  v1.use("/notifications", notificationsRouter);
  v1.use("/task-categories", taskCategoriesRouter);
  v1.use("/missed-opportunities", missedOpportunitiesRouter);
  v1.use("/audit", auditRouter);
  v1.use("/admin", adminRouter);
  v1.use("/uploads", uploadsRouter);
  app.use("/v1", v1);

  app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));

  app.use((err: unknown, _req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (env.SENTRY_DSN) Sentry.captureException(err);
    next(err);
  });
  app.use(errorHandler);

  return app;
}
