import zxcvbn from "zxcvbn";

const MIN_LENGTH = 8;
const MIN_SCORE = 3;

// Short list of egregiously bad passwords kept inline. zxcvbn already penalises
// common dictionary words, but explicit denylist cuts the most-attacked few
// down to "Choose a stronger password" without leaking entropy hints.
const DENYLIST = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "iloveyou",
  "abc12345",
  "letmein1",
  "welcome1",
  "monkey12",
  "dragon12",
  "baseball1",
  "football1",
  "trustno1",
  "sunshine1",
  "princess1",
  "admin1234",
  "changeme",
  "chorechampz",
]);

export interface PasswordCheckResult {
  ok: boolean;
  score: number; // 0..4
  reason?: string;
}

/**
 * Pure check. Use the same function on both register and reset paths so the
 * rules can't drift. `identifiers` lets zxcvbn penalize passwords derived from
 * the user's own email/name.
 */
export function checkPassword(password: string, identifiers: string[] = []): PasswordCheckResult {
  if (password.length < MIN_LENGTH) {
    return { ok: false, score: 0, reason: `Must be at least ${MIN_LENGTH} characters` };
  }
  if (DENYLIST.has(password.toLowerCase())) {
    return { ok: false, score: 0, reason: "That password is too common — pick another" };
  }
  const r = zxcvbn(password, identifiers.filter(Boolean));
  if (r.score < MIN_SCORE) {
    const hint =
      r.feedback.warning || r.feedback.suggestions[0] || "Try a longer or less predictable password";
    return { ok: false, score: r.score, reason: hint };
  }
  return { ok: true, score: r.score };
}
