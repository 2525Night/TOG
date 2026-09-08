import { computeMonthFacts } from "./compute";
import { checkMonthFactsInvariants } from "./invariants";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function fixtureBase() {
  const start = new Date(2026, 2, 1);
  const end = new Date(2026, 3, 1);
  return { month: "2026-03", start, end, checkingBalanceNow: 10000 };
}

/** Self-check fixtures — run via npm run test:month-facts */
export function runMonthFactsSelfCheck() {
  // 1) Simple actual month: income / expense / leftover
  {
    const facts = computeMonthFacts({
      ...fixtureBase(),
      txs: [
        {
          id: "1",
          direction: "INCOME",
          amount: 10000,
          categoryKey: "salary",
        },
        {
          id: "2",
          direction: "EXPENSE",
          amount: 3000,
          categoryKey: "housing",
          description: "שכירות",
          merchantNorm: "rent",
        },
        {
          id: "3",
          direction: "EXPENSE",
          amount: 500,
          categoryKey: "food",
        },
        {
          id: "4",
          direction: "EXPENSE",
          amount: 1000,
          categoryKey: "goal_funding",
        },
      ],
      commitments: [
        {
          id: "c1",
          titleHe: "שכירות",
          categoryKey: "housing",
          expectedAmount: 3000,
          cadence: "MONTHLY",
          merchantNorm: "rent",
        },
      ],
      userCats: [],
      flexibleCap: null,
    });
    assert(facts.flows.income === 10000, "income");
    assert(facts.flows.expense === 3500, "expense excl goals");
    assert(facts.flows.allocatedToGoals === 1000, "goals");
    assert(facts.flows.net === 6500, "net");
    assert(facts.flows.netAfterGoals === 5500, "net after goals");
    assert(facts.budget.leftover === 5500, "leftover 10000-3000-500-1000");
    assert(facts.budget.fixed.basisForLeftover === "actual", "basis actual");
    const fails = checkMonthFactsInvariants(facts);
    assert(fails.length === 0, JSON.stringify(fails));
  }

  // 2) Early month: expected fixed basis
  {
    const facts = computeMonthFacts({
      ...fixtureBase(),
      txs: [
        {
          id: "1",
          direction: "INCOME",
          amount: 10000,
          categoryKey: "salary",
        },
      ],
      commitments: [
        {
          id: "c1",
          titleHe: "שכירות",
          categoryKey: "housing",
          expectedAmount: 4000,
          cadence: "MONTHLY",
          merchantNorm: "rent",
        },
      ],
      userCats: [],
      flexibleCap: null,
    });
    assert(facts.budget.fixed.basisForLeftover === "expected", "expected basis");
    assert(facts.budget.leftover === 6000, "leftover uses expected fixed");
    assert(checkMonthFactsInvariants(facts).length === 0, "invariants early");
  }

  // 3) Deficit leftover
  {
    const facts = computeMonthFacts({
      ...fixtureBase(),
      txs: [
        {
          id: "1",
          direction: "INCOME",
          amount: 1000,
          categoryKey: "salary",
        },
        {
          id: "2",
          direction: "EXPENSE",
          amount: 2000,
          categoryKey: "food",
        },
      ],
      commitments: [],
      userCats: [],
      flexibleCap: null,
    });
    assert(facts.budget.leftover === -1000, "signed deficit");
    assert(checkMonthFactsInvariants(facts).length === 0, "invariants deficit");
  }

  // 4) Card settlement must not inflate expense
  {
    const facts = computeMonthFacts({
      ...fixtureBase(),
      txs: [
        {
          id: "1",
          direction: "INCOME",
          amount: 10000,
          categoryKey: "salary",
        },
        {
          id: "2",
          direction: "EXPENSE",
          amount: 300,
          categoryKey: "food",
          economicRole: "CARD_PURCHASE",
        },
        {
          id: "3",
          direction: "EXPENSE",
          amount: 3000,
          categoryKey: "other",
          economicRole: "CARD_SETTLEMENT",
        },
      ],
      commitments: [],
      userCats: [],
      flexibleCap: null,
    });
    assert(facts.flows.expense === 300, "settlement excluded from expense");
    assert(checkMonthFactsInvariants(facts).length === 0, "invariants settlement");
  }

  console.log("month-facts self-check: OK");
}

if (require.main === module) {
  runMonthFactsSelfCheck();
}
