import type { MonthFacts } from "./types";

const EPS = 0.02;

function near(a: number, b: number) {
  return Math.abs(a - b) <= EPS;
}

export type InvariantFailure = { code: string; detail: string };

/** Structural trust checks — every MonthFacts payload must pass. */
export function checkMonthFactsInvariants(
  facts: MonthFacts,
): InvariantFailure[] {
  const fails: InvariantFailure[] = [];
  const { flows, budget } = facts;

  if (!near(flows.net, flows.income - flows.expense)) {
    fails.push({
      code: "net_ne_income_minus_expense",
      detail: `net=${flows.net} income=${flows.income} expense=${flows.expense}`,
    });
  }

  if (
    !near(
      flows.netAfterGoals,
      flows.income - flows.expense - flows.allocatedToGoals,
    )
  ) {
    fails.push({
      code: "net_after_goals",
      detail: `netAfterGoals=${flows.netAfterGoals}`,
    });
  }

  const fixedUsed =
    budget.fixed.basisForLeftover === "expected"
      ? budget.fixed.expectedTotal
      : budget.fixed.actualTotal;
  const expectedLeftover =
    flows.income - fixedUsed - budget.flexible.actualTotal - flows.allocatedToGoals;
  if (!near(budget.leftover, expectedLeftover)) {
    fails.push({
      code: "leftover_formula",
      detail: `leftover=${budget.leftover} expected=${round2(expectedLeftover)} basis=${budget.fixed.basisForLeftover}`,
    });
  }

  if (!near(budget.afterFixed, flows.income - fixedUsed)) {
    fails.push({
      code: "after_fixed",
      detail: `afterFixed=${budget.afterFixed} income-fixed=${round2(flows.income - fixedUsed)}`,
    });
  }

  // Living expenses should equal fixed(actual path components) + flexible
  // when basis is actual: fixed.actual + flexible ≈ expense
  if (budget.fixed.basisForLeftover === "actual") {
    const parts = budget.fixed.actualTotal + budget.flexible.actualTotal;
    if (!near(parts, flows.expense)) {
      fails.push({
        code: "expense_ne_fixed_plus_flexible",
        detail: `expense=${flows.expense} fixed+flex=${round2(parts)}`,
      });
    }
  }

  if (flows.expense < -EPS || flows.income < -EPS || flows.allocatedToGoals < -EPS) {
    fails.push({
      code: "negative_flow",
      detail: JSON.stringify(flows),
    });
  }

  const { liquidity } = facts;
  if (liquidity.reservedForObligations < -EPS) {
    fails.push({
      code: "reserved_negative",
      detail: `reserved=${liquidity.reservedForObligations}`,
    });
  }
  if (
    !near(
      liquidity.availableInPractice,
      liquidity.checkingBalanceNow - liquidity.reservedForObligations,
    )
  ) {
    fails.push({
      code: "available_in_practice",
      detail: `available=${liquidity.availableInPractice} check=${liquidity.checkingBalanceNow} reserved=${liquidity.reservedForObligations}`,
    });
  }
  if (!near(liquidity.checkingBalanceNow, facts.checkingBalanceNow)) {
    fails.push({
      code: "liquidity_balance_mismatch",
      detail: `liquidity.checking=${liquidity.checkingBalanceNow} top=${facts.checkingBalanceNow}`,
    });
  }

  const itemsActualSum = budget.fixed.items.reduce((s, i) => s + i.actual, 0);
  if (!near(itemsActualSum, budget.fixed.actualTotal)) {
    fails.push({
      code: "fixed_items_ne_actual_total",
      detail: `itemsSum=${round2(itemsActualSum)} actualTotal=${budget.fixed.actualTotal}`,
    });
  }

  return fails;
}

export function assertMonthFactsInvariants(facts: MonthFacts) {
  const fails = checkMonthFactsInvariants(facts);
  if (fails.length) {
    throw new Error(
      `MonthFacts invariants failed (${facts.month}): ${fails
        .map((f) => f.code)
        .join(", ")}`,
    );
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
