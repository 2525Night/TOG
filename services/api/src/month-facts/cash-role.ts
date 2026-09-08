/**
 * Economic-role helpers shared by MonthFacts recon and intelligence signals.
 * Keep cash semantics in one place when adding roles later.
 */

export function affectsCheckingBalance(
  economicRole: string | null | undefined,
): boolean {
  // Card purchases hit the card ledger only until settlement.
  return economicRole !== "CARD_PURCHASE";
}

export type CashSpendTx = {
  direction: string;
  categoryKey: string;
  economicRole?: string | null;
};

/** Outflow that actually left checking (for payday / cash patterns). */
export function countsAsCashSpend(tx: CashSpendTx): boolean {
  if (tx.direction !== "EXPENSE") return false;
  if (tx.categoryKey === "goal_funding") return false;
  if (tx.economicRole === "CARD_PURCHASE") return false;
  return true;
}
