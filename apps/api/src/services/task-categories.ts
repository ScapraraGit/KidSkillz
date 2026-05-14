import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import type { TaskCategoryDTO } from "@chorechamps/shared";
import type { TaskCategory } from "@prisma/client";

const DEFAULT_CATEGORIES: { name: string; icon: string; color: string; position: number }[] = [
  { name: "Kitchen", icon: "🍽️", color: "amber", position: 1 },
  { name: "Outdoor", icon: "🌳", color: "emerald", position: 2 },
  { name: "Pets", icon: "🐕", color: "orange", position: 3 },
  { name: "Homework", icon: "📚", color: "indigo", position: 4 },
  { name: "Hygiene", icon: "🪥", color: "sky", position: 5 },
  { name: "Bedroom", icon: "🛏️", color: "rose", position: 6 },
  { name: "Other", icon: "⭐", color: "slate", position: 7 },
];

export async function seedDefaultCategories(familyId: string) {
  await prisma.taskCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ familyId, ...c })),
    skipDuplicates: true,
  });
}

export async function listCategories(familyId: string): Promise<TaskCategoryDTO[]> {
  const rows = await prisma.taskCategory.findMany({
    where: { familyId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return rows.map(serializeCategory);
}

export interface CreateCategoryInput {
  name: string;
  icon: string;
  color?: string | null;
  position?: number;
}

export async function createCategory(familyId: string, input: CreateCategoryInput) {
  if (!input.name.trim()) throw HttpError.badRequest("Name required");
  if (!input.icon.trim()) throw HttpError.badRequest("Icon required");
  const created = await prisma.taskCategory.create({
    data: {
      familyId,
      name: input.name.trim(),
      icon: input.icon.trim(),
      color: input.color ?? null,
      position: input.position ?? 99,
    },
  });
  return serializeCategory(created);
}

export async function updateCategory(
  familyId: string,
  categoryId: string,
  input: Partial<CreateCategoryInput>,
) {
  const cat = await prisma.taskCategory.findFirst({ where: { id: categoryId, familyId } });
  if (!cat) throw HttpError.notFound("Category not found");
  const updated = await prisma.taskCategory.update({
    where: { id: categoryId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.icon !== undefined && { icon: input.icon.trim() }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.position !== undefined && { position: input.position }),
    },
  });
  return serializeCategory(updated);
}

export async function deleteCategory(familyId: string, categoryId: string) {
  const cat = await prisma.taskCategory.findFirst({ where: { id: categoryId, familyId } });
  if (!cat) throw HttpError.notFound("Category not found");
  // Tasks pointing at this category will SetNull via FK.
  await prisma.taskCategory.delete({ where: { id: categoryId } });
}

export function serializeCategory(c: TaskCategory): TaskCategoryDTO {
  return {
    id: c.id,
    familyId: c.familyId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    position: c.position,
  };
}
