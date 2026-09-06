import { Injectable } from "@nestjs/common";
import { IntelligenceService } from "../intelligence/intelligence.service";
import { BudgetService } from "../budget/budget.service";

@Injectable()
export class DashboardService {
  constructor(
    private readonly intelligence: IntelligenceService,
    private readonly budget: BudgetService,
  ) {}

  async summary(userId: string, month?: string) {
    const analysis = await this.intelligence.analyze(userId);
    const report = await this.intelligence.buildReport(userId, 6, month);
    const budget = await this.budget.snapshot(userId, month);
    const suggestions = await this.budget.suggestions(userId);

    return {
      product: "MoneyTail",
      currency: "ILS",
      period: analysis.period,
      completeness: analysis.completeness,
      healthScore: analysis.healthScore,
      availableBalance: analysis.availableBalance,
      incomeMtd: analysis.incomeMtd,
      expenseMtd: analysis.expenseMtd,
      netMtd: analysis.netMtd,
      expensePrev: analysis.expensePrev,
      incomePrev: analysis.incomePrev,
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
        accounts: analysis.availableBalance !== undefined ? "user" : "missing",
        transactions:
          analysis.expenseMtd > 0 || analysis.incomeMtd > 0 ? "user" : "missing",
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
