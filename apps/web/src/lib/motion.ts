// Centralized check for the user's "reduce motion" OS-level preference. Sound is
// not gated here — only purely-decorative motion (confetti, bounce, pop). Returns
// true when the user has asked for reduced motion or when running outside a
// browser (SSR / tests).
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
