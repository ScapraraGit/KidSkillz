import { useAuth } from "../store/auth";
import { getDeviceToken } from "./deviceToken";

export const API_URL = (import.meta.env.VITE_API_URL as string) || "http://localhost:4000";

// All business endpoints (including uploads) live under /v1 on the server. /health is
// the only unversioned route, used by load-balancer probes.
const API_V1 = `${API_URL}/v1`;

export class ApiError extends Error {
  status: number;
  code: string;
  data?: unknown;
  constructor(status: number, code: string, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

interface ApiOpts {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

// Single-flight refresh so a flurry of parallel 401s only hits /auth/refresh once.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const rt = useAuth.getState().refreshToken;
  if (!rt) return null;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_V1}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        useAuth.getState().logout();
        return null;
      }
      const data = (await res.json()) as { token: string; refreshToken: string };
      useAuth.getState().setAccessToken(data.token, data.refreshToken);
      return data.token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function performFetch(path: string, opts: ApiOpts, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const deviceToken = getDeviceToken();
  if (deviceToken) headers["x-device-token"] = deviceToken;
  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetch(`${API_V1}${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.formData ? "POST" : "GET"),
    headers,
    body,
    signal: opts.signal,
  });
}

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  // Don't try to refresh on the refresh endpoint itself — recursion guard.
  const isRefreshCall = path === "/auth/refresh";
  let accessToken = useAuth.getState().token;
  let res = await performFetch(path, opts, accessToken);

  if (res.status === 401 && !isRefreshCall) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      accessToken = newAccess;
      res = await performFetch(path, opts, accessToken);
    }
  }

  const text = await res.text();
  const json = text ? safeJSON(text) : null;
  if (!res.ok) {
    if (res.status === 401) useAuth.getState().logout();
    const err = json && typeof json === "object" ? (json as any) : {};
    // 402 = billing gate. Surface via a window event so an UpgradePrompt
    // component (mounted in AppLayout) can show a modal regardless of which
    // page made the call.
    if (res.status === 402 && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("billing:required", {
          detail: { code: err.error ?? "BILLING_REQUIRED", message: err.message ?? "Payment required" },
        }),
      );
    }
    throw new ApiError(res.status, err.error ?? "ERROR", err.message ?? res.statusText, err);
  }
  return json as T;
}

function safeJSON(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function uploadProof(file: File): Promise<{ key: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return api<{ key: string }>("/uploads/proof", { method: "POST", formData: fd });
}

export function uploadUrl(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  const token = useAuth.getState().token;
  // Keys are `fam_<id>/<uuid>.<ext>` — encode each segment but keep the slash so
  // the multi-segment Express route matches without losing path traversal protections.
  const safeKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${API_V1}/uploads/${safeKey}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}
