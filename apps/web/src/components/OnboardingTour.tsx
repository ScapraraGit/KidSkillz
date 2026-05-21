import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Popover, type PopoverPlacement } from "./Popover";
import { Button } from "./ui";

export interface TourStep {
  targetId: string;
  title: string;
  body: ReactNode;
  placement?: PopoverPlacement;
}

interface OnboardingTourProps {
  steps: TourStep[];
  onDone: () => void;
}

const MOBILE_BREAKPOINT = 640;
const MAX_FIND_ATTEMPTS = 12; // ~1.2s of retries before we give up and skip

// Hook returning true when the viewport is at or below the sm Tailwind
// breakpoint. Used to switch the tour from anchored-popover to a fixed
// bottom-sheet layout that doesn't jump around as steps advance.
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT,
  );
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return mobile;
}

export function OnboardingTour({ steps, onDone }: OnboardingTourProps) {
  const [idx, setIdx] = useState(0);
  const [target, setTarget] = useState<Element | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const isMobile = useIsMobile();
  // Track the last targetId we successfully scrolled to so we don't re-scroll
  // mid-step (the rect update interval would otherwise loop scroll → resize →
  // scroll on mobile, which is what feels "jumpy").
  const scrolledForStepRef = useRef<string | null>(null);

  const step = steps[idx];

  useLayoutEffect(() => {
    if (!step) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    let attempts = 0;

    const attach = (el: Element) => {
      setTarget(el);
      setMissing(false);
      // Only scroll on the first attach for this step. `block: "nearest"` is
      // a no-op when the element is already in view — avoids forcing a
      // recenter every time the user reaches a step on a phone where the
      // target may already be visible.
      if (scrolledForStepRef.current !== step.targetId) {
        scrolledForStepRef.current = step.targetId;
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
      const update = () => setRect(el.getBoundingClientRect());
      update();
      const t = setTimeout(update, 350);
      window.addEventListener("scroll", update, true);
      window.addEventListener("resize", update);
      cleanup = () => {
        clearTimeout(t);
        window.removeEventListener("scroll", update, true);
        window.removeEventListener("resize", update);
      };
    };

    const tryFind = () => {
      if (cancelled) return;
      // Prefer the first VISIBLE element marked with data-tour, so layouts
      // that render both a mobile and a desktop nav can carry the same hook
      // without ID collisions. `offsetParent === null` is true for any
      // ancestor with `display: none` (Tailwind `hidden`), so we use it as
      // a cheap visibility check. Falls back to getElementById for legacy
      // call sites that still use plain `id`.
      const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${step.targetId}"]`);
      const visible = Array.from(candidates).find((el) => el.offsetParent !== null);
      const el = visible ?? document.getElementById(step.targetId);
      if (el) {
        attach(el);
        return;
      }
      attempts += 1;
      if (attempts >= MAX_FIND_ATTEMPTS) {
        // Target lives in a hidden mobile drawer (or was removed from DOM).
        // Show the step copy without a highlight rather than scrolling forever.
        setMissing(true);
        return;
      }
      setTimeout(tryFind, 100);
    };

    setTarget(null);
    setRect(null);
    setMissing(false);
    tryFind();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (!step) return null;

  const isFirst = idx === 0;
  const isLast = idx === steps.length - 1;

  function next() {
    if (isLast) onDone();
    else setIdx((i) => i + 1);
  }
  function back() {
    if (!isFirst) setIdx((i) => i - 1);
  }

  const card = (
    <>
      <div className="text-xs uppercase tracking-wide text-brand-700 font-semibold">
        Step {idx + 1} of {steps.length}
      </div>
      <div className="font-semibold text-slate-900 mt-1">{step.title}</div>
      <div className="text-sm text-slate-600 mt-1">{step.body}</div>
      <div className="flex items-center justify-between gap-2 mt-4">
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-slate-500 hover:text-slate-800 underline"
        >
          Skip tour
        </button>
        <div className="flex gap-2">
          {!isFirst && (
            <Button variant="secondary" size="sm" onClick={back}>
              Back
            </Button>
          )}
          <Button size="sm" onClick={next}>
            {isLast ? "Got it!" : "Next"}
          </Button>
        </div>
      </div>
    </>
  );

  // Mobile: fixed bottom card. Popover anchoring is what makes the tour feel
  // jumpy on phones — re-anchoring per step shifts the visible area and the
  // page scrolls to keep the popover on screen. A bottom sheet stays put.
  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={onDone} />
        {rect && !missing && (
          // Inline style required: the highlight position is computed at
          // runtime from the target element's DOMRect.
          // eslint-disable-next-line react/forbid-dom-props
          <div
            className="fixed z-40 rounded-2xl ring-4 ring-brand-400 pointer-events-none transition-all"
            style={{
              top: rect.top - 4,
              left: rect.left - 4,
              width: rect.width + 8,
              height: rect.height + 8,
            }}
          />
        )}
        <div
          role="dialog"
          aria-label={step.title}
          className="fixed bottom-3 left-3 right-3 z-50 rounded-2xl bg-white shadow-xl border border-slate-200 p-4 text-slate-700"
          onClick={(e) => e.stopPropagation()}
        >
          {card}
        </div>
      </>
    );
  }

  // Desktop: keep the original anchored popover with element highlight.
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40 pointer-events-auto" onClick={onDone} />
      {rect && !missing && (
        // Inline style required: runtime DOMRect-driven position.
        // eslint-disable-next-line react/forbid-dom-props
        <div
          className="fixed z-40 rounded-2xl ring-4 ring-brand-400 ring-offset-2 ring-offset-slate-900/0 pointer-events-none transition-all"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      <Popover
        open={!!target && !missing}
        onClose={onDone}
        anchor={target}
        placement={step.placement ?? "bottom"}
        closeOnOutside={false}
        className="max-w-sm"
      >
        {card}
      </Popover>
      {missing && (
        // Target couldn't be found in DOM (likely hidden on a layout switch).
        // Render a centered fallback card so the step still advances.
        <div
          role="dialog"
          aria-label={step.title}
          className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-slate-200 p-4 text-slate-700"
        >
          {card}
        </div>
      )}
    </>
  );
}
