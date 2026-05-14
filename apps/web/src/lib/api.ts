import { useAuth } from "../store/auth";

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

export async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const token = useAuth.getState().token;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${API_V1}${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.formData ? "POST" : "GET"),
    headers,
    body,
    signal: opts.signal,
  });
  const text = await res.text();
  const json = text ? safeJSON(text) : null;
  if (!res.ok) {
    if (res.status === 401) useAuth.getState().logout();
    const err = json && typeof json === "object" ? (json as any) : {};
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
  return `${API_V1}/uploads/${key}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}
