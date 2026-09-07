import { Injectable } from "@nestjs/common";
import { IntelligenceService } from "../intelligence/intelligence.service";
import { BudgetService } from "../budget/budget.service";
import { MonthFactsService } from "../month-facts/month-facts.service";
import { toBudgetSnapshot } from "../month-facts/compute";

@Injectable()
export class DashboardService {
  constructor(
    private readonly intelligence: IntelligenceService,
    private readonly budget: BudgetService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  async summary(userId: string, month?: string) {
    const [facts, analysis, report, suggestions] = await Promise.all([
      this.monthFacts.forMonth(userId, month),
      this.intelligence.analyze(userId, month),
      this.intelligence.buildReport(userId, 6, month),
      this.budget.suggestions(userId),
    ]);

    const budget = toBudgetSnapshot(facts);

    return {
      product: "MoneyTail",
      currency: "ILS",
      formulaVersion: facts.formulaVersion,
      monthFacts: facts,
      period: analysis.period,
      completeness: analysis.completeness,
      healthScore: analysis.healthScore,
      availableBalance: facts.checkingBalanceNow,
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
      recommendations: analysis.recommendations,
      goals: analysis.goals,
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
