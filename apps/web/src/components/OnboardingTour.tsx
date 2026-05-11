import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
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

export function OnboardingTour({ steps, onDone }: OnboardingTourProps) {
  const [idx, setIdx] = useState(0);
  const [target, setTarget] = useState<Element | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = steps[idx];

  useLayoutEffect(() => {
    if (!step) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const attach = (el: Element) => {
      setTarget(el);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
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
      const el = document.getElementById(step.targetId);
      if (el) attach(el);
      else setTimeout(tryFind, 100);
    };

    setTarget(null);
    setRect(null);
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

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40 pointer-events-auto" onClick={onDone} />
      {rect && (
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
        open={!!target}
        onClose={onDone}
        anchor={target}
        placement={step.placement ?? "bottom"}
        closeOnOutside={false}
        className="max-w-sm"
      >
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
      </Popover>
    </>
  );
}
