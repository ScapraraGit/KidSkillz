import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_FAMILY_SETTINGS } from "@chorechampz/shared";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.family.findFirst({ where: { name: "The Caprara Family" } });
  if (existing) {
    console.log("[seed] Family already exists, skipping seed.");
    return;
  }

  const passwordHash = await bcrypt.hash("password123", 10);

  const family = await prisma.family.create({
    data: {
      name: "The Caprara Family",
      settings: { ...DEFAULT_FAMILY_SETTINGS } as object,
    },
  });

  const dad = await prisma.user.create({
    data: {
      familyId: family.id,
      role: "PARENT",
      name: "Dad",
      email: "dad@example.com",
      passwordHash,
      avatarColor: "#2563eb",
    },
  });
  const mom = await prisma.user.create({
    data: {
      familyId: family.id,
      role: "PARENT",
      name: "Mom",
      email: "mom@example.com",
      passwordHash,
      avatarColor: "#db2777",
    },
  });

  const ava = await prisma.user.create({
    data: {
      familyId: family.id,
      role: "CHILD",
      name: "Ava",
      pin: "1234",
      avatarColor: "#22c55e",
      avatarConfig: {
        top: ["straight02"],
        topProbability: 100,
        hairColor: ["a55728"],
        eyes: ["happy"],
        eyebrows: ["defaultNatural"],
        mouth: ["smile"],
        skinColor: ["light"],
        accessoriesProbability: 0,
        facialHairProbability: 0,
        clothing: ["hoodie"],
        clothesColor: ["ff488e"],
        backgroundColor: ["ffd5dc"],
      },
      childProfile: { create: { familyId: family.id } },
    },
  });
  const leo = await prisma.user.create({
    data: {
      familyId: family.id,
      role: "CHILD",
      name: "Leo",
      pin: "4321",
      avatarColor: "#f59e0b",
      avatarConfig: {
        top: ["shortRound"],
        topProbability: 100,
        hairColor: ["2c1b18"],
        eyes: ["wink"],
        eyebrows: ["raisedExcited"],
        mouth: ["twinkle"],
        skinColor: ["light"],
        accessoriesProbability: 100,
        accessories: ["round"],
        facialHairProbability: 0,
        clothing: ["graphicShirt"],
        clothesColor: ["65c9ff"],
        backgroundColor: ["b6e3f4"],
      },
      childProfile: { create: { familyId: family.id } },
    },
  });

  // Tasks — every task belongs to a specific kid. "Make your bed" is seeded for both kids to
  // demonstrate that shared chores get duplicated per kid (try the "Copy to all kids" action).
  const bedTask: Record<string, string> = {};
  for (const kid of [ava, leo]) {
    const t = await prisma.task.create({
      data: {
        familyId: family.id,
        title: "Make your bed",
        description: "Pillows fluffed, sheets pulled tight.",
        creditValue: 2,
        category: "Morning",
        kind: "RECURRING",
        recurrence: { frequency: "DAILY" },
        dueByTime: "08:00",
        proofRequirement: "NONE",
        assignedToId: kid.id,
      },
    });
    bedTask[kid.id] = t.id;
  }
  const dishwasher = await prisma.task.create({
    data: {
      familyId: family.id,
      title: "Empty the dishwasher",
      creditValue: 5,
      category: "Kitchen",
      kind: "RECURRING",
      recurrence: { frequency: "CUSTOM", daysOfWeek: [1, 3, 5] }, // Mon/Wed/Fri
      proofRequirement: "NOTES_OPTIONAL",
      assignedToId: ava.id,
    },
  });
  await prisma.task.create({
    data: {
      familyId: family.id,
      title: "Take out the trash",
      creditValue: 4,
      category: "Outside",
      kind: "RECURRING",
      recurrence: { frequency: "WEEKLY", daysOfWeek: [0] }, // Sundays
      proofRequirement: "PHOTO_OPTIONAL",
      assignedToId: leo.id,
    },
  });
  const t4 = await prisma.task.create({
    data: {
      familyId: family.id,
      title: "Clean your room (deep)",
      description: "Vacuum, dust, organize closet.",
      creditValue: 15,
      category: "Bedroom",
      kind: "ONE_TIME",
      proofRequirement: "PHOTO_REQUIRED",
      assignedToId: ava.id,
    },
  });
  const t5 = await prisma.task.create({
    data: {
      familyId: family.id,
      title: "Practice piano (20 min)",
      creditValue: 6,
      category: "Music",
      kind: "RECURRING",
      recurrence: { frequency: "DAILY" },
      proofRequirement: "NOTES_OPTIONAL",
      assignedToId: ava.id,
    },
  });
  const t6 = await prisma.task.create({
    data: {
      familyId: family.id,
      title: "Feed the dog",
      creditValue: 2,
      category: "Pets",
      kind: "RECURRING",
      recurrence: { frequency: "DAILY" },
      dueByTime: "07:30",
      proofRequirement: "NONE",
      assignedToId: leo.id,
    },
  });

  // Rewards
  await prisma.reward.createMany({
    data: [
      {
        familyId: family.id,
        name: "Screen Time",
        description: "Tablet, TV, or game time.",
        creditCost: 5,
        type: "SCREEN_TIME",
        requiresApproval: true,
        metadata: { unitMinutes: 30, maxPerRedemption: 60 },
      },
      {
        familyId: family.id,
        name: "Pick the movie tonight",
        description: "You choose the family movie.",
        creditCost: 12,
        type: "MOVIE_NIGHT",
        requiresApproval: true,
      },
      {
        familyId: family.id,
        name: "$1 Allowance",
        description: "One dollar real money.",
        creditCost: 20,
        type: "MONEY",
        requiresApproval: true,
        metadata: { currency: "USD", amountPerCredit: 0.05 },
      },
      {
        familyId: family.id,
        name: "Ice cream after dinner",
        description: "Scoop of choice.",
        creditCost: 8,
        type: "TREAT",
        requiresApproval: true,
      },
      {
        familyId: family.id,
        name: "Park trip Saturday",
        creditCost: 25,
        type: "ACTIVITY",
        requiresApproval: true,
      },
    ],
  });

  // Pending task completion (Ava finished her room)
  await prisma.taskCompletion.create({
    data: {
      taskId: t4.id,
      childId: ava.id,
      notes: "All clean — closet too!",
      photoKey: null,
      occurrenceDate: null,
    },
  });

  // Approved task completions (some history) so balances aren't zero
  const approve = async (
    taskId: string,
    childId: string,
    occurrenceDate: string | null,
    credits: number,
    parentId: string,
  ) => {
    const c = await prisma.taskCompletion.create({
      data: {
        taskId,
        childId,
        occurrenceDate,
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedById: parentId,
        creditAwarded: credits,
      },
    });
    const t = await prisma.task.findUnique({ where: { id: taskId } });
    await prisma.ledgerEntry.create({
      data: {
        familyId: family.id,
        childId,
        amount: credits,
        kind: "TASK",
        reason: `Task: ${t!.title}`,
        sourceType: "TASK_COMPLETION",
        sourceId: c.id,
        createdById: parentId,
      },
    });
  };

  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dayBefore = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  await approve(bedTask[ava.id], ava.id, yest, 2, dad.id);
  await approve(bedTask[leo.id], leo.id, yest, 2, mom.id);
  await approve(dishwasher.id, ava.id, dayBefore, 5, dad.id);
  await approve(t6.id, leo.id, yest, 2, mom.id);

  // Initiative example (planned, pending)
  await prisma.initiativeRequest.create({
    data: {
      familyId: family.id,
      childId: ava.id,
      kind: "PLANNED",
      title: "Help Mom organize the pantry",
      description: "I want to take a few hours Saturday to label and reorganize.",
      suggestedCredits: 10,
    },
  });

  // Pending redemption: Leo wants screen time
  const screenTime = await prisma.reward.findFirst({ where: { familyId: family.id, type: "SCREEN_TIME" } });
  if (screenTime) {
    await prisma.redemption.create({
      data: {
        rewardId: screenTime.id,
        childId: leo.id,
        creditCost: screenTime.creditCost * 1,
        quantity: 1,
        notes: "After dinner please!",
      },
    });
  }

  // Manual adjustment example — bonus
  await prisma.ledgerEntry.create({
    data: {
      familyId: family.id,
      childId: ava.id,
      amount: 3,
      kind: "ADJUSTMENT_POSITIVE",
      reason: "Helping without being asked",
      sourceType: "ADJUSTMENT",
      createdById: mom.id,
    },
  });

  console.log("[seed] Done. Login: dad@example.com / password123 — kids PINs Ava=1234, Leo=4321");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
