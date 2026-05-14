import { initSentry, Sentry } from "./lib/sentry.js";
initSentry();

import express from "express";
import "express-async-errors";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { errorHandler } from "./middleware/error.js";
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

const app = express();

// Express sits behind one proxy hop (Railway/etc). Required for express-rate-limit
// to read client IP from X-Forwarded-For and not log a security warning.
app.set("trust proxy", 1);

app.use(
  helmet({
    // Frontend served from a separate origin; loosen CSP to defaults rather than
    // setting a strict same-origin policy that would block legitimate API calls.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(
  pinoHttp({
    // Pretty-print only in dev; production logs are line-delimited JSON for ingestion.
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : { target: "pino-pretty", options: { colorize: true, singleLine: true } },
    genReqId: (req) => (req.headers["x-request-id"] as string) || randomUUID(),
    customProps: (req) => ({
      userId: (req as express.Request).auth?.sub,
      familyId: (req as express.Request).auth?.fid,
    }),
    // Drop noisy headers + bodies from logs by default.
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

// Global ceiling — protects every route from runaway clients.
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);

// Auth surface gets a much stricter ceiling to slow credential-stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// /health stays unversioned (load-balancer-friendly) and runs an actual DB ping so a
// drained Postgres or saturated pool flips the LB to 503 instead of serving stale
// traffic. Timeout via Promise.race keeps a hung connection from blocking the probe.
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

// All business endpoints live under /v1. Future breaking changes ship as /v2 alongside
// without retiring v1. /health and /uploads (which embeds tokens in URLs that may have
// been issued before versioning) stay unversioned.
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
v1.use("/uploads", uploadsRouter);
app.use("/v1", v1);

app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));

// Sentry capture before the JSON error handler. When DSN is unset the SDK is a no-op.
app.use((err: unknown, _req: express.Request, _res: express.Response, next: express.NextFunction) => {
  if (env.SENTRY_DSN) Sentry.captureException(err);
  next(err);
});
app.use(errorHandler);

const dbHost = (() => {
  try {
    return new URL(env.DATABASE_URL).host;
  } catch {
    return "INVALID_URL";
  }
})();
console.log(`[chorechampz-api] DB host: ${dbHost}`);

app.listen(env.PORT, () => {
  console.log(`[chorechampz-api] listening on :${env.PORT}`);
});
