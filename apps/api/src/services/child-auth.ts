import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export interface PinAttemptState {
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
}

export interface PinAttemptResult {
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
  locked: boolean;
}

// Exponential backoff: thresholds 5, 6, 7, 8+ map to 1m, 5m, 30m, 24h.
// Below 5 attempts: no lock.
export function backoffMs(attempts: number): number | null {
  if (attempts < 5) return null;
  if (attempts === 5) return 60_000;
  if (attempts === 6) return 5 * 60_000;
  if (attempts === 7) return 30 * 60_000;
  return 24 * 60 * 60_000;
}

/**
 * Pure-function reducer. Given current lockout state and the outcome of a PIN
 * check, returns the next state. `now` injected for testability.
 */
export function evaluatePinAttempt(state: PinAttemptState, ok: boolean, now: Date): PinAttemptResult {
  if (ok) {
    return { failedPinAttempts: 0, pinLockedUntil: null, locked: false };
  }
  const next = state.failedPinAttempts + 1;
  const ms = backoffMs(next);
  return {
    failedPinAttempts: next,
    pinLockedUntil: ms == null ? null : new Date(now.getTime() + ms),
    locked: ms != null,
  };
}

export function isLocked(state: PinAttemptState, now: Date): boolean {
  return state.pinLockedUntil != null && state.pinLockedUntil.getTime() > now.getTime();
}

/**
 * Asserts the child's PIN lock has not expired. Throws 401 with retryAfter on lock.
 */
export async function assertPinNotLocked(childId: string, now: Date = new Date()): Promise<void> {
  const c = await prisma.user.findUnique({
    where: { id: childId },
    select: { pinLockedUntil: true },
  });
  if (!c) return;
  if (c.pinLockedUntil && c.pinLockedUntil.getTime() > now.getTime()) {
    const seconds = Math.ceil((c.pinLockedUntil.getTime() - now.getTime()) / 1000);
    throw HttpError.unauthorized(`PIN locked. Try again in ${seconds}s.`);
  }
}

/**
 * Records the outcome of a PIN check, updating counters and lock. Returns the
 * resulting state. Caller still decides what HTTP error to throw on `!ok`.
 */
export async function recordPinAttempt(
  childId: string,
  ok: boolean,
  now: Date = new Date(),
): Promise<PinAttemptResult> {
  const current = await prisma.user.findUnique({
    where: { id: childId },
    select: { failedPinAttempts: true, pinLockedUntil: true },
  });
  const state: PinAttemptState = {
    failedPinAttempts: current?.failedPinAttempts ?? 0,
    pinLockedUntil: current?.pinLockedUntil ?? null,
  };
  const next = evaluatePinAttempt(state, ok, now);
  await prisma.user.update({
    where: { id: childId },
    data: {
      failedPinAttempts: next.failedPinAttempts,
      pinLockedUntil: next.pinLockedUntil,
    },
  });
  return next;
}

/**
 * Parent action: clear lock + counter for a child. Caller responsible for
 * permission check + audit log.
 */
export async function unlockChildPin(childId: string): Promise<void> {
  await prisma.user.update({
    where: { id: childId },
    data: { failedPinAttempts: 0, pinLockedUntil: null },
  });
}
