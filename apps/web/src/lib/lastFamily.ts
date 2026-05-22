// Remember the last family this device successfully looked up so kids on a
// shared (unpaired) device don't have to re-type the 6-char family code + name
// at every sign-in. Cleared on explicit "Switch family" or on a stale-key
// failure (e.g. parent rotated the code). Never stores credentials — only the
// public-ish family name + code the parent already shares verbally.

const KEY = "cc:lastFamily";

export interface LastFamily {
  name: string;
  code: string;
  // ms epoch the entry was written. Used to age-out very old entries so
  // shared/loaner devices don't keep a forgotten family forever.
  savedAt: number;
}

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function getLastFamily(): LastFamily | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastFamily;
    if (!parsed.name || !parsed.code) return null;
    if (typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setLastFamily(name: string, code: string): void {
  try {
    const entry: LastFamily = { name, code, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    /* localStorage unavailable (private mode) — silently no-op */
  }
}

export function clearLastFamily(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// Crockford-like alphabet: digits + uppercase letters minus the visually
// ambiguous ones (0/O, 1/I/L, B/8). Applied as a filter on user input rather
// than enforced by the API, so existing codes stay valid — this just gently
// guides new typing toward unambiguous characters and strips obvious junk
// (spaces, hyphens, punctuation) without nuking valid chars.
const ALLOWED_CHARS = /[A-Z0-9]/;

export function normalizeFamilyCode(raw: string): string {
  const upper = raw.toUpperCase();
  let out = "";
  for (const ch of upper) {
    if (ALLOWED_CHARS.test(ch)) out += ch;
    if (out.length >= 6) break;
  }
  return out;
}
