import express from "express";
import "express-async-errors";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
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

const app = express();

// Express sits behind one proxy hop (Railway/etc). Required for express-rate-limit
// to read client IP from X-Forwarded-For and not log a security warning.
app.set("trust proxy", 1);

app.use(helmet({
  // Frontend served from a separate origin; loosen CSP to defaults rather than
  // setting a strict same-origin policy that would block legitimate API calls.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Global ceiling — protects every route from runaway clients.
app.use(rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
}));

// Auth surface gets a much stricter ceiling to slow credential-stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authLimiter, authRouter);
app.use("/family", familyRouter);
app.use("/children", childrenRouter);
app.use("/tasks", tasksRouter);
app.use("/completions", completionsRouter);
app.use("/initiative", initiativeRouter);
app.use("/rewards", rewardsRouter);
app.use("/redemptions", redemptionsRouter);
app.use("/adjustments", adjustmentsRouter);
app.use("/ledger", ledgerRouter);
app.use("/dashboard", dashboardRouter);
app.use("/uploads", uploadsRouter);
app.use("/invitations", invitationsRouter);
app.use("/challenges", challengesRouter);
app.use("/notifications", notificationsRouter);

app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
app.use(errorHandler);

const dbHost = (() => {
  try { return new URL(env.DATABASE_URL).host; } catch { return "INVALID_URL"; }
})();
console.log(`[chorechamps-api] DB host: ${dbHost}`);

app.listen(env.PORT, () => {
   
  console.log(`[chorechamps-api] listening on :${env.PORT}`);
});
