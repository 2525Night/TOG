/**
 * Preview / apply repair for duplicate LOAN_PAYMENT rows in one month.
 *
 * Usage (from services/api):
 *   node scripts/repair-duplicate-loan-payments.cjs --email test4@gmail.com --loanId <id> --month 2026-09
 *   node scripts/repair-duplicate-loan-payments.cjs ... --apply
 *
 * Keeps the earliest payment (by createdAt), soft-deletes the rest via Prisma
 * with reverse side-effects on checking balance + loan principal.
 */
const { PrismaClient } = require("@prisma/client");

function parseArgs(argv) {
  const out = { apply: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--email") out.email = argv[++i];
    else if (a === "--loanId") out.loanId = argv[++i];
    else if (a === "--month") out.month = argv[++i];
  }
  return out;
}

function monthBounds(month) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m, 1),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.email || !args.loanId || !/^\d{4}-\d{2}$/.test(args.month || "")) {
    console.error(
      "Required: --email <email> --loanId <id> --month YYYY-MM [--apply]",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { email: args.email.toLowerCase() },
    });
    if (!user) throw new Error(`User not found: ${args.email}`);

    const loan = await prisma.loan.findFirst({
      where: { id: args.loanId, userId: user.id },
    });
    if (!loan) throw new Error(`Loan not found: ${args.loanId}`);

    const { start, end } = monthBounds(args.month);
    const pays = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        loanId: args.loanId,
        economicRole: "LOAN_PAYMENT",
        bookedAt: { gte: start, lt: end },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (pays.length <= 1) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            message: "No duplicates — nothing to repair",
            count: pays.length,
            loanPrincipal: Number(loan.principalBalance),
          },
          null,
          2,
        ),
      );
      return;
    }

    const keep = pays[0];
    const remove = pays.slice(1);
    const refund = remove.reduce((s, t) => s + Number(t.amount), 0);
    const bank = await prisma.financialAccount.findFirst({
      where: { userId: user.id, isActive: true, kind: "BANK" },
      orderBy: { createdAt: "asc" },
    });

    const preview = {
      apply: args.apply,
      email: user.email,
      month: args.month,
      loanId: loan.id,
      loanName: loan.name,
      keep: {
        id: keep.id,
        amount: Number(keep.amount),
        createdAt: keep.createdAt.toISOString(),
      },
      remove: remove.map((t) => ({
        id: t.id,
        amount: Number(t.amount),
        createdAt: t.createdAt.toISOString(),
      })),
      checkingBefore: bank ? Number(bank.currentBalance) : null,
      checkingDelta: refund,
      checkingAfter:
        bank != null ? Number(bank.currentBalance) + refund : null,
      principalBefore: Number(loan.principalBalance),
      principalDelta: refund,
      principalAfter: Number(loan.principalBalance) + refund,
      note:
        "Deleting duplicates restores checking cash and adds principal back; if loan was already at 0, principal rises by refund until you adjust.",
    };

    console.log(JSON.stringify(preview, null, 2));

    if (!args.apply) {
      console.error("\nPreview only. Re-run with --apply to execute.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const t of remove) {
        const amt = Number(t.amount);
        if (t.accountId) {
          await tx.financialAccount.update({
            where: { id: t.accountId },
            data: { currentBalance: { increment: amt } },
          });
        } else if (bank) {
          await tx.financialAccount.update({
            where: { id: bank.id },
            data: { currentBalance: { increment: amt } },
          });
        }
        const currentLoan = await tx.loan.findUnique({
          where: { id: loan.id },
        });
        const nextPrincipal = Number(currentLoan.principalBalance) + amt;
        await tx.loan.update({
          where: { id: loan.id },
          data: { principalBalance: nextPrincipal },
        });
        await tx.transaction.delete({ where: { id: t.id } });
      }

      // If the loan was already fully repaid before repair, keep principal at 0
      // (duplicate payments only drained checking; they did not create real principal).
      if (Number(loan.principalBalance) <= 0.001) {
        await tx.loan.update({
          where: { id: loan.id },
          data: { principalBalance: 0, nextDueDate: null },
        });
      } else {
        const cur = await tx.loan.findUnique({ where: { id: loan.id } });
        if (cur && Number(cur.principalBalance) <= 0.001) {
          await tx.loan.update({
            where: { id: loan.id },
            data: { nextDueDate: null },
          });
        }
      }

      await tx.auditEvent.create({
        data: {
          userId: user.id,
          action: "REPAIR_DUPLICATE_LOAN_PAYMENTS",
          meta: JSON.stringify({
            loanId: loan.id,
            month: args.month,
            removedIds: remove.map((t) => t.id),
            keptId: keep.id,
            refund,
          }),
        },
      });
    });

    // If principal was 0 and we restored refund, bring principal back to 0
    // when original intent was "fully repaid" with one payment kept.
    const after = await prisma.loan.findUnique({ where: { id: loan.id } });
    const bankAfter = bank
      ? await prisma.financialAccount.findUnique({ where: { id: bank.id } })
      : null;
    console.log(
      JSON.stringify(
        {
          applied: true,
          principalAfter: after ? Number(after.principalBalance) : null,
          checkingAfter: bankAfter
            ? Number(bankAfter.currentBalance)
            : null,
          hint:
            "If principal should stay 0 (loan fully repaid), set principalBalance=0 and nextDueDate=null manually or via UI.",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
