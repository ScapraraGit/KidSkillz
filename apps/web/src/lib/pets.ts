export interface PetDef {
  id: string;
  label: string;
  // 4 evolution stages keyed by level band
  stages: [string, string, string, string]; // egg, hatchling, adult, champion
}

export const PETS: PetDef[] = [
  { id: "dragon", label: "Dragon", stages: ["🥚", "🐣", "🐉", "🐲"] },
  { id: "cat", label: "Cat", stages: ["🥚", "🐱", "🐈", "🦁"] },
  { id: "dog", label: "Dog", stages: ["🥚", "🐶", "🐕", "🐺"] },
  { id: "fox", label: "Fox", stages: ["🥚", "🐣", "🦊", "🦊"] },
  { id: "bunny", label: "Bunny", stages: ["🥚", "🐣", "🐰", "🐇"] },
];

export const DEFAULT_PET_ID = "dragon";

export function petStageForLevel(level: number): 0 | 1 | 2 | 3 {
  if (level >= 11) return 3;
  if (level >= 6) return 2;
  if (level >= 3) return 1;
  return 0;
}

export function getPet(id: string | undefined | null): PetDef {
  return PETS.find((p) => p.id === id) ?? PETS[0];
}

export function petGlyph(id: string | undefined | null, level: number): string {
  const pet = getPet(id);
  return pet.stages[petStageForLevel(level)];
}

export const PET_STAGE_NAMES = ["Egg", "Hatchling", "Companion", "Champion"] as const;
