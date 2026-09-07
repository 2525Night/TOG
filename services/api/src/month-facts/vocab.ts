/**
 * Product vocabulary — single source of meaning for monthly money numbers.
 * UI copy must follow these Hebrew labels; do not invent synonyms per page.
 */
export const MONTH_VOCAB = {
  checkingBalanceNow: {
    he: "יתרה בעו״ש",
    meaning:
      "Current checking (BANK) balance. Live now — not scoped to the selected month.",
  },
  income: {
    he: "הכנסות",
    meaning: "Sum of INCOME transactions in the selected month.",
  },
  expense: {
    he: "הוצאות",
    meaning:
      "Sum of EXPENSE transactions in the month excluding category goal_funding.",
  },
  allocatedToGoals: {
    he: "ליעדים",
    meaning: "Sum of EXPENSE transactions with category goal_funding.",
  },
  net: {
    he: "נטו",
    meaning:
      "income − expense − allocatedToGoals (month cash after living costs and goals). Living-only net is flows.net (netOperating).",
  },
  netOperating: {
    he: "נטו תפעולי",
    meaning: "income − expense (goals not subtracted).",
  },
  leftover: {
    he: "נותר החודש",
    meaning:
      "income − fixedBasis − flexible − allocatedToGoals. Signed; may be negative.",
  },
  freeForGoals: {
    he: "פנוי ליעדים",
    meaning: "max(0, leftover − plannedStanding goal commitments).",
  },
} as const;

/** Bump when leftover / expense / net formulas change. */
export const MONTH_FACTS_FORMULA_VERSION = "v1" as const;
