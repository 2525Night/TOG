const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const docs = await p.document.findMany({
    where: { status: "CONFIRMED" },
    orderBy: { createdAt: "desc" },
  });

  let removedTx = 0;
  let undoneDocs = 0;

  for (const doc of docs) {
    const txs = await p.transaction.findMany({
      where: { userId: doc.userId, sourceReference: doc.id },
    });

    const byAccount = new Map();
    for (const t of txs) {
      if (!t.accountId) continue;
      let d = byAccount.get(t.accountId) || 0;
      const amt = Number(t.amount);
      if (t.direction === "INCOME") d -= amt;
      if (t.direction === "EXPENSE") d += amt;
      byAccount.set(t.accountId, d);
    }

    await p.transaction.deleteMany({
      where: { userId: doc.userId, sourceReference: doc.id },
    });
    removedTx += txs.length;

    for (const [accountId, delta] of byAccount) {
      await p.financialAccount.update({
        where: { id: accountId },
        data: { currentBalance: { increment: delta } },
      });
    }

    await p.document.update({
      where: { id: doc.id },
      data: {
        status: "REJECTED",
        importedCount: null,
        draftJson: null,
        rawText: null,
        filePath: null,
      },
    });
    undoneDocs += 1;
  }

  // Also remove orphan FILE_UPLOAD txs without matching confirm flow
  const orphans = await p.transaction.findMany({
    where: { sourceType: "FILE_UPLOAD" },
  });
  if (orphans.length) {
    const byAccount = new Map();
    for (const t of orphans) {
      if (!t.accountId) continue;
      let d = byAccount.get(t.accountId) || 0;
      const amt = Number(t.amount);
      if (t.direction === "INCOME") d -= amt;
      if (t.direction === "EXPENSE") d += amt;
      byAccount.set(t.accountId, d);
    }
    await p.transaction.deleteMany({ where: { sourceType: "FILE_UPLOAD" } });
    removedTx += orphans.length;
    for (const [accountId, delta] of byAccount) {
      await p.financialAccount.update({
        where: { id: accountId },
        data: { currentBalance: { increment: delta } },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        undoneDocs,
        removedTx,
        remainingFileUploads: await p.transaction.count({
          where: { sourceType: "FILE_UPLOAD" },
        }),
        confirmedDocs: await p.document.count({
          where: { status: "CONFIRMED" },
        }),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
