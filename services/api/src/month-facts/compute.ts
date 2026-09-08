import {
  categoryLabelHe,
  categoryNature,
  type CategoryExtras,
} from "../budget/nature";
import { MONTH_FACTS_FORMULA_VERSION } from "./vocab";
import type {
  BudgetItemStatus,
  MonthFacts,
  MonthFactsFixedItem,
} from "./types";

export type MonthTxInput = {
  id: string;
  direction: string;
  amount: unknown;
  categoryKey: string;
  description?: string | null;
  merchantNorm?: string | null;
  /** When CARD_SETTLEMENT — cash movement only; excluded from flows.expense */
  economicRole?: string | null;
};

export type MonthCommitmentInput = {
  id: string;
  titleHe: string;
  categoryKey: string;
  expectedAmount: unknown;
  cadence: string;
  merchantNorm?: string | null;
  payVia?: string | null;
  creditCardId?: string | null;
  startMonth?: string | null;
  endMonth?: string | null;
};

function commitmentActiveInMonth(
  c: { startMonth?: string | null; endMonth?: string | null },
  month: string,
) {
  if (c.startMonth && /^\d{4}-\d{2}$/.test(c.startMonth) && month < c.startMonth) {
    return false;
  }
  if (c.endMonth && /^\d{4}-\d{2}$/.test(c.endMonth) && month > c.endMonth) {
    return false;
  }
  return true;
}

export type ComputeMonthFactsInput = {
  month: string;
  start: Date;
  end: Date;
  txs: MonthTxInput[];
  commitments: MonthCommitmentInput[];
  userCats: Array<{ key: string; labelHe: string; nature: string }>;
  flexibleCap: number | null;
  checkingBalanceNow: number;
  /** Whether at least one active BANK (or fallback) account exists. */
  hasCheckingAccount?: boolean;
  computedAt?: Date;
  /**
   * Debt installments still due this month that are NOT already covered
   * by a linked BudgetCommitment in fixed remaining.
   */
  extraObligationReserve?: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeMonthFacts(input: ComputeMonthFactsInput): MonthFacts {
  const {
    month,
    start,
    end,
    txs,
    commitments,
    userCats,
    flexibleCap,
    checkingBalanceNow,
  } = input;
  const computedAt = (input.computedAt || new Date()).toISOString();

  const catExtras: CategoryExtras = {
    natures: Object.fromEntries(
      userCats.map((c) => [
        c.key,
        c.nature as "fixed" | "variable" | "periodic",
      ]),
    ),
    labels: Object.fromEntries(userCats.map((c) => [c.key, c.labelHe])),
  };

  const income = txs
    .filter((t) => t.direction === "INCOME")
    .reduce((s, t) => s + Number(t.amount), 0);

  const expenseTxs = txs.filter(
    (t) =>
      t.direction === "EXPENSE" && t.economicRole !== "CARD_SETTLEMENT",
  );

  const budgetCommitments = commitments.filter(
    (c) =>
      c.categoryKey !== "goal_funding" &&
      !(c.merchantNorm || "").startsWith("goal:") &&
      commitmentActiveInMonth(c, month),
  );

  const expectedTotal = budgetCommitments.reduce((s, c) => {
    const amt = Number(c.expectedAmount);
    return s + (c.cadence === "YEARLY" ? amt / 12 : amt);
  }, 0);

  const matchedTxIds = new Set<string>();
  const items: MonthFactsFixedItem[] = budgetCommitments.map((c) => {
    const expected =
      c.cadence === "YEARLY"
        ? Number(c.expectedAmount) / 12
        : Number(c.expectedAmount);
    const matched = expenseTxs.filter((t) => {
      if (matchedTxIds.has(t.id)) return false;
      if (c.merchantNorm) {
        return t.merchantNorm === c.merchantNorm;
      }
      if (t.categoryKey !== c.categoryKey) return false;
      const desc = (t.description || "").trim().toLowerCase();
      const title = c.titleHe.trim().toLowerCase();
      if (!desc || !title) return false;
      return (
        desc === title || desc.includes(title) || title.includes(desc)
      );
    });
    for (const t of matched) matchedTxIds.add(t.id);
    const actual = matched.reduce((s, t) => s + Number(t.amount), 0);
    let status: BudgetItemStatus = "pending";
    if (actual <= 0) status = "pending";
    else if (actual >= expected * 0.95 && actual <= expected * 1.05)
      status = "paid";
    else if (actual > expected * 1.05) status = "over";
    else status = "partial";
    return {
      commitmentId: c.id,
      titleHe: c.titleHe,
      categoryKey: c.categoryKey,
      expected: round2(expected),
      actual: round2(actual),
      status,
      payVia:
        c.payVia === "CREDIT_CARD" ? ("CREDIT_CARD" as const) : ("ACCOUNT" as const),
      creditCardId: c.creditCardId ?? null,
      startMonth: c.startMonth ?? null,
      endMonth: c.endMonth ?? null,
    };
  });

  let fixedActualFromNature = 0;
  let flexibleActual = 0;
  let allocatedToGoals = 0;
  const flexibleByCat: Record<string, number> = {};

  for (const t of expenseTxs) {
    const amt = Number(t.amount);
    if (t.categoryKey === "goal_funding") {
      allocatedToGoals += amt;
      continue;
    }
    const nature = categoryNature(t.categoryKey, catExtras);
    if (matchedTxIds.has(t.id) || nature === "fixed" || nature === "periodic") {
      if (!matchedTxIds.has(t.id)) fixedActualFromNature += amt;
    } else {
      flexibleActual += amt;
      flexibleByCat[t.categoryKey] =
        (flexibleByCat[t.categoryKey] || 0) + amt;
    }
  }

  const fixedActualTotal =
    items.reduce((s, i) => s + i.actual, 0) + fixedActualFromNature;

  const committedCats = new Set(budgetCommitments.map((c) => c.categoryKey));
  const extraFixed: MonthFactsFixedItem[] = [];
  const orphanFixed: MonthFactsFixedItem[] = [];
  const byFixedCat: Record<string, number> = {};
  const orphanByCat: Record<string, number> = {};
  for (const t of expenseTxs) {
    if (matchedTxIds.has(t.id)) continue;
    if (t.categoryKey === "goal_funding") continue;
    const nature = categoryNature(t.categoryKey, catExtras);
    if (nature !== "fixed" && nature !== "periodic") continue;
    const amt = Number(t.amount);
    if (committedCats.has(t.categoryKey)) {
      orphanByCat[t.categoryKey] = (orphanByCat[t.categoryKey] || 0) + amt;
      continue;
    }
    byFixedCat[t.categoryKey] = (byFixedCat[t.categoryKey] || 0) + amt;
  }
  for (const [key, actual] of Object.entries(orphanByCat)) {
    const label = categoryLabelHe(key, catExtras);
    orphanFixed.push({
      titleHe: `${label} — נוספות`,
      categoryKey: key,
      expected: 0,
      actual: round2(actual),
      status: "paid",
    });
  }
  for (const [key, actual] of Object.entries(byFixedCat)) {
    extraFixed.push({
      titleHe: categoryLabelHe(key, catExtras),
      categoryKey: key,
      expected: 0,
      actual: round2(actual),
      status: "paid",
    });
  }

  const allFixedItems = [...items, ...orphanFixed, ...extraFixed].sort(
    (a, b) => b.actual - a.actual || b.expected - a.expected,
  );

  const useExpected = fixedActualTotal < 0.01 && expectedTotal > 0;
  const fixedUsed = useExpected ? expectedTotal : fixedActualTotal;
  const afterFixed = income - fixedUsed;
  const leftover = afterFixed - flexibleActual - allocatedToGoals;
  const expense = expenseTxs
    .filter((t) => t.categoryKey !== "goal_funding")
    .reduce((s, t) => s + Number(t.amount), 0);
  const net = income - expense;
  const netAfterGoals = net - allocatedToGoals;

  const checking = round2(checkingBalanceNow);
  const remainingFixed = Math.max(0, expectedTotal - fixedActualTotal);
  const extraReserve = Math.max(0, Number(input.extraObligationReserve || 0));
  const reservedForObligations = round2(remainingFixed + extraReserve);
  const availableInPractice = round2(checking - reservedForObligations);

  return {
    formulaVersion: MONTH_FACTS_FORMULA_VERSION,
    month,
    scope: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    checkingBalanceNow: checking,
    flows: {
      income: round2(income),
      expense: round2(expense),
      allocatedToGoals: round2(allocatedToGoals),
      net: round2(net),
      netAfterGoals: round2(netAfterGoals),
    },
    budget: {
      fixed: {
        expectedTotal: round2(expectedTotal),
        actualTotal: round2(fixedActualTotal),
        basisForLeftover: useExpected ? "expected" : "actual",
        items: allFixedItems,
      },
      flexible: {
        actualTotal: round2(flexibleActual),
        cap: flexibleCap,
        remainingToCap:
          flexibleCap != null ? round2(flexibleCap - flexibleActual) : null,
        byCategory: Object.entries(flexibleByCat)
          .map(([key, amount]) => ({
            key,
            labelHe: categoryLabelHe(key, catExtras),
            amount: round2(amount),
          }))
          .sort((a, b) => b.amount - a.amount),
      },
      afterFixed: round2(afterFixed),
      leftover: round2(leftover),
    },
    liquidity: {
      checkingBalanceNow: checking,
      reservedForObligations,
      availableInPractice,
    },
    meta: {
      txCount: txs.length,
      computedAt,
      hasCheckingAccount: input.hasCheckingAccount ?? true,
    },
  };
}

export function toBudgetSnapshot(facts: MonthFacts) {
  return {
    month: facts.month,
    incomeActual: facts.flows.income,
    fixed: facts.budget.fixed,
    flexible: facts.budget.flexible,
    afterFixed: facts.budget.afterFixed,
    leftover: facts.budget.leftover,
    allocatedToGoals: facts.flows.allocatedToGoals,
  };
}

export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function resolveMonthKey(month?: string) {
  if (month && /^\d{4}-\d{2}$/.test(month)) return month;
  return monthKey(new Date());
}
