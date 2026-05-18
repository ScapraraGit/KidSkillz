import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { signToken } from "../lib/auth.js";
import { DEFAULT_FAMILY_SETTINGS } from "@chorechampz/shared";

/**
 * Convenience factory used by integration tests. Builds a fresh tenant with a
 * parent + child so every test is isolated from the others. Returned cleanup
 * function removes every row that descends from the created family.
 */
export interface TestFamily {
  familyId: string;
  parent: { id: string; email: string; token: string };
  child: { id: string; pin: string; token: string };
  /** Bearer token for a parent in a *different* family — for cross-tenant 404 tests. */
  outsiderToken: string;
  outsiderFamilyId: string;
  cleanup: () => Promise<void>;
}

export async function makeTestFamily(): Promise<TestFamily> {
  const hash = await bcrypt.hash("Sup3r-Str0ng!Test", 10);

  const fam = await prisma.family.create({
    data: {
      name: `Test ${randomUUID().slice(0, 8)}`,
      settings: { ...DEFAULT_FAMILY_SETTINGS } as object,
    },
  });
  const parent = await prisma.user.create({
    data: {
      familyId: fam.id,
      role: "PARENT",
      name: "Test Parent",
      email: `parent-${randomUUID()}@test.local`,
      passwordHash: hash,
    },
  });
  const child = await prisma.user.create({
    data: {
      familyId: fam.id,
      role: "CHILD",
      name: "Test Kid",
      pin: "1234",
    },
  });

  // Outsider family for cross-tenant assertions.
  const outFam = await prisma.family.create({
    data: {
      name: `Outsider ${randomUUID().slice(0, 8)}`,
      settings: { ...DEFAULT_FAMILY_SETTINGS } as object,
    },
  });
  const outParent = await prisma.user.create({
    data: {
      familyId: outFam.id,
      role: "PARENT",
      name: "Outsider",
      email: `outsider-${randomUUID()}@test.local`,
      passwordHash: hash,
    },
  });

  return {
    familyId: fam.id,
    parent: {
      id: parent.id,
      email: parent.email!,
      token: signToken({
        sub: parent.id,
        fid: fam.id,
        role: "PARENT",
        adm: false,
        tv: parent.tokenVersion,
      }),
    },
    child: {
      id: child.id,
      pin: "1234",
      token: signToken({
        sub: child.id,
        fid: fam.id,
        role: "CHILD",
        tv: child.tokenVersion,
      }),
    },
    outsiderToken: signToken({
      sub: outParent.id,
      fid: outFam.id,
      role: "PARENT",
      adm: false,
      tv: outParent.tokenVersion,
    }),
    outsiderFamilyId: outFam.id,
    cleanup: async () => {
      // Family.onDelete = Cascade for all owned tables.
      await prisma.family.deleteMany({ where: { id: { in: [fam.id, outFam.id] } } });
    },
  };
}

/**
 * vitest skip-guard. Returns `it` if a usable DATABASE_URL is configured,
 * otherwise `it.skip` so CI without a test DB doesn't fail the suite.
 */
export function dbIt(it: (typeof import("vitest"))["it"]): (typeof import("vitest"))["it"] {
  return process.env.DATABASE_URL ? it : (it.skip as typeof it);
}
