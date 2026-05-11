import express from "express";
import "express-async-errors";
import cors from "cors";
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

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
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

app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
app.use(errorHandler);

const dbHost = (() => {
  try { return new URL(env.DATABASE_URL).host; } catch { return "INVALID_URL"; }
})();
console.log(`[chorechamps-api] DB host: ${dbHost}`);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[chorechamps-api] listening on :${env.PORT}`);
});
