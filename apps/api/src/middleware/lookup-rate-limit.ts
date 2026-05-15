import rateLimit from "express-rate-limit";

// Hard ceiling on the unauth families/lookup endpoint to make enumeration
// uneconomical even when the global auth limiter is exhausted by other routes.
// 10 hits / minute / IP. Standard headers so clients can self-throttle.
export const lookupRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED", message: "Too many lookup attempts" },
});
