import client from "prom-client";
import type { NextFunction, Request, Response } from "express";

// Single shared registry. prom-client provides default Node/process metrics
// (event loop lag, GC, RSS, etc) — we add domain-specific HTTP histograms on
// top. Exposed at /metrics for Prometheus scrape.
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "chorechampz_" });

export const httpRequestDuration = new client.Histogram({
  name: "chorechampz_http_request_duration_seconds",
  help: "HTTP request latency by route + status",
  // Latency-bucket spread tuned for a typical CRUD JSON API. 50ms..5s range
  // surfaces both fast reads and slow approvals without bucket sprawl.
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

export const httpRequestTotal = new client.Counter({
  name: "chorechampz_http_requests_total",
  help: "HTTP request count by route + status",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

/**
 * Express middleware. Captures duration + count for every request, labeling by
 * the matched route pattern (not the raw URL) so cardinality stays bounded.
 * Falls back to `unknown` for 404s where no route matched.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const route = req.route?.path
      ? `${req.baseUrl ?? ""}${req.route.path}`
      : req.baseUrl || "unknown";
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method: req.method,
      route,
      status: String(res.statusCode),
    };
    httpRequestDuration.observe(labels, seconds);
    httpRequestTotal.inc(labels);
  });
  next();
}
