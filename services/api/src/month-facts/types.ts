import { MONTH_FACTS_FORMULA_VERSION } from "./vocab";

export type BudgetItemStatus = "paid" | "partial" | "pending" | "over";

export type MonthFactsFixedItem = {
  commitmentId?: string;
  titleHe: string;
  categoryKey: string;
  expected: number;
  actual: number;
  status: BudgetItemStatus;
  /** ACCOUNT (default) or CREDIT_CARD standing. */
  payVia?: "ACCOUNT" | "CREDIT_CARD";
  creditCardId?: string | null;
  /** YYYY-MM — first month this commitment applies (null = from forever). */
  startMonth?: string | null;
  endMonth?: string | null;
};

/**
 * Canonical monthly numbers. All product surfaces must read these fields
 * (or a thin projection) — never re-sum the month with a different formula.
 */
export type MonthFacts = {
  formulaVersion: typeof MONTH_FACTS_FORMULA_VERSION;
  month: string;
  scope: {
    start: string;
    end: string;
  };
  /** Live BANK balance — not as-of month end. */
  checkingBalanceNow: number;
  flows: {
    income: number;
    /** EXPENSE excluding goal_funding */
    expense: number;
    allocatedToGoals: number;
    /** income − expense (living only; goals not subtracted) */
    net: number;
    /** income − expense − allocatedToGoals (checking drain for the month) */
    netAfterGoals: number;
  };
  budget: {
    fixed: {
      expectedTotal: number;
      actualTotal: number;
      basisForLeftover: "expected" | "actual";
      items: MonthFactsFixedItem[];
    };
    flexible: {
      actualTotal: number;
      cap: number | null;
      remainingToCap: number | null;
      byCategory: Array<{
        key: string;
        labelHe: string;
        amount: number;
      }>;
    };
    afterFixed: number;
    /** Signed leftover for the month. */
    leftover: number;
  };
  /**
   * Liquid cash view (live checking vs obligations still due).
   * Distinct from budget.leftover (monthly pie remainder).
   */
  liquidity: {
    checkingBalanceNow: number;
    reservedForObligations: number;
    availableInPractice: number;
  };
  meta: {
    txCount: number;
    computedAt: string;
    hasCheckingAccount: boolean;
  };
};

/** Legacy dashboard/money shape projected from MonthFacts. */
export type BudgetSnapshotFromFacts = {
  month: string;
  incomeActual: number;
  fixed: MonthFacts["budget"]["fixed"];
  flexible: MonthFacts["budget"]["flexible"];
  afterFixed: number;
  leftover: number;
  allocatedToGoals: number;
};
