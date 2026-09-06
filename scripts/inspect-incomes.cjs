const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const incomes = await p.transaction.findMany({
    where: { direction: "INCOME" },
    orderBy: { bookedAt: "desc" },
    take: 20,
  });
  console.log(
    "INCOMES",
    JSON.stringify(
      incomes.map((t) => ({
        amt: String(t.amount),
        cat: t.categoryKey,
        booked: t.bookedAt.toISOString().slice(0, 10),
        desc: t.description,
        srcType: t.sourceType,
        srcRef: t.sourceReference,
      })),
      null,
      2,
    ),
  );

  const uploads = await p.transaction.findMany({
    where: { sourceType: "FILE_UPLOAD" },
    orderBy: { bookedAt: "desc" },
    take: 30,
  });
  console.log(
    "UPLOAD_SAMPLE",
    JSON.stringify(
      uploads.map((t) => ({
        dir: t.direction,
        amt: String(t.amount),
        cat: t.categoryKey,
        booked: t.bookedAt.toISOString().slice(0, 10),
        desc: (t.description || "").slice(0, 80),
      })),
      null,
      2,
    ),
  );

  const docs = await p.document.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  for (const d of docs) {
    console.log("\n=== DOC", d.id, d.status, d.originalName, "===");
    console.log("rawLen", (d.rawText || "").length);
    if (d.rawText) console.log("--- RAW ---\n", d.rawText.slice(0, 4000));
    if (d.draftJson) {
      const draft = JSON.parse(d.draftJson);
      const inc = draft.filter((r) => r.direction === "INCOME");
      console.log("draft total", draft.length, "income", inc.length);
      console.log("INCOME DRAFT", JSON.stringify(inc, null, 2));
    }
  }
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
