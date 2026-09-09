/**
 * Delete a user (and cascaded data) by email.
 * Usage: npx ts-node -r tsconfig-paths/register scripts/delete-user-by-email.ts email@x.com
 * Or: node -r ts-node/register ... from services/api with DATABASE_URL set.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Usage: delete-user-by-email.ts <email>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`NOT_FOUND ${email}`);
      process.exit(0);
    }
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`DELETED ${email} id=${user.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
