const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash("", 10);
  const email = process.argv[2] || "test4@gmail.com";
  const u = await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { passwordHash: hash },
    select: { email: true, displayName: true },
  });
  console.log("password cleared for", u);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
