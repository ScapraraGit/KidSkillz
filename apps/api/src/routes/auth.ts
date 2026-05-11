import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { comparePassword, signToken } from "../lib/auth.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import { getFamilySettings } from "../services/family.js";
import { avatarConfigSchema } from "./children.js";
import type { AvatarConfig } from "@chorechamps/shared";

export const authRouter = Router();

const parentLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/parent/login", async (req, res) => {
  const { email, password } = parentLoginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.role !== "PARENT" || !user.passwordHash) throw HttpError.unauthorized("Invalid credentials");
  if (!user.isActive) throw HttpError.forbidden("Account is inactive");
  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) throw HttpError.unauthorized("Invalid credentials");
  const token = signToken({ sub: user.id, fid: user.familyId, role: user.role });
  res.json({ token, user: serializeUser(user) });
});

const childLoginSchema = z.object({
  childId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  familyPassword: z.string().optional(),
});

authRouter.post("/child/login", async (req, res) => {
  const { childId, pin, familyPassword } = childLoginSchema.parse(req.body);
  const child = await prisma.user.findUnique({ where: { id: childId }, include: { family: true } });
  if (!child || child.role !== "CHILD" || !child.isActive) throw HttpError.unauthorized("Invalid credentials");
  const settings = await getFamilySettings(child.familyId);

  if (settings.childAuthMode === "INDIVIDUAL") {
    if (!pin || child.pin !== pin) throw HttpError.unauthorized("Invalid PIN");
  } else {
    // SHARED_DEVICE: any parent's password unlocks the device + child profile pick
    if (!familyPassword) throw HttpError.unauthorized("Family password required");
    const parents = await prisma.user.findMany({
      where: { familyId: child.familyId, role: "PARENT", isActive: true },
    });
    let ok = false;
    for (const p of parents) {
      if (p.passwordHash && (await comparePassword(familyPassword, p.passwordHash))) {
        ok = true;
        break;
      }
    }
    if (!ok) throw HttpError.unauthorized("Invalid family password");
  }

  const token = signToken({ sub: child.id, fid: child.familyId, role: child.role });
  res.json({ token, user: serializeUser(child) });
});

authRouter.get("/families/lookup", async (req, res) => {
  // For shared-device login screen: list children for a known family.
  // In a real app this would be gated by the device having been unlocked.
  // POC: list non-sensitive child profiles by family name for the demo seed.
  const name = (req.query.name as string | undefined)?.trim();
  if (!name) return res.json({ families: [] });
  const families = await prisma.family.findMany({
    where: { name: { contains: name, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      settings: true,
      users: {
        where: { role: "CHILD", isActive: true },
        select: { id: true, name: true, avatarColor: true, avatarConfig: true },
      },
    },
  });
  res.json({ families });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
  if (!user) throw HttpError.unauthorized();
  const settings = await getFamilySettings(user.familyId);
  res.json({
    user: serializeUser(user),
    settings,
    needsOnboarding: user.onboardedAt == null,
  });
});

authRouter.post("/onboarded", requireAuth, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.auth!.sub },
    data: { onboardedAt: new Date() },
  });
  res.json({ user: serializeUser(user) });
});

const updateAvatarSchema = z.object({
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  avatarConfig: avatarConfigSchema.nullable().optional(),
});

authRouter.patch("/me/avatar", requireAuth, async (req, res) => {
  const input = updateAvatarSchema.parse(req.body);
  if (input.avatarColor === undefined && input.avatarConfig === undefined) {
    throw HttpError.badRequest("Nothing to update");
  }
  const user = await prisma.user.update({
    where: { id: req.auth!.sub },
    data: {
      ...(input.avatarColor !== undefined && { avatarColor: input.avatarColor }),
      ...(input.avatarConfig !== undefined && {
        avatarConfig: input.avatarConfig === null ? Prisma.JsonNull : (input.avatarConfig as object),
      }),
    },
  });
  res.json({ user: serializeUser(user) });
});

function serializeUser(u: import("@prisma/client").User) {
  return {
    id: u.id,
    familyId: u.familyId,
    role: u.role,
    name: u.name,
    email: u.email,
    avatarColor: u.avatarColor,
    avatarConfig: (u.avatarConfig as AvatarConfig | null) ?? null,
    onboardedAt: u.onboardedAt?.toISOString() ?? null,
  };
}
