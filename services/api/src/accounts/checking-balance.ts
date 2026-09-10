import type { EconomicRole, TxDirection } from "@prisma/client";

export function cashSignedDelta(
  direction: TxDirection | string,
  amount: number,
  economicRole: EconomicRole | string = "STANDARD",
): number {
  if (economicRole === "CARD_PURCHASE") return 0;
  if (direction === "INCOME") return amount;
  if (direction === "EXPENSE") return -amount;
  return 0;
}

export function cashBalanceFromTransactions(
  transactions: Array<{
    direction: TxDirection | string;
    amount: unknown;
    economicRole?: EconomicRole | string | null;
  }>,
): number {
  return transactions.reduce((sum, transaction) => {
    return (
      sum +
      cashSignedDelta(
        transaction.direction,
        Number(transaction.amount),
        transaction.economicRole ?? "STANDARD",
      )
    );
  }, 0);
}
