interface Title {
  level: number;
  name: string;
}

const LADDER: Title[] = [
  { level: 2, name: "Helper" },
  { level: 3, name: "Chore Cub" },
  { level: 5, name: "Chore Champ" },
  { level: 7, name: "Streak Wizard" },
  { level: 10, name: "Ledger Legend" },
  { level: 15, name: "Initiative Hero" },
  { level: 20, name: "Grand Champion" },
];

export function titleFor(level: number): string | null {
  let current: string | null = null;
  for (const t of LADDER) {
    if (level >= t.level) current = t.name;
    else break;
  }
  return current;
}

export function nextTitle(level: number): { name: string; level: number } | null {
  return LADDER.find((t) => t.level > level) ?? null;
}
