import { prisma } from "../db.js";

// Starter tasks created for every new family at registration time. Mode is
// UP_FOR_GRABS so the rows are valid before any kid exists; parents can flip
// them to ASSIGNED + assignee once they've added children. Categories are
// resolved by name from the family's seeded TaskCategory rows (best-effort —
// if a rename happened before signup somehow, categoryId stays null).
interface SeedTaskSpec {
  title: string;
  creditValue: number;
  categoryName: string | null;
  defaultDurationMinutes?: number;
}

const STARTER_TASKS: SeedTaskSpec[] = [
  { title: "Clean up room", creditValue: 1, categoryName: "Bedroom", defaultDurationMinutes: 15 },
  { title: "Brush teeth", creditValue: 1, categoryName: "Hygiene", defaultDurationMinutes: 5 },
  { title: "Feed pets", creditValue: 2, categoryName: "Pets", defaultDurationMinutes: 5 },
  { title: "Clothes in hamper", creditValue: 1, categoryName: "Bedroom", defaultDurationMinutes: 5 },
];

interface SeedRewardSpec {
  name: string;
  description: string;
  creditCost: number;
  type: "TREAT" | "SCREEN_TIME" | "ACTIVITY" | "GAME_TIME" | "MOVIE_NIGHT" | "MONEY" | "CUSTOM";
}

const STARTER_REWARDS: SeedRewardSpec[] = [
  {
    name: "After-dinner dessert",
    description: "Pick a sweet treat after dinner.",
    creditCost: 15,
    type: "TREAT",
  },
  {
    name: "Screen time",
    description: "Extra screen-time block (parent picks duration on approval).",
    creditCost: 20,
    type: "SCREEN_TIME",
  },
  {
    name: "Pick the family movie",
    description: "You choose what the whole family watches tonight.",
    creditCost: 10,
    type: "ACTIVITY",
  },
];

export async function seedDefaultTasks(familyId: string): Promise<void> {
  const categories = await prisma.taskCategory.findMany({
    where: { familyId },
    select: { id: true, name: true },
  });
  const byName = new Map(categories.map((c) => [c.name, c.id]));

  await prisma.task.createMany({
    data: STARTER_TASKS.map((t) => ({
      familyId,
      title: t.title,
      creditValue: t.creditValue,
      // RECURRING + DAILY so the task surfaces on every kid's "today" list once
      // they're added. UP_FOR_GRABS keeps the row valid pre-kids.
      kind: "RECURRING" as const,
      recurrence: { frequency: "DAILY" } as object,
      assignmentMode: "UP_FOR_GRABS" as const,
      proofRequirement: "NOTES_OPTIONAL" as const,
      defaultDurationMinutes: t.defaultDurationMinutes ?? null,
      categoryId: t.categoryName ? (byName.get(t.categoryName) ?? null) : null,
      isActive: true,
    })),
  });
}

export async function seedDefaultRewards(familyId: string): Promise<void> {
  await prisma.reward.createMany({
    data: STARTER_REWARDS.map((r) => ({
      familyId,
      name: r.name,
      description: r.description,
      creditCost: r.creditCost,
      type: r.type,
      requiresApproval: true,
      isActive: true,
    })),
  });
}
