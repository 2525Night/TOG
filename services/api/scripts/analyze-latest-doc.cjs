const { PrismaClient } = require("@prisma/client");
const tsNode = require("ts-node");
tsNode.register({
  transpileOnly: true,
  compilerOptions: { module: "commonjs" },
});
const {
  parseUnstructuredText,
  detectStatementPeriod,
  draftQuality,
} = require("../src/documents/extract.ts");

const p = new PrismaClient();

async function main() {
  const docs = await p.document.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      originalName: true,
      status: true,
      importedCount: true,
      createdAt: true,
      sourceKind: true,
      draftJson: true,
      rawText: true,
      userId: true,
    },
  });

  console.log(
    "DOCS",
    JSON.stringify(
      docs.map((d) => ({
        id: d.id,
        name: d.originalName,
        status: d.status,
        imported: d.importedCount,
        kind: d.sourceKind,
        created: d.createdAt,
        hasDraft: !!d.draftJson,
        rawLen: (d.rawText || "").length,
      })),
      null,
      2,
    ),
  );

  const latest =
    docs.find((d) => d.rawText && d.rawText.length > 50) || docs[0];
  if (!latest) {
    console.log("no documents");
    return;
  }

  let draft = latest.draftJson ? JSON.parse(latest.draftJson) : null;
  if (!draft && latest.rawText) {
    draft = parseUnstructuredText(latest.rawText);
  }
  if (!draft) {
    console.log("no draft/raw for", latest.id);
    return;
  }

  const period = latest.rawText
    ? detectStatementPeriod(latest.rawText)
    : {};
  const quality = draftQuality(draft);

  const incomes = draft.filter((r) => r.direction === "INCOME");
  const expenses = draft.filter((r) => r.direction === "EXPENSE");
  const transfers = draft.filter((r) => r.direction === "TRANSFER");
  const low = draft.filter((r) => (r.confidence ?? 1) < 0.45);
  const mid = draft.filter(
    (r) => (r.confidence ?? 1) >= 0.45 && (r.confidence ?? 1) < 0.7,
  );
  const high = draft.filter((r) => (r.confidence ?? 1) >= 0.7);
  const dups = draft.filter((r) => r.duplicate);
  const fakeHeader = incomes.filter((r) => /הפקה|דף חשבון|לתקופה/i.test(r.description));
  const withCat =
    draft.filter((r) => r.categoryKey && r.categoryKey !== "other" && r.categoryKey !== "other_income")
      .length;
  const avgConf =
    draft.reduce((s, r) => s + (r.confidence || 0), 0) / (draft.length || 1);

  // Heuristic success rates vs raw statement lines with dates
  const lines = (latest.rawText || "").split(/\r?\n/).filter((l) =>
    /\d{1,2}[./]\d{1,2}[./]\d{2,4}/.test(l),
  );
  const metaish = lines.filter((l) =>
    /תאריך הפקה|דף חשבון|לתקופה|יתרה מצטברת|סוג תנועה/i.test(l),
  );
  const candidateLines = Math.max(1, lines.length - metaish.length);

  const recallApprox = Math.min(100, Math.round((draft.length / candidateLines) * 100));
  const highConfPct = Math.round((high.length / draft.length) * 100);
  const lowConfPct = Math.round((low.length / draft.length) * 100);
  const categorizedPct = Math.round((withCat / draft.length) * 100);
  const incomeSanity =
    fakeHeader.length === 0 &&
    (incomes.some((r) => /קצבת|משכורת|העברה דיגיטל|הפקד|זכות/i.test(r.description)) ||
      incomes.length === 0);

  console.log(
    "ANALYSIS",
    JSON.stringify(
      {
        document: {
          id: latest.id,
          name: latest.originalName,
          status: latest.status,
          importedCount: latest.importedCount,
          createdAt: latest.createdAt,
          sourceKind: latest.sourceKind,
        },
        period,
        quality,
        counts: {
          total: draft.length,
          income: incomes.length,
          expense: expenses.length,
          transfer: transfers.length,
          lowConf: low.length,
          midConf: mid.length,
          highConf: high.length,
          duplicates: dups.length,
          fakeHeaderIncomes: fakeHeader.length,
          categorizedNonOther: withCat,
          dateLinesInRaw: lines.length,
          metaLinesSkippedApprox: metaish.length,
          candidateLines,
        },
        rates: {
          avgConfidencePct: Math.round(avgConf * 100),
          highConfidencePct: highConfPct,
          needsReviewPct: lowConfPct,
          categorizedPct,
          extractVsDateLinesPct: recallApprox,
          incomeHeaderClean: incomeSanity,
        },
        incomeSample: incomes.slice(0, 12).map((r) => ({
          amount: r.amount,
          desc: r.description,
          cat: r.categoryKey,
          conf: r.confidence,
        })),
        lowConfSample: low.slice(0, 8).map((r) => ({
          dir: r.direction,
          amount: r.amount,
          desc: r.description,
          conf: r.confidence,
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
