const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const doc = await p.document.findFirst({ orderBy: { createdAt: "desc" } });
  const txs = await p.transaction.findMany({
    where: { sourceReference: doc.id },
    orderBy: { bookedAt: "asc" },
  });

  let amountInDesc = 0;
  let suspiciousBalanceLike = 0;
  let directionLooksWrong = 0;
  const issues = [];

  for (const t of txs) {
    const desc = t.description || "";
    const amt = Number(t.amount);
    const moneyInDesc = [...desc.matchAll(/(-?[\d,]+(?:\.\d{1,2})?)/g)].map(
      (m) => Number(m[1].replace(/,/g, "")),
    );
    if (moneyInDesc.some((n) => Number.isFinite(n) && Math.abs(n) >= 1)) {
      amountInDesc++;
    }
    // If description embeds a smaller amount and row amount is much larger → likely balance grabbed
    const embedded = moneyInDesc.find(
      (n) => Number.isFinite(n) && Math.abs(n) >= 1 && Math.abs(n - amt) > 1,
    );
    if (embedded != null && amt > Math.abs(embedded) * 1.5) {
      suspiciousBalanceLike++;
      if (issues.length < 12) {
        issues.push({
          type: "amount_vs_embedded",
          dir: t.direction,
          amount: amt,
          embedded,
          desc,
          date: t.bookedAt.toISOString().slice(0, 10),
        });
      }
    }
    // Credit words as expense or debit words as income
    if (
      t.direction === "EXPENSE" &&
      /זכות|זיכוי|הפקד/i.test(desc) &&
      !/עמל|כרטיס|חובה/i.test(desc)
    ) {
      directionLooksWrong++;
      if (issues.length < 20) {
        issues.push({
          type: "dir_expense_but_credit_lex",
          amount: amt,
          desc,
        });
      }
    }
    if (
      t.direction === "INCOME" &&
      /משיכת|עמל|כרטיס דביט|הרשאה ישראכרט|טפחות|משכנת/i.test(desc)
    ) {
      directionLooksWrong++;
      if (issues.length < 20) {
        issues.push({
          type: "dir_income_but_expense_lex",
          amount: amt,
          desc,
        });
      }
    }
  }

  const months = {};
  for (const t of txs) {
    const k = t.bookedAt.toISOString().slice(0, 7);
    months[k] = months[k] || { income: 0, expense: 0, n: 0 };
    months[k].n++;
    const a = Number(t.amount);
    if (t.direction === "INCOME") months[k].income += a;
    if (t.direction === "EXPENSE") months[k].expense += a;
  }

  console.log(
    JSON.stringify(
      {
        name: doc.originalName,
        total: txs.length,
        amountTokenInDescriptionPct: Math.round(
          (amountInDesc / txs.length) * 100,
        ),
        suspiciousBalanceLikePct: Math.round(
          (suspiciousBalanceLike / txs.length) * 100,
        ),
        suspiciousBalanceLikeCount: suspiciousBalanceLike,
        directionLexConflictPct: Math.round(
          (directionLooksWrong / txs.length) * 100,
        ),
        directionLexConflictCount: directionLooksWrong,
        months,
        issues,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
