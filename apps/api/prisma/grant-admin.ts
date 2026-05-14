import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: tsx prisma/grant-admin.ts <email> [--revoke]");
    process.exit(1);
  }
  const revoke = process.argv.includes("--revoke");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: !revoke },
  });
  console.log(
    `${revoke ? "Revoked" : "Granted"} admin on ${updated.email} (id=${updated.id}, family=${updated.familyId})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
