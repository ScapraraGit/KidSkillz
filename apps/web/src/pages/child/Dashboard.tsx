import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, uploadProof } from "../../lib/api";
import { Badge, Button, Card, CreditChip, EmptyState, Field, PageHeader, ProgressBar, inputCls } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { KidAvatar } from "../../components/KidAvatar";
import { AvatarStudio } from "../../components/AvatarStudio";
import { Tooltip } from "../../components/Tooltip";
import { useAuth } from "../../store/auth";
import type { ChildDashboardDTO, TodayTaskOccurrenceDTO } from "@chorechamps/shared";

export function ChildDashboard() {
  const dash = useQuery({
    queryKey: ["dashboard", "child"],
    queryFn: () => api<ChildDashboardDTO>("/dashboard/child"),
  });

  const [completing, setCompleting] = useState<TodayTaskOccurrenceDTO | null>(null);
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();

  if (dash.isLoading || !dash.data) return <div>Loading…</div>;
  const d = dash.data;
  const greeting = greet();

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Tooltip label="Design your avatar">
              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                className="relative shrink-0 rounded-full hover:ring-2 hover:ring-brand-200 transition"
              >
                <KidAvatar name={d.child.name} color={d.child.avatarColor} config={d.child.avatarConfig} size={56} />
                <span className="absolute -bottom-1 -right-1 bg-white rounded-full border border-slate-200 text-sm leading-none px-1 shadow-sm">✏️</span>
              </button>
            </Tooltip>
            <span>{greeting}, {d.child.name}!</span>
          </span>
        }
        subtitle={d.child.redemptionPaused ? "Heads up: redemption is paused right now." : "Earn credits and crush your day."}
      />

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          id="tile-balance"
          className="bg-gradient-to-br from-brand-500 to-indigo-700 text-white border-0"
          info={{
            title: "Balance",
            body: "Credits you have available to spend on rewards. Earn more by finishing tasks and getting initiative approved.",
            tone: "onDark",
          }}
        >
          <div className="text-sm opacity-80">Balance</div>
          <div className="text-5xl font-bold">{d.child.balance}</div>
          <div className="text-sm opacity-80 mt-1">credits</div>
        </Card>
        <Card
          id="tile-week"
          info={{
            title: "This week",
            body: "Credits earned (green) and spent (red) since Sunday in your family's timezone. Resets each Sunday.",
          }}
        >
          <div className="text-xs text-slate-500">This week</div>
          <div className="text-2xl font-bold mt-1">+{d.stats.weekEarned}</div>
          <div className="text-xs text-slate-500">earned</div>
          <div className="text-sm text-rose-700 mt-2">-{d.stats.weekSpent} spent</div>
        </Card>
        <Card
          id="tile-streak"
          info={{
            title: "Streak",
            body: "Consecutive days you've finished at least one task. Hit 3 in a row to earn the 'On a Roll' badge. Today won't break the streak until midnight.",
          }}
        >
          <div className="text-xs text-slate-500">Streak</div>
          <div className="text-2xl font-bold mt-1">🔥 {d.stats.streakDays}</div>
          <div className="text-xs text-slate-500">{d.stats.streakDays === 1 ? "day" : "days"} in a row</div>
        </Card>
        <Card
          id="tile-initiative"
          info={{
            title: "Initiative",
            body: "5 points for each above-and-beyond task a parent approved in the last 30 days. Get 3 approvals for the 'Initiative Star' badge.",
          }}
        >
          <div className="text-xs text-slate-500">Initiative</div>
          <div className="text-2xl font-bold mt-1">🪙 {d.stats.initiativeScore}</div>
          <div className="text-xs text-slate-500">{d.stats.aboveAndBeyondCount} above-and-beyond</div>
        </Card>
      </section>

      {d.stats.badges.length > 0 && (
        <Card
          id="tile-badges"
          info={{
            title: "Badges",
            body: "Earned automatically as you hit milestones. Saver = 50+ credits saved. On a Roll = 3-day streak. Initiative Star = 3 approvals in 30 days. Above & Beyond = 5 lifetime initiative approvals.",
          }}
        >
          <div className="text-sm font-medium mb-2">Badges</div>
          <div className="flex flex-wrap gap-2">
            {d.stats.badges.map((b) => (
              <Badge key={b} color="amber">🏅 {b}</Badge>
            ))}
          </div>
        </Card>
      )}

      <Card
        id="tile-today-tasks"
        info={{
          title: "Today's tasks",
          body: "Chores scheduled for today. Tap 'Mark done' to submit; some need a photo or notes as proof. A parent reviews before credits are awarded.",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Today's tasks</h3>
          <Link to="/me/initiative" className="text-sm text-brand-700 font-medium">+ Suggest initiative</Link>
        </div>
        {d.todayTasks.length === 0 ? (
          <EmptyState title="Nothing scheduled — enjoy the day!" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.todayTasks.map((occ) => (
              <li key={`${occ.task.id}-${occ.occurrenceDate}`} className="py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[150px]">
                  <div className="font-medium">{occ.task.title}</div>
                  {occ.task.description && <div className="text-xs text-slate-500">{occ.task.description}</div>}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {occ.task.dueByTime && (
                      <Badge color="brand">Due by {formatTimeOfDay(occ.task.dueByTime)}</Badge>
                    )}
                    {occ.task.kind === "ONE_TIME" && occ.task.dueAt && (
                      <Badge color="brand">Due {new Date(occ.task.dueAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Badge>
                    )}
                    {occ.task.proofRequirement !== "NONE" && occ.task.proofRequirement !== "NOTES_OPTIONAL" && (
                      <Badge color="amber">Proof: {occ.task.proofRequirement.replace(/_/g, " ").toLowerCase()}</Badge>
                    )}
                  </div>
                </div>
                <CreditChip amount={occ.task.creditValue} />
                {occ.completionStatus === "PENDING" ? (
                  <Badge color="amber">Awaiting approval</Badge>
                ) : occ.completionStatus === "APPROVED" ? (
                  <Badge color="emerald">✓ Done</Badge>
                ) : (
                  <Tooltip label={d.child.earningPaused ? "Earning is paused — ask a parent" : "Submit this task for parent approval"}>
                    <Button size="sm" onClick={() => setCompleting(occ)} disabled={d.child.earningPaused}>
                      Mark done
                    </Button>
                  </Tooltip>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold mb-3">Recent activity</h3>
        {d.recentLedger.length === 0 ? (
          <EmptyState title="Nothing yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.recentLedger.slice(0, 8).map((e) => (
              <li key={e.id} className="py-2 flex items-center gap-3 text-sm">
                <span className="flex-1 text-slate-700">{e.reason}</span>
                <CreditChip amount={e.amount} />
                <span className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {completing && (
        <CompleteModal
          occurrence={completing}
          onClose={() => setCompleting(null)}
          onSubmitted={(credits) => {
            setCompleting(null);
            setCelebrate(credits);
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            setTimeout(() => setCelebrate(null), 2000);
          }}
        />
      )}

      {celebrate !== null && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl px-10 py-8 text-center animate-pop">
            <div className="text-5xl">🎉</div>
            <div className="text-xl font-bold mt-2">Submitted!</div>
            <div className="text-sm text-slate-500">A grown-up will review it soon.</div>
          </div>
        </div>
      )}

      {studioOpen && user && (
        <AvatarStudio user={user} onClose={() => setStudioOpen(false)} />
      )}
    </div>
  );
}

function CompleteModal({
  occurrence,
  onClose,
  onSubmitted,
}: {
  occurrence: TodayTaskOccurrenceDTO;
  onClose: () => void;
  onSubmitted: (credits: number) => void;
}) {
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const proof = occurrence.task.proofRequirement;
  const photoNeeded = proof === "PHOTO_REQUIRED" || proof === "PHOTO_AND_NOTES";
  const photoAllowed = photoNeeded || proof === "PHOTO_OPTIONAL";
  const notesNeeded = proof === "NOTES_REQUIRED" || proof === "PHOTO_AND_NOTES";

  const submit = useMutation({
    mutationFn: async () => {
      setErr(null);
      let key = photoKey;
      if (photo && !key) {
        const r = await uploadProof(photo);
        key = r.key;
        setPhotoKey(key);
      }
      await api("/completions", {
        body: {
          taskId: occurrence.task.id,
          notes: notes || null,
          photoKey: key,
          occurrenceDate: occurrence.occurrenceDate,
        },
      });
    },
    onSuccess: () => onSubmitted(occurrence.task.creditValue),
    onError: (e: any) => setErr(e.message ?? "Could not submit"),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={occurrence.task.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={
              submit.isPending ||
              (notesNeeded && !notes.trim()) ||
              (photoNeeded && !photo)
            }
          >
            {submit.isPending ? "Submitting…" : "I'm done!"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-slate-600">
          Worth <strong>{occurrence.task.creditValue} 🪙</strong>. Proof: {proof.replace(/_/g, " ").toLowerCase()}.
        </div>
        {(notesNeeded || proof === "NOTES_OPTIONAL") && (
          <Field label={`Notes${notesNeeded ? " (required)" : " (optional)"}`}>
            <textarea className={inputCls} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        )}
        {photoAllowed && (
          <Field label={`Photo${photoNeeded ? " (required)" : " (optional)"}`}>
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
            {photo && <div className="text-xs text-slate-500 mt-1">{photo.name}</div>}
          </Field>
        )}
        {err && <div className="text-sm text-rose-600">{err}</div>}
      </div>
    </Modal>
  );
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Hey";
  return "Good evening";
}

function formatTimeOfDay(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
