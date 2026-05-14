import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, uploadProof } from "../../lib/api";
import {
  Badge,
  Button,
  Card,
  CreditChip,
  EmptyState,
  Field,
  PageHeader,
  ProgressBar,
  inputCls,
} from "../../components/ui";
import { Modal } from "../../components/Modal";
import { KidAvatar } from "../../components/KidAvatar";
import { AvatarStudio } from "../../components/AvatarStudio";
import { Tooltip } from "../../components/Tooltip";
import { useAuth } from "../../store/auth";
import { useFeatures } from "../../hooks/useFeatures";
import { celebrate as fireCelebrate } from "../../lib/celebrate";
import { LevelCard, LevelRing } from "../../components/LevelCard";
import { PetHero } from "../../components/PetHero";
import { ChallengeSection } from "../../components/ChallengeCard";
import { StreakSaver } from "../../components/StreakSaver";
import { SavingsGoal } from "../../components/SavingsGoal";
import { VacationBanner } from "../../components/VacationBanner";
import { ActiveTimerCard } from "../../components/ActiveTimerCard";
import { FullscreenTimer } from "../../components/FullscreenTimer";
import { useActiveTimer } from "../../hooks/useActiveTimer";

type TimerDisplayMode = "fullscreen" | "inline";

function timerModeKey(childId: string | null | undefined) {
  return `cc:timerDisplayMode:${childId ?? "anon"}`;
}

function loadTimerMode(childId: string | null | undefined): TimerDisplayMode {
  try {
    const v = localStorage.getItem(timerModeKey(childId));
    return v === "inline" ? "inline" : "fullscreen";
  } catch {
    return "fullscreen";
  }
}
import type {
  ChallengeDTO,
  ChallengeProgressDTO,
  ChildDashboardDTO,
  LevelDTO,
  MissedOpportunityDTO,
  TodayTaskOccurrenceDTO,
} from "@chorechampz/shared";

interface ChallengeRow {
  challenge: ChallengeDTO;
  progress: ChallengeProgressDTO | null;
}

export function ChildDashboard() {
  const dash = useQuery({
    queryKey: ["dashboard", "child"],
    queryFn: () => api<ChildDashboardDTO>("/dashboard/child"),
  });
  const meId = useAuth((s) => s.user?.id);
  const levelQ = useQuery({
    queryKey: ["children", meId, "level"],
    queryFn: () => api<{ level: LevelDTO }>(`/children/${meId}/level`),
    enabled: !!meId,
    select: (r) => r.level,
  });
  const challengesQ = useQuery({
    queryKey: ["challenges", "me"],
    queryFn: () => api<{ challenges: ChallengeRow[] }>("/challenges/me"),
    select: (r) => r.challenges,
  });

  const [completing, setCompleting] = useState<TodayTaskOccurrenceDTO | null>(null);
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [petBounce, setPetBounce] = useState(0);
  const user = useAuth((s) => s.user);
  const settings = useAuth((s) => s.settings);
  const qc = useQueryClient();

  const soundEnabled = dash.data?.child.soundEnabled ?? false;
  const timer = useActiveTimer({
    childId: meId,
    soundEnabled,
    onExpire: () => fireCelebrate("task", { sound: soundEnabled }),
  });

  const [timerMode, setTimerModeState] = useState<TimerDisplayMode>(() => loadTimerMode(meId));
  useEffect(() => {
    setTimerModeState(loadTimerMode(meId));
  }, [meId]);
  const setTimerMode = useCallback(
    (mode: TimerDisplayMode) => {
      setTimerModeState(mode);
      try {
        localStorage.setItem(timerModeKey(meId), mode);
      } catch {
        // ignore quota
      }
    },
    [meId],
  );

  const seenLevelRef = useRef<number | null>(null);
  const seenChallengeRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const lvl = levelQ.data?.level;
    if (lvl == null) return;
    const key = `cc:lastSeenLevel:${meId}`;
    const stored = Number(localStorage.getItem(key) ?? "0") || 0;
    const prior = seenLevelRef.current ?? stored;
    if (lvl > prior && prior > 0) {
      fireCelebrate("levelup", { sound: dash.data?.child.soundEnabled ?? false });
      setPetBounce((n) => n + 1);
    }
    seenLevelRef.current = lvl;
    localStorage.setItem(key, String(lvl));
  }, [levelQ.data?.level, meId, dash.data?.child.soundEnabled]);

  useEffect(() => {
    const rows = challengesQ.data;
    if (!rows) return;
    const completedIds = new Set(
      rows.filter((r) => r.progress?.completedAt).map((r) => r.challenge.id + ":" + r.progress!.periodKey),
    );
    const storeKey = `cc:seenChallenges:${meId}`;
    const stored = safeReadStringSet(storeKey);
    const prior = seenChallengeRef.current ?? stored;
    let firedAny = false;
    for (const id of completedIds) {
      if (!prior.has(id)) {
        firedAny = true;
        break;
      }
    }
    if (firedAny && prior.size > 0) {
      fireCelebrate("challenge", { sound: dash.data?.child.soundEnabled ?? false });
    }
    seenChallengeRef.current = completedIds;
    try {
      localStorage.setItem(storeKey, JSON.stringify(Array.from(completedIds)));
    } catch {
      // Quota or storage disabled — celebrate fallback still works, watcher state held in ref.
    }
  }, [challengesQ.data, meId, dash.data?.child.soundEnabled]);

  if (dash.isLoading || !dash.data) return <div>Loading…</div>;
  const d = dash.data;
  const level = levelQ.data ?? { level: 1, xp: 0, xpInLevel: 0, xpToNext: 50 };
  const isYounger = d.child.viewMode === "YOUNGER";
  const vacation = settings?.vacationMode;
  const onVacation = !!vacation?.active;
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
                {isYounger ? (
                  <KidAvatar
                    name={d.child.name}
                    color={d.child.avatarColor}
                    config={d.child.avatarConfig}
                    size={56}
                  />
                ) : (
                  <LevelRing level={level} size={64} stroke={4}>
                    <KidAvatar
                      name={d.child.name}
                      color={d.child.avatarColor}
                      config={d.child.avatarConfig}
                      size={52}
                    />
                  </LevelRing>
                )}
                <span className="absolute -bottom-1 -right-1 bg-white rounded-full border border-slate-200 text-sm leading-none px-1 shadow-sm">
                  ✏️
                </span>
              </button>
            </Tooltip>
            <span>
              {greeting}, {d.child.name}!
            </span>
            {!isYounger && (
              <span className="ml-1">
                <LevelCard level={level} variant="compact" />
              </span>
            )}
          </span>
        }
        subtitle={
          d.child.redemptionPaused
            ? "Heads up: redemption is paused right now."
            : "Earn credits and crush your day."
        }
      />

      {isYounger ? (
        <PetHero
          petId={d.child.avatarConfig?.pet}
          level={level}
          childName={d.child.name}
          bounceKey={petBounce}
        />
      ) : (
        <LevelCard level={level} />
      )}

      {onVacation && <VacationBanner endsAt={vacation?.endsAt} note={vacation?.note} />}

      {timer.timer && timerMode === "inline" && (
        <ActiveTimerCard
          timer={timer.timer}
          timeLeft={timer.timeLeft}
          expired={timer.expired}
          onCancel={timer.cancel}
          onExpand={() => setTimerMode("fullscreen")}
        />
      )}
      {timer.timer && timerMode === "fullscreen" && (
        <FullscreenTimer
          timer={timer.timer}
          timeLeft={timer.timeLeft}
          expired={timer.expired}
          onCancel={timer.cancel}
          onMinimize={() => setTimerMode("inline")}
        />
      )}

      {!onVacation && (
        <StreakSaver
          timezone={settings?.timezone ?? "America/Phoenix"}
          streakDays={d.stats.streakDays}
          openTasksToday={d.todayTasks.filter((t) => !t.completionStatus).length}
          completionsToday={
            d.todayTasks.filter((t) => t.completionStatus === "APPROVED" || t.completionStatus === "PENDING")
              .length
          }
        />
      )}

      {d.child.savingsGoalRewardId && (
        <SavingsGoal
          rewardId={d.child.savingsGoalRewardId}
          balance={d.child.balance}
          weekEarned={d.stats.weekEarned}
        />
      )}

      {challengesQ.data && (
        <ChallengeSection rows={challengesQ.data} variant={isYounger ? "YOUNGER" : "OLDER"} />
      )}

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
              <Badge key={b} color="amber">
                🏅 {b}
              </Badge>
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
          <Link to="/me/initiative" className="text-sm text-brand-700 font-medium">
            + Suggest initiative
          </Link>
        </div>
        {d.todayTasks.length === 0 ? (
          <EmptyState title="Nothing scheduled — enjoy the day!" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.todayTasks.map((occ) => (
              <li
                key={`${occ.task.id}-${occ.occurrenceDate}`}
                className="py-3 flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-[150px]">
                  <div className="font-medium">{occ.task.title}</div>
                  {occ.task.description && (
                    <div className="text-xs text-slate-500">{occ.task.description}</div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {occ.task.assignmentMode === "UP_FOR_GRABS" && (
                      <Badge color="amber">🙋 Up for Grabs</Badge>
                    )}
                    {occ.task.assignmentMode === "TEAM" && (
                      <Badge color="brand">👥 Team ({occ.teamJoinerIds?.length ?? 0} joined)</Badge>
                    )}
                    {occ.task.dueByTime && (
                      <Badge color="brand">Due by {formatTimeOfDay(occ.task.dueByTime)}</Badge>
                    )}
                    {occ.task.kind === "ONE_TIME" && occ.task.dueAt && (
                      <Badge color="brand">
                        Due{" "}
                        {new Date(occ.task.dueAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Badge>
                    )}
                    {occ.task.proofRequirement !== "NONE" &&
                      occ.task.proofRequirement !== "NOTES_OPTIONAL" && (
                        <Badge color="amber">
                          Proof: {occ.task.proofRequirement.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      )}
                  </div>
                </div>
                <CreditChip amount={occ.task.creditValue} />
                {occ.completionStatus === "PENDING" ? (
                  <Badge color="amber">Awaiting approval</Badge>
                ) : occ.completionStatus === "APPROVED" ? (
                  <Badge color="emerald">✓ Done</Badge>
                ) : occ.task.assignmentMode === "TEAM" && !occ.joined ? (
                  <TeamJoinButton occ={occ} />
                ) : (
                  <>
                    <StartTimerButton
                      taskId={occ.task.id}
                      taskTitle={occ.task.title}
                      defaultMinutes={occ.task.defaultDurationMinutes ?? null}
                      disabled={!!timer.timer || onVacation}
                      onStart={(durationMs) => {
                        setTimerMode("fullscreen");
                        timer.start({ taskId: occ.task.id, taskTitle: occ.task.title, durationMs });
                      }}
                    />
                    <Tooltip
                      label={
                        onVacation
                          ? "Vacation mode is on — enjoy the break!"
                          : d.child.earningPaused
                            ? "Earning is paused — ask a parent"
                            : "Submit this task for parent approval"
                      }
                    >
                      <Button
                        size="sm"
                        onClick={() => setCompleting(occ)}
                        disabled={d.child.earningPaused || onVacation}
                      >
                        Mark done
                      </Button>
                    </Tooltip>
                  </>
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
            if (timer.timer?.taskId === completing.task.id) timer.cancel();
            setCompleting(null);
            setCelebrate(credits);
            fireCelebrate("task", { sound: d.child.soundEnabled });
            setPetBounce((n) => n + 1);
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            qc.invalidateQueries({ queryKey: ["children", meId, "level"] });
            qc.invalidateQueries({ queryKey: ["challenges", "me"] });
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

      {studioOpen && user && <AvatarStudio user={user} onClose={() => setStudioOpen(false)} />}

      {settings?.missedOpportunityMode && settings.missedOpportunityMode !== "OFF" && (
        <MissedOpportunityOverlay mode={settings.missedOpportunityMode} childId={meId} />
      )}
    </div>
  );
}

const UPLOAD_ACK_KEY_PREFIX = "cc:upload-ack:";

function CompleteModal({
  occurrence,
  onClose,
  onSubmitted,
}: {
  occurrence: TodayTaskOccurrenceDTO;
  onClose: () => void;
  onSubmitted: (credits: number) => void;
}) {
  const meId = useAuth.getState().user?.id ?? "anon";
  const ackKey = `${UPLOAD_ACK_KEY_PREFIX}${meId}`;
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hasPriorAck, setHasPriorAck] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(ackKey) === "1";
  });
  const [uploadAck, setUploadAck] = useState(false);

  const features = useFeatures();
  const proof = occurrence.task.proofRequirement;
  // Photo proof is feature-flagged. Server downgrades stored PHOTO_* values at
  // serialization time, but gate here too so a stale cache can't surface the
  // upload field after the flag flips off.
  const photoNeeded = features.photoProof && (proof === "PHOTO_REQUIRED" || proof === "PHOTO_AND_NOTES");
  const photoAllowed = features.photoProof && (photoNeeded || proof === "PHOTO_OPTIONAL");
  const notesNeeded = proof === "NOTES_REQUIRED" || proof === "PHOTO_AND_NOTES";
  const ackRequired = !!photo && !hasPriorAck && !uploadAck;

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
      if (photo && !hasPriorAck) {
        try {
          window.localStorage.setItem(ackKey, "1");
        } catch {
          /* storage disabled — non-fatal */
        }
        setHasPriorAck(true);
      }
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={
              submit.isPending || (notesNeeded && !notes.trim()) || (photoNeeded && !photo) || ackRequired
            }
          >
            {submit.isPending ? "Submitting…" : "I'm done!"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-slate-600">
          Worth <strong>{occurrence.task.creditValue} 🪙</strong>. Proof:{" "}
          {proof.replace(/_/g, " ").toLowerCase()}.
        </div>
        {(notesNeeded || proof === "NOTES_OPTIONAL") && (
          <Field label={`Notes${notesNeeded ? " (required)" : " (optional)"}`}>
            <textarea
              className={inputCls}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
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
        {photo && !hasPriorAck && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
            <div className="font-semibold">Before you send this photo</div>
            <p>
              Only show your chore — no selfies, no faces, no people in swimsuits, pajamas, or bathrooms. A
              grown-up at home will see this photo.
            </p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={uploadAck}
                onChange={(e) => setUploadAck(e.target.checked)}
                title="Confirm you understand the photo rules"
                className="mt-0.5"
              />
              <span>I checked my photo and it only shows the chore.</span>
            </label>
          </div>
        )}
        {err && <div className="text-sm text-rose-600">{err}</div>}
      </div>
    </Modal>
  );
}

const TIMER_PRESETS = [5, 10, 15, 30];

function StartTimerButton({
  taskId: _taskId,
  taskTitle: _taskTitle,
  defaultMinutes,
  disabled,
  onStart,
}: {
  taskId: string;
  taskTitle: string;
  defaultMinutes: number | null;
  disabled: boolean;
  onStart: (durationMs: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const presets =
    defaultMinutes && !TIMER_PRESETS.includes(defaultMinutes)
      ? [defaultMinutes, ...TIMER_PRESETS].sort((a, b) => a - b)
      : TIMER_PRESETS;

  return (
    <div className="relative" ref={wrapRef}>
      <Tooltip label={disabled ? "A timer is already running" : "Start a focus timer for this task"}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          aria-haspopup="true"
          aria-expanded={open}
        >
          ▶ Timer
        </Button>
      </Tooltip>
      {open && (
        <div
          aria-label="Pick a focus timer length"
          className="absolute right-0 z-30 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 p-2 flex flex-col gap-1 min-w-[120px]"
        >
          <div className="text-[10px] text-slate-500 px-2 pt-1">Pick a length</div>
          {presets.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                onStart(m * 60_000);
                setOpen(false);
              }}
              className="text-sm px-3 py-1.5 text-left rounded-lg hover:bg-brand-50 hover:text-brand-700"
            >
              {m} min{defaultMinutes === m ? " (suggested)" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamJoinButton({ occ }: { occ: TodayTaskOccurrenceDTO }) {
  const qc = useQueryClient();
  const join = useMutation({
    mutationFn: () =>
      api(`/tasks/${occ.task.id}/join`, {
        body: { occurrenceDate: occ.task.kind === "RECURRING" ? occ.occurrenceDate : null },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  return (
    <Tooltip label="Join this team task — share the credit with anyone else who joins.">
      <Button size="sm" variant="secondary" onClick={() => join.mutate()} disabled={join.isPending}>
        {join.isPending ? "Joining…" : "👥 Join team"}
      </Button>
    </Tooltip>
  );
}

function MissedOpportunityOverlay({
  mode,
  childId,
}: {
  mode: "GENTLE" | "SAVAGE";
  childId: string | undefined;
}) {
  const moQ = useQuery({
    queryKey: ["missed-opportunities", "recent"],
    queryFn: () =>
      api<{ missedOpportunities: MissedOpportunityDTO[] }>("/missed-opportunities/recent?days=2"),
    refetchInterval: 60_000,
    enabled: !!childId,
  });
  const rows = moQ.data?.missedOpportunities ?? [];
  const seenKey = `cc:seenMO:${childId ?? "anon"}`;
  const seen = (() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(seenKey) ?? "[]"));
    } catch {
      return new Set<string>();
    }
  })();
  const unseen = rows.filter((r) => !seen.has(r.id));
  if (unseen.length === 0) return null;
  const r = unseen[0];

  function dismiss() {
    seen.add(r.id);
    try {
      localStorage.setItem(seenKey, JSON.stringify(Array.from(seen)));
    } catch {
      /* quota exceeded — overlay simply re-shows next render */
    }
    moQ.refetch();
  }

  const headline =
    mode === "SAVAGE"
      ? `💸 ${r.claimedByName ?? "A grown-up"} beat you to "${r.taskTitle}"! Too slow! 🤣`
      : `${r.claimedByName ?? "A grown-up"} got "${r.taskTitle}" first — missed opportunity!`;

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={dismiss}>
      <div
        className="bg-white rounded-3xl shadow-2xl px-8 py-6 max-w-md text-center animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl">💸</div>
        <div className="text-lg font-bold mt-3">{headline}</div>
        <div className="text-sm text-slate-500 mt-2">No credit this time. Get there first next round!</div>
        <Button className="mt-4" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}

function safeReadStringSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((s): s is string => typeof s === "string")) : new Set();
  } catch {
    return new Set();
  }
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
