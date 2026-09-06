const path = require("path");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

process.env.DATABASE_URL =
  "file:" + path.join(__dirname, "..", "services", "api", "prisma", "dev.db");

async function main() {
  const prisma = new PrismaClient();
  const email = "admin@moneytail.local";
  const password = "Pa$$word";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      displayName: "Admin",
      role: "ADMIN",
    },
    update: {
      passwordHash,
      displayName: "Admin",
      role: "ADMIN",
    },
  });

  console.log(
    JSON.stringify({
      ok: true,
      db: process.env.DATABASE_URL,
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    }),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
