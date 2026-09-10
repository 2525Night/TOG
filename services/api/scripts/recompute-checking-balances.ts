import { Prisma, PrismaClient } from "@prisma/client";
import { cashBalanceFromTransactions } from "../src/accounts/checking-balance";

async function main() {
  const prisma = new PrismaClient();
  const accounts = await prisma.financialAccount.findMany({
    where: { kind: "BANK", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const byUser = new Map<string, typeof accounts>();
  for (const account of accounts) {
    const list = byUser.get(account.userId) ?? [];
    list.push(account);
    byUser.set(account.userId, list);
  }

  let updated = 0;
  for (const [userId, userAccounts] of byUser) {
    const primary = userAccounts[0];
    const txs = await prisma.transaction.findMany({
      where: { userId },
      select: { direction: true, amount: true, economicRole: true },
    });
    const next = cashBalanceFromTransactions(txs);
    const before = Number(primary.currentBalance);
    if (before !== next) {
      await prisma.financialAccount.update({
        where: { id: primary.id },
        data: { currentBalance: new Prisma.Decimal(next) },
      });
      updated += 1;
      console.log(`${userId}: ${before} -> ${next}`);
    }
    for (const extra of userAccounts.slice(1)) {
      if (Number(extra.currentBalance) === 0) continue;
      await prisma.financialAccount.update({
        where: { id: extra.id },
        data: { currentBalance: new Prisma.Decimal(0) },
      });
      updated += 1;
    }
  }

  console.log(
    JSON.stringify({ accounts: accounts.length, users: byUser.size, updated }),
  );
  await prisma.$disconnect();
}

void main();
