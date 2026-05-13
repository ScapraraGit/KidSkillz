import { Card } from "./ui";
import { getPet, petStageForLevel, PET_STAGE_NAMES } from "../lib/pets";
import type { LevelDTO } from "@chorechamps/shared";

interface Props {
  petId: string | undefined | null;
  level: LevelDTO;
  childName: string;
  /** Bounce trigger key — change to play the bounce animation once. */
  bounceKey?: number | string;
}

export function PetHero({ petId, level, childName, bounceKey }: Props) {
  const pet = getPet(petId);
  const stage = petStageForLevel(level.level);
  const glyph = pet.stages[stage];
  const stageName = PET_STAGE_NAMES[stage];
  const nextStageLevel = stage === 3 ? null : stage === 2 ? 11 : stage === 1 ? 6 : 3;

  return (
    <Card
      info={{
        title: "Your pet",
        body: `${pet.label} grows up as you level up. Egg → Hatchling at L3, Companion at L6, Champion at L11.`,
      }}
    >
      <div className="flex items-center gap-4">
        <div
          key={bounceKey}
          className="text-7xl select-none animate-pop"
          aria-label={`${pet.label} (${stageName})`}
          role="img"
        >
          {glyph}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-500">
            {childName}'s {pet.label}
          </div>
          <div className="font-bold text-lg">{stageName}</div>
          <div className="text-xs text-slate-500 mt-1">Lvl {level.level}</div>
          {nextStageLevel ? (
            <div className="text-xs text-brand-700 mt-1">Evolves at Lvl {nextStageLevel}</div>
          ) : (
            <div className="text-xs text-amber-700 mt-1">Fully evolved!</div>
          )}
        </div>
      </div>
    </Card>
  );
}
