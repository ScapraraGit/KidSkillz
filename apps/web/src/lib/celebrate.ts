import confetti from "canvas-confetti";

export type CelebrateKind = "task" | "redeem" | "levelup" | "challenge" | "badge";

interface FireOpts {
  sound?: boolean;
}

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6"];

export function celebrate(kind: CelebrateKind, opts: FireOpts = {}) {
  fireConfetti(kind);
  if (opts.sound) playTone(kind);
}

function fireConfetti(kind: CelebrateKind) {
  switch (kind) {
    case "task":
      confetti({ particleCount: 80, spread: 65, origin: { y: 0.7 }, colors: PALETTE });
      break;
    case "redeem":
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, colors: PALETTE });
      break;
    case "challenge":
      confetti({ particleCount: 100, spread: 75, startVelocity: 35, origin: { y: 0.65 }, colors: PALETTE });
      break;
    case "badge":
      confetti({ particleCount: 60, spread: 55, scalar: 1.1, origin: { y: 0.6 }, colors: PALETTE });
      break;
    case "levelup":
      // two-burst for level up
      confetti({ particleCount: 140, spread: 100, startVelocity: 45, origin: { y: 0.55 }, colors: PALETTE });
      window.setTimeout(() => {
        confetti({ particleCount: 80, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors: PALETTE });
        confetti({ particleCount: 80, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors: PALETTE });
      }, 220);
      break;
  }
}

// Lazy AudioContext so the page doesn't construct one until first sound play.
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor = (window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function playTone(kind: CelebrateKind) {
  const ctx = getCtx();
  if (!ctx) return;
  // Resume if suspended (Chrome autoplay policy).
  if (ctx.state === "suspended") void ctx.resume();

  const notes = NOTE_PATTERNS[kind];
  const now = ctx.currentTime;
  notes.forEach((n, i) => beep(ctx, n.freq, now + i * n.gap, n.dur));
}

const NOTE_PATTERNS: Record<CelebrateKind, { freq: number; dur: number; gap: number }[]> = {
  task: [
    { freq: 660, dur: 0.08, gap: 0 },
    { freq: 880, dur: 0.12, gap: 0.09 },
  ],
  redeem: [
    { freq: 523, dur: 0.1, gap: 0 },
    { freq: 659, dur: 0.1, gap: 0.11 },
    { freq: 784, dur: 0.16, gap: 0.22 },
  ],
  challenge: [
    { freq: 587, dur: 0.1, gap: 0 },
    { freq: 740, dur: 0.1, gap: 0.11 },
    { freq: 880, dur: 0.16, gap: 0.22 },
  ],
  badge: [
    { freq: 988, dur: 0.18, gap: 0 },
  ],
  levelup: [
    { freq: 523, dur: 0.08, gap: 0 },
    { freq: 659, dur: 0.08, gap: 0.09 },
    { freq: 784, dur: 0.08, gap: 0.18 },
    { freq: 1047, dur: 0.22, gap: 0.27 },
  ],
};

function beep(ctx: AudioContext, freq: number, when: number, dur: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.18, when + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}
