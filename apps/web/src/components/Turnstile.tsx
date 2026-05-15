import { useEffect, useRef } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void },
      ) => string;
      reset: (id: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src^="${SCRIPT_SRC.split("?")[0]}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile widget. Calls `onVerify(token)` once the user solves the
 * challenge. Renders nothing if `VITE_TURNSTILE_SITEKEY` is unset (dev/local).
 */
export function Turnstile({ onVerify }: { onVerify: (token: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const idRef = useRef<string | null>(null);
  const sitekey = import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined;

  useEffect(() => {
    if (!sitekey || !ref.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        idRef.current = window.turnstile.render(ref.current, {
          sitekey,
          callback: (token) => onVerify(token),
        });
      })
      .catch((e) => console.error("[turnstile]", e));
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) {
        try {
          window.turnstile.reset(idRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [sitekey, onVerify]);

  if (!sitekey) return null;
  return <div ref={ref} className="my-2" />;
}

export function turnstileEnabled(): boolean {
  return !!import.meta.env.VITE_TURNSTILE_SITEKEY;
}
