const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const tsNode = require("ts-node");
tsNode.register({
  transpileOnly: true,
  compilerOptions: { module: "commonjs" },
});
const {
  parseUnstructuredText,
  detectStatementPeriod,
  draftQuality,
  extractTextFromPdf,
} = require("../src/documents/extract.ts");

const p = new PrismaClient();

async function main() {
  const doc = await p.document.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!doc) {
    console.log("no doc");
    return;
  }

  const txs = await p.transaction.findMany({
    where: { sourceReference: doc.id },
    orderBy: { bookedAt: "asc" },
  });

  const incomes = txs.filter((t) => t.direction === "INCOME");
  const expenses = txs.filter((t) => t.direction === "EXPENSE");
  const transfers = txs.filter((t) => t.direction === "TRANSFER");
  const fakeHeader = incomes.filter((t) =>
    /הפקה|דף חשבון|לתקופה/i.test(t.description || ""),
  );
  const categorized = txs.filter(
    (t) =>
      t.categoryKey &&
      t.categoryKey !== "other" &&
      t.categoryKey !== "other_income",
  );
  const withConf = txs.filter((t) => t.confidence != null);
  const avgConf = withConf.length
    ? withConf.reduce((s, t) => s + (t.confidence || 0), 0) / withConf.length
    : null;
  const highConf = withConf.filter((t) => (t.confidence || 0) >= 0.7);
  const lowConf = withConf.filter((t) => (t.confidence || 0) < 0.45);

  // Re-parse from kept file if available
  let reparse = null;
  if (doc.filePath && fs.existsSync(doc.filePath)) {
    const buf = fs.readFileSync(doc.filePath);
    const text = await extractTextFromPdf(buf);
    const draft = parseUnstructuredText(text);
    const period = detectStatementPeriod(text);
    reparse = {
      period,
      quality: draftQuality(draft),
      incomes: draft
        .filter((r) => r.direction === "INCOME")
        .map((r) => ({
          amount: r.amount,
          desc: r.description,
          cat: r.categoryKey,
          conf: r.confidence,
        })),
      fakeHeader: draft.filter(
        (r) =>
          r.direction === "INCOME" &&
          /הפקה|דף חשבון|לתקופה/i.test(r.description),
      ).length,
      total: draft.length,
      avgConf: Math.round(
        (draft.reduce((s, r) => s + (r.confidence || 0), 0) /
          (draft.length || 1)) *
          100,
      ),
    };
  }

  // Also check uploads folder for recent files matching name
  const uploadRoot = path.join(process.cwd(), ".data", "uploads");
  let uploadFiles = [];
  if (fs.existsSync(uploadRoot)) {
    uploadFiles = fs
      .readdirSync(uploadRoot)
      .filter((f) => /tnuot|pdf/i.test(f))
      .slice(-5);
  }

  console.log(
    JSON.stringify(
      {
        document: {
          id: doc.id,
          name: doc.originalName,
          status: doc.status,
          importedCount: doc.importedCount,
          createdAt: doc.createdAt,
          storageMode: doc.storageMode,
          fileKept: !!doc.filePath,
          filePath: doc.filePath,
        },
        committed: {
          total: txs.length,
          income: incomes.length,
          expense: expenses.length,
          transfer: transfers.length,
          fakeHeaderIncomes: fakeHeader.length,
          categorizedNonOther: categorized.length,
          categorizedPct: txs.length
            ? Math.round((categorized.length / txs.length) * 100)
            : 0,
          withConfidence: withConf.length,
          avgConfidencePct:
            avgConf != null ? Math.round(avgConf * 100) : null,
          highConfPct: withConf.length
            ? Math.round((highConf.length / withConf.length) * 100)
            : null,
          needsReviewPct: withConf.length
            ? Math.round((lowConf.length / withConf.length) * 100)
            : null,
          incomeSample: incomes.slice(0, 15).map((t) => ({
            amount: Number(t.amount),
            desc: t.description,
            cat: t.categoryKey,
            conf: t.confidence,
            date: t.bookedAt.toISOString().slice(0, 10),
          })),
          expenseTop: [...expenses]
            .sort((a, b) => Number(b.amount) - Number(a.amount))
            .slice(0, 8)
            .map((t) => ({
              amount: Number(t.amount),
              desc: t.description,
              cat: t.categoryKey,
            })),
        },
        reparse,
        uploadFiles,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
