const path = require("path");
const { PrismaClient } = require("@prisma/client");

process.env.DATABASE_URL =
  "file:" + path.join(__dirname, "..", "services", "api", "prisma", "dev.db");

async function main() {
  const prisma = new PrismaClient();
  const result = await prisma.user.updateMany({
    data: { onboardingCompleted: true },
  });
  console.log(JSON.stringify({ marked: result.count }));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
