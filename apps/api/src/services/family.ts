import { prisma } from "../db.js";
import { DEFAULT_FAMILY_SETTINGS, type FamilySettings } from "@chorechampz/shared";
import { HttpError } from "../errors.js";

export async function getFamily(familyId: string) {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw HttpError.notFound("Family not found");
  return family;
}

export function readSettings(raw: unknown): FamilySettings {
  const merged = { ...DEFAULT_FAMILY_SETTINGS, ...((raw as Partial<FamilySettings> | null) ?? {}) };
  // Auto-expire vacation mode once endsAt is in the past; UI shows live state without
  // requiring a write-back from a cron job.
  if (merged.vacationMode?.active && merged.vacationMode.endsAt) {
    if (new Date(merged.vacationMode.endsAt).getTime() < Date.now()) {
      merged.vacationMode = { ...merged.vacationMode, active: false };
    }
  }
  return merged;
}

export function isVacationActive(settings: FamilySettings): boolean {
  return !!settings.vacationMode?.active;
}

export async function updateSettings(familyId: string, patch: Partial<FamilySettings>) {
  const fam = await getFamily(familyId);
  const current = readSettings(fam.settings);
  const next: FamilySettings = { ...current, ...patch };
  // If vacation flipping from inactive→active without an explicit startsAt, stamp now.
  if (patch.vacationMode) {
    const wasActive = !!current.vacationMode?.active;
    const nowActive = !!patch.vacationMode.active;
    next.vacationMode = {
      ...current.vacationMode,
      ...patch.vacationMode,
      startsAt:
        patch.vacationMode.startsAt ??
        (!wasActive && nowActive ? new Date().toISOString() : (current.vacationMode?.startsAt ?? null)),
    };
  }
  return prisma.family.update({
    where: { id: familyId },
    data: { settings: next as object },
  });
}

export async function getFamilySettings(familyId: string): Promise<FamilySettings> {
  const fam = await getFamily(familyId);
  return readSettings(fam.settings);
}
