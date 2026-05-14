import { Card } from "./ui";
import { titleFor, nextTitle } from "../lib/titles";
import type { LevelDTO } from "@chorechampz/shared";

interface Props {
  level: LevelDTO;
  variant?: "compact" | "full";
}

export function LevelCard({ level, variant = "full" }: Props) {
  const pct = level.xpToNext === 0 ? 100 : Math.round((level.xpInLevel / level.xpToNext) * 100);
  const title = titleFor(level.level);
  const next = nextTitle(level.level);

  if (variant === "compact") {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold px-2 py-1">
        <span>Lvl {level.level}</span>
        {title && <span className="opacity-80">· {title}</span>}
        <span className="opacity-70">
          {level.xpInLevel}/{level.xpToNext}
        </span>
      </div>
    );
  }

  return (
    <Card
      info={{
        title: "Level",
        body: "Your level grows with every credit you earn. Hit the next threshold to level up, grab a bonus, and unlock a new title.",
      }}
    >
      <div className="text-xs text-slate-500">Level</div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className="text-3xl font-bold text-brand-700">Lvl {level.level}</div>
        <div className="text-xs text-slate-500">{level.xp} XP total</div>
      </div>
      {title && (
        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold px-2 py-0.5">
          🏅 {title}
        </div>
      )}
      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-slate-500 mt-1">
        {level.xpInLevel}/{level.xpToNext} XP to Lvl {level.level + 1}
        {next && (
          <>
            {" "}
            · next title <strong>{next.name}</strong> at Lvl {next.level}
          </>
        )}
      </div>
    </Card>
  );
}

interface RingProps {
  level: LevelDTO;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}

export function LevelRing({ level, size = 64, stroke = 5, children }: RingProps) {
  const pct = level.xpToNext === 0 ? 1 : level.xpInLevel / level.xpToNext;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(226 232 240)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(99 102 241)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
