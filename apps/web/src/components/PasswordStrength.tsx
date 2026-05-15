import zxcvbn from "zxcvbn";

const LABELS = ["Very weak", "Weak", "Fair", "Good", "Strong"];
const COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-400",
  "bg-emerald-500",
  "bg-emerald-600",
];

/**
 * Inline strength meter. Renders nothing when `value` is empty so the form
 * stays compact until the user starts typing. `identifiers` (email, name)
 * lets zxcvbn punish passwords derived from the user's own data.
 */
export function PasswordStrength({
  value,
  identifiers = [],
}: {
  value: string;
  identifiers?: string[];
}) {
  if (!value) return null;
  const r = zxcvbn(value, identifiers.filter(Boolean));
  const score = r.score; // 0..4
  const filled = score + 1;
  return (
    <div className="text-xs space-y-1">
      <div className="flex gap-1 h-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`flex-1 rounded ${i < filled ? COLORS[score] : "bg-slate-200"}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-slate-500">
        <span>{LABELS[score]}</span>
        <span>
          {score >= 3 ? "Looks good." : r.feedback.warning || r.feedback.suggestions[0] || "Try a longer pass-phrase"}
        </span>
      </div>
    </div>
  );
}
