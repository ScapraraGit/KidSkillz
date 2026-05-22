import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { Button, Card, Field, PageHeader, inputCls } from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";

type Recommend = "YES" | "NO" | "MAYBE";
type DeviceType = "MOBILE" | "DESKTOP" | "TABLET";
type TesterRole = "PARENT" | "GUARDIAN" | "OTHER";

interface Ratings {
  easeOfSetup?: number;
  easeOfNavigation?: number;
  clarityOfInstructions?: number;
  visualAppeal?: number;
  childEngagement?: number;
  motivationFactor?: number;
  rewardEffectiveness?: number;
  overall?: number;
}

const RATING_QUESTIONS: { key: keyof Ratings; label: string; hint: string }[] = [
  { key: "easeOfSetup", label: "Ease of setup", hint: "Was creating a family + first kid painless?" },
  { key: "easeOfNavigation", label: "Ease of navigation", hint: "Could you find what you needed?" },
  { key: "clarityOfInstructions", label: "Clarity of instructions", hint: "Were labels and prompts clear?" },
  { key: "visualAppeal", label: "Visual appeal", hint: "Does it look like something you want to use?" },
  { key: "childEngagement", label: "Child engagement potential", hint: "Would your child stick with this?" },
  { key: "motivationFactor", label: "Motivation factor", hint: "Does the reward loop feel motivating?" },
  {
    key: "rewardEffectiveness",
    label: "Reward system effectiveness",
    hint: "Are credits + redemptions worthwhile?",
  },
  { key: "overall", label: "Overall experience", hint: "Required — your gut take, 1–5." },
];

const FACES = ["😖", "🙁", "😐", "🙂", "🤩"];

function RatingRow({
  label,
  hint,
  value,
  required,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | undefined;
  required?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-3 border-b border-slate-100 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800">
            {label}
            {required && <span className="text-rose-500 ml-1">*</span>}
          </div>
          <div className="text-xs text-slate-500">{hint}</div>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Tooltip key={n} label={`${n} — ${FACES[n - 1]}`}>
              <button
                type="button"
                onClick={() => onChange(n)}
                aria-label={`Rate ${n} of 5 for ${label}`}
                className={`h-9 w-9 rounded-full text-lg transition border ${
                  value === n
                    ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                {FACES[n - 1]}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}

interface OpenEnded {
  confused?: string;
  workedWell?: string;
  frustrating?: string;
  featureRequest?: string;
  bugs?: string;
  blockers?: string;
  whatBringsBack?: string;
  childWouldEnjoy?: string;
}

const OPEN_QUESTIONS: { key: keyof OpenEnded; label: string; placeholder: string }[] = [
  { key: "confused", label: "What confused you?", placeholder: "Anything you had to re-read or hunt for…" },
  { key: "workedWell", label: "What worked really well?", placeholder: "What clicked right away?" },
  { key: "frustrating", label: "What felt frustrating?", placeholder: "Slow, awkward, repetitive…" },
  {
    key: "featureRequest",
    label: "What feature would you most want added?",
    placeholder: "One thing — your top pick.",
  },
  {
    key: "bugs",
    label: "Did anything break or behave unexpectedly?",
    placeholder: "Bugs, weird empty states, errors…",
  },
  {
    key: "blockers",
    label: "What would stop you from using this regularly?",
    placeholder: "The dealbreakers.",
  },
  {
    key: "whatBringsBack",
    label: "What would make you come back tomorrow?",
    placeholder: "Reminders? A streak? Something else?",
  },
  {
    key: "childWouldEnjoy",
    label: "Would your child actually enjoy this? Why or why not?",
    placeholder: "Be candid.",
  },
];

export function BetaFeedback() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TesterRole | "">("");
  const [numChildren, setNumChildren] = useState<string>("");
  const [ageRanges, setAgeRanges] = useState<string[]>([]);
  const [device, setDevice] = useState<DeviceType | "">("");
  const [browser, setBrowser] = useState("");
  const [testingMinutes, setTestingMinutes] = useState<string>("");
  const [ratings, setRatings] = useState<Ratings>({});
  const [open, setOpen] = useState<OpenEnded>({});
  const [recommend, setRecommend] = useState<Recommend | "">("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (payload: unknown) =>
      api<{ id: string; tags: string[] }>("/beta/feedback", { method: "POST", body: { payload } }),
    onSuccess: () => setSubmitted(true),
    onError: (e: unknown) => {
      if (e instanceof ApiError) setFormError(e.message || "Couldn't submit — try again in a moment.");
      else setFormError("Something went wrong. Try again.");
    },
  });

  function toggleAge(range: string) {
    setAgeRanges((prev) => (prev.includes(range) ? prev.filter((r) => r !== range) : [...prev, range]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!ratings.overall) {
      setFormError("Please rate your overall experience (the last star row).");
      return;
    }
    if (!recommend) {
      setFormError("Please answer whether you'd recommend this to another parent.");
      return;
    }
    const payload = {
      testerInfo: {
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        role: role || undefined,
        numChildren: numChildren ? Number(numChildren) : undefined,
        childAgeRanges: ageRanges.length ? ageRanges : undefined,
      },
      device: {
        type: device || undefined,
        browser: browser.trim() || undefined,
        testingMinutes: testingMinutes ? Number(testingMinutes) : undefined,
      },
      ratings,
      openEnded: Object.fromEntries(
        Object.entries(open)
          .map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
          .filter(([, v]) => v && (v as string).length > 0),
      ),
      recommend,
    };
    submit.mutate(payload);
  }

  if (submitted) {
    return (
      <div>
        <PageHeader
          title="Thank you 🎉"
          subtitle="Your feedback is in — it really does shape what we build."
        />
        <Card>
          <p className="text-sm text-slate-700">
            We read every submission. If you spotted bugs or had questions, expect a reply at the email on
            your account.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <Tooltip label="Back to the parent dashboard">
              <span className="inline-flex">
                <Button onClick={() => nav("/parent")}>Back to ChoreChampz</Button>
              </span>
            </Tooltip>
            <Tooltip label="Add more feedback later if something else comes up">
              <span className="inline-flex">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSubmitted(false);
                    setRatings({});
                    setOpen({});
                    setRecommend("");
                  }}
                >
                  Submit more feedback
                </Button>
              </span>
            </Tooltip>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title="Share your feedback"
        subtitle="Skip anything you don't have an opinion on — only Overall + Recommend are required."
      />

      <Card>
        <h2 className="font-semibold text-slate-800 mb-3">A bit about you (optional)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              autoComplete="email"
            />
          </Field>
          <Field label="You're a…">
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as TesterRole)}>
              <option value="">Select…</option>
              <option value="PARENT">Parent</option>
              <option value="GUARDIAN">Guardian</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Number of children">
            <input
              type="number"
              min={0}
              max={20}
              className={inputCls}
              value={numChildren}
              onChange={(e) => setNumChildren(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3">
          <span className="block text-sm font-medium text-slate-700 mb-1">Child age ranges</span>
          <div className="flex flex-wrap gap-2">
            {["0–4", "5–7", "8–10", "11–13", "14–17", "18+"].map((r) => {
              const active = ageRanges.includes(r);
              return (
                <button
                  type="button"
                  key={r}
                  onClick={() => toggleAge(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    active
                      ? "bg-brand-50 text-brand-700 border-brand-300"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold text-slate-800 mb-3">Device + usage</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Device">
            <select
              className={inputCls}
              value={device}
              onChange={(e) => setDevice(e.target.value as DeviceType)}
            >
              <option value="">Select…</option>
              <option value="MOBILE">Mobile</option>
              <option value="DESKTOP">Desktop</option>
              <option value="TABLET">Tablet</option>
            </select>
          </Field>
          <Field label="Browser">
            <input
              className={inputCls}
              value={browser}
              onChange={(e) => setBrowser(e.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label="Testing time (minutes)">
            <input
              type="number"
              min={0}
              max={600}
              className={inputCls}
              value={testingMinutes}
              onChange={(e) => setTestingMinutes(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold text-slate-800 mb-1">How was the experience?</h2>
        <p className="text-xs text-slate-500 mb-2">Tap a face to rate. 1 = rough, 5 = great.</p>
        <div>
          {RATING_QUESTIONS.map((q) => (
            <RatingRow
              key={q.key}
              label={q.label}
              hint={q.hint}
              value={ratings[q.key]}
              required={q.key === "overall"}
              onChange={(v) => setRatings((r) => ({ ...r, [q.key]: v }))}
            />
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold text-slate-800 mb-3">In your own words</h2>
        <div className="grid gap-3">
          {OPEN_QUESTIONS.map((q) => (
            <Field key={q.key} label={q.label} hint={`${(open[q.key] ?? "").length}/2000`}>
              <textarea
                className={inputCls}
                rows={3}
                maxLength={2000}
                placeholder={q.placeholder}
                value={open[q.key] ?? ""}
                onChange={(e) => setOpen((o) => ({ ...o, [q.key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold text-slate-800 mb-3">
          Would you recommend this to another parent? <span className="text-rose-500">*</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {(["YES", "MAYBE", "NO"] as Recommend[]).map((opt) => (
            <button
              type="button"
              key={opt}
              onClick={() => setRecommend(opt)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                recommend === opt
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {opt === "YES" ? "Yes" : opt === "MAYBE" ? "Maybe" : "No"}
            </button>
          ))}
        </div>
      </Card>

      {formError && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {formError}
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link to="/beta/checklist" className="text-sm text-brand-600 underline">
          ← Back to checklist
        </Link>
        <Tooltip label="Submit your feedback">
          <span className="inline-flex">
            <Button type="submit" size="lg" disabled={submit.isPending}>
              {submit.isPending ? "Submitting…" : "Submit feedback"}
            </Button>
          </span>
        </Tooltip>
      </div>
    </form>
  );
}
