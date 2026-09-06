const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const txs = await p.transaction.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const now = new Date();
  const ms = new Date(now.getFullYear(), now.getMonth(), 1);
  console.log(
    JSON.stringify(
      {
        now: now.toISOString(),
        monthStart: ms.toISOString(),
        txs: txs.map((t) => ({
          dir: t.direction,
          amt: String(t.amount),
          cat: t.categoryKey,
          booked: t.bookedAt.toISOString().slice(0, 10),
          inMtd: t.bookedAt >= ms,
          src: t.sourceType,
          desc: (t.description || "").slice(0, 60),
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
