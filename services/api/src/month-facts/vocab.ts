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
  checkingBalanceNowUi: {
    he: "בחשבון",
    meaning: "Same as checkingBalanceNow — short UI label.",
  },
  reservedForObligations: {
    he: "שמור לתשלומים",
    meaning:
      "Money still needed for unpaid fixed commitments and unlinked debt/card obligations due in the focus month (live due/billing dates). Not a historical end-of-month snapshot. Not free to spend.",
  },
  availableInPractice: {
    he: "זמין בפועל",
    meaning:
      "checkingBalanceNow − reservedForObligations. Liquid cash after obligations; may be negative. When viewing a past month, reserve still follows live due/billing — not what was reserved at month end.",
  },
} as const;

/** Bump when leftover / expense / net / liquidity formulas change. */
export const MONTH_FACTS_FORMULA_VERSION = "v1.1" as const;
