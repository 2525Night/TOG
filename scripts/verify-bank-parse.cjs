const { PrismaClient } = require("@prisma/client");
const tsNode = require("ts-node");
tsNode.register({
  transpileOnly: true,
  compilerOptions: { module: "commonjs" },
});
const { parseUnstructuredText } = require("../services/api/src/documents/extract.ts");
const p = new PrismaClient();

async function main() {
  const doc = await p.document.findFirst({
    where: { rawText: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!doc?.rawText) {
    console.log("no raw text doc");
    return;
  }
  const rows = parseUnstructuredText(doc.rawText);
  const incomes = rows.filter((r) => r.direction === "INCOME");
  const fake = incomes.filter((r) => /הפקה/i.test(r.description));
  console.log(
    JSON.stringify(
      {
        total: rows.length,
        incomes: incomes.length,
        incomeSample: incomes.slice(0, 10),
        fakeHeaderIncomes: fake.length,
        hasKidsBenefit: incomes.some((r) => /קצבת ילדים/i.test(r.description)),
        hasDigitalTransfer: incomes.some((r) =>
          /העברה דיגיטל/i.test(r.description),
        ),
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
