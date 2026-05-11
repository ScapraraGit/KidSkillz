import { prisma } from "../db.js";
import { DEFAULT_FAMILY_SETTINGS, type FamilySettings } from "@chorechamps/shared";
import { HttpError } from "../errors.js";

export async function getFamily(familyId: string) {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw HttpError.notFound("Family not found");
  return family;
}

export function readSettings(raw: unknown): FamilySettings {
  return { ...DEFAULT_FAMILY_SETTINGS, ...(raw as Partial<FamilySettings> | null ?? {}) };
}

export async function updateSettings(familyId: string, patch: Partial<FamilySettings>) {
  const fam = await getFamily(familyId);
  const next = { ...readSettings(fam.settings), ...patch };
  return prisma.family.update({
    where: { id: familyId },
    data: { settings: next as object },
  });
}

export async function getFamilySettings(familyId: string): Promise<FamilySettings> {
  const fam = await getFamily(familyId);
  return readSettings(fam.settings);
}
