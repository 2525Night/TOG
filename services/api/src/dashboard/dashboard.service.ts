import { Injectable } from "@nestjs/common";
import { IntelligenceService } from "../intelligence/intelligence.service";
import { BudgetService } from "../budget/budget.service";
import { MonthFactsService } from "../month-facts/month-facts.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  monthBounds,
  resolveMonthKey,
  toBudgetSnapshot,
} from "../month-facts/compute";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly intelligence: IntelligenceService,
    private readonly budget: BudgetService,
    private readonly monthFacts: MonthFactsService,
    private readonly prisma: PrismaService,
  ) {}

  async summary(userId: string, month?: string) {
    const focus = resolveMonthKey(month);
    const { start: focusStart, end: focusEnd } = monthBounds(focus);
    const monthsBack = 6;
    const monthKeys: string[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(
        focusStart.getFullYear(),
        focusStart.getMonth() - i,
        1,
      );
      monthKeys.push(monthKey(d));
    }
    const prevKey = monthKeys[monthKeys.length - 2] ?? monthKeys[0];
    const lookbackStart = new Date(
      focusStart.getFullYear(),
      focusStart.getMonth() - 2,
      1,
    );
    const reportLookbackStart = new Date(
      focusStart.getFullYear(),
      focusStart.getMonth() - (monthsBack - 1),
      1,
    );

    // One series + one tx window — shared by analyze and report.
    const [factsList, txs, suggestions, loans, cards, emergency] =
      await Promise.all([
        this.monthFacts.series(userId, monthKeys),
        this.prisma.transaction.findMany({
          where: {
            userId,
            bookedAt: {
              gte:
                reportLookbackStart < lookbackStart
                  ? reportLookbackStart
                  : lookbackStart,
              lt: focusEnd,
            },
          },
          orderBy: { bookedAt: "asc" },
        }),
        this.budget.suggestions(userId),
        this.prisma.loan.findMany({
          where: { userId, active: true },
        }),
        this.prisma.creditCard.findMany({
          where: { userId, active: true },
        }),
        this.prisma.goal.findFirst({
          where: { userId, kind: "EMERGENCY" },
        }),
      ]);

    const facts =
      factsList.find((f) => f.month === focus) ??
      (await this.monthFacts.forMonth(userId, focus));
    const prevFacts =
      factsList.find((f) => f.month === prevKey) ??
      (await this.monthFacts.forMonth(userId, prevKey));

    const monthTx = txs.filter((t) => {
      const d = new Date(t.bookedAt);
      return d >= focusStart && d < focusEnd;
    });
    const recentTx = txs.filter(
      (t) => new Date(t.bookedAt) >= lookbackStart,
    );

    const [analysis, report] = await Promise.all([
      this.intelligence.analyze(userId, focus, {
        facts,
        prevFacts,
        monthTx,
        recentTx,
      }),
      this.intelligence.buildReport(userId, monthsBack, focus, {
        factsList,
        txs,
      }),
    ]);

    const budget = toBudgetSnapshot(facts);
    const debtPrincipal =
      loans.reduce((s, l) => s + Number(l.principalBalance), 0) +
      cards.reduce((s, c) => s + Number(c.currentBalance), 0) +
      (facts.checkingBalanceNow < 0
        ? Math.abs(facts.checkingBalanceNow)
        : 0);

    return {
      product: "MoneyTail",
      currency: "ILS",
      formulaVersion: facts.formulaVersion,
      monthFacts: facts,
      period: analysis.period,
      completeness: analysis.completeness,
      healthScore: analysis.healthScore,
      availableBalance: facts.checkingBalanceNow,
      liquidity: facts.liquidity,
      incomeMtd: facts.flows.income,
      expenseMtd: facts.flows.expense,
      allocatedToGoalsMtd: facts.flows.allocatedToGoals,
      netMtd: facts.flows.netAfterGoals,
      netOperatingMtd: facts.flows.net,
      expensePrev: report.mom?.expense.previous ?? analysis.expensePrev,
      incomePrev: report.mom?.income.previous ?? analysis.incomePrev,
      topCategories: analysis.topCategories,
      overdraftRisk: analysis.overdraftRisk,
      dataGaps: analysis.dataGaps,
      cashFlowForecast: analysis.cashFlowForecast,
      patterns: analysis.patterns,
      alerts: analysis.alerts,
      attention: analysis.attention,
      recommendations: analysis.recommendations,
      goals: analysis.goals,
      debtsSummary: {
        principalTotal: Math.round(debtPrincipal * 100) / 100,
        count:
          loans.length +
          cards.length +
          (facts.checkingBalanceNow < 0 ? 1 : 0),
        loansPrincipal:
          Math.round(
            loans.reduce((s, l) => s + Number(l.principalBalance), 0) * 100,
          ) / 100,
        cardsBalance:
          Math.round(
            cards.reduce((s, c) => s + Number(c.currentBalance), 0) * 100,
          ) / 100,
      },
      emergencyCushion: emergency
        ? {
            id: emergency.id,
            title: emergency.title,
            targetAmount: Number(emergency.targetAmount),
            currentAmount: Number(emergency.currentAmount),
            progressPct: Math.min(
              100,
              Math.round(
                (Number(emergency.currentAmount) /
                  Math.max(Number(emergency.targetAmount), 1)) *
                  100,
              ),
            ),
            full:
              Number(emergency.currentAmount) >=
              Number(emergency.targetAmount) - 0.01,
            remaining: Math.max(
              0,
              Number(emergency.targetAmount) -
                Number(emergency.currentAmount),
            ),
          }
        : null,
      reservePrompt:
        !emergency &&
        facts.budget.leftover > 0 &&
        facts.checkingBalanceNow >= 0,
      mom: report.mom,
      monthlySeries: report.monthlySeries,
      categoryBreakdown: report.categoryBreakdown,
      expenseByNature: report.expenseByNature,
      budget,
      budgetSuggestions: suggestions.slice(0, 3),
      narrativeHe: report.narrativeHe,
      freshness: {
        accounts: "user",
        transactions:
          facts.flows.expense > 0 || facts.flows.income > 0
            ? "user"
            : "missing",
        banks: "not_connected",
        noteHe:
          "אין חיבור בנק פעיל (אין רישיון Open Banking). הנתונים מבוססים על הזנה ידנית/מסמכים.",
      },
      assistant: {
        name: "Roey",
        available: false,
        noteHe:
          "רועי יהיה זמין כעוזר אופציונלי בשלב הבא — לא כמסך הראשי.",
      },
    };
  }
}
