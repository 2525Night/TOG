import { Injectable } from "@nestjs/common";
import { DashboardService } from "../dashboard/dashboard.service";
import { PrismaService } from "../prisma/prisma.service";
import { RoeyForecastService } from "./roey-forecast.service";
import { RoeyJourneyService } from "./roey-journey.service";
import type { RoeyFact } from "./roey.types";

export const DEFAULT_ROEY_PROFILE = {
  primaryGoal: null,
  tone: "BALANCED",
  assertiveness: "ASSERTIVE",
  notificationMode: "IMPORTANT_ONLY",
  memoryEnabled: true,
  onboardingSeen: false,
} as const;

@Injectable()
export class RoeyContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly journeyService: RoeyJourneyService,
    private readonly forecastService: RoeyForecastService,
  ) {}

  async build(userId: string, month?: string) {
    const [summary, journey, storedProfile] = await Promise.all([
      this.dashboard.summary(userId, month),
      this.journeyService.forUser(userId),
      this.prisma.roeyProfile.findUnique({ where: { userId } }),
    ]);
    const profile = storedProfile ?? DEFAULT_ROEY_PROFILE;
    const signalsReliable =
      journey.signalsReliable &&
      summary.completeness >= 45 &&
      summary.dataGaps.length === 0 &&
      (summary.monthFacts.meta.txCount ?? 0) >= 3;
    const forecast = this.forecastService.build({
      startingAvailable: summary.liquidity.availableInPractice,
      expectedIncome: summary.cashFlowForecast.expectedIncome,
      expectedFixedExpenses:
        summary.cashFlowForecast.expectedFixedExpenses,
      expectedFlexibleExpenses:
        summary.cashFlowForecast.expectedFlexibleBuffer,
      completeness: summary.completeness,
      signalsReliable,
    });
    const risk = this.forecastService.risk(forecast);
    const factsUsed = this.facts(summary);

    return {
      context: {
        product: "MoneyTail5",
        currency: "ILS",
        requestedMonth: summary.monthFacts.month,
        profile: {
          primaryGoal: profile.primaryGoal,
          tone: profile.tone,
          assertiveness: profile.assertiveness,
          memoryEnabled: profile.memoryEnabled,
        },
        journey,
        dataQuality: {
          completeness: summary.completeness,
          signalsReliable,
          gaps: summary.dataGaps.slice(0, 3).map((gap) => ({
            titleHe: gap.titleHe,
            bodyHe: gap.bodyHe,
          })),
        },
        facts: factsUsed,
        risk,
        forecast,
        attention: summary.attention.slice(0, 3).map((item) => ({
          conclusionHe: item.conclusionHe,
          meaningHe: item.meaningHe,
          moneyLineHe: item.moneyLineHe,
          severity: item.severity,
        })),
        goals: summary.goals.slice(0, 3).map((goal) => ({
          title: goal.title,
          targetAmount: goal.targetAmount,
          currentAmount: goal.currentAmount,
          progressPct: goal.progressPct,
        })),
      },
      journey: { ...journey, signalsReliable },
      forecast,
      risk,
      factsUsed,
    };
  }

  private facts(summary: Awaited<ReturnType<DashboardService["summary"]>>) {
    const values: RoeyFact[] = [
      {
        id: "available-in-practice",
        labelHe: "זמין בפועל",
        value: summary.liquidity.availableInPractice,
        displayHe: formatIls(summary.liquidity.availableInPractice),
        source: "MonthFacts.liquidity.availableInPractice",
      },
      {
        id: "checking-balance",
        labelHe: "יתרת עו״ש",
        value: summary.liquidity.checkingBalanceNow,
        displayHe: formatIls(summary.liquidity.checkingBalanceNow),
        source: "MonthFacts.liquidity.checkingBalanceNow",
      },
      {
        id: "reserved",
        labelHe: "שמור להתחייבויות",
        value: summary.liquidity.reservedForObligations,
        displayHe: formatIls(summary.liquidity.reservedForObligations),
        source: "MonthFacts.liquidity.reservedForObligations",
      },
      {
        id: "income",
        labelHe: "הכנסות בחודש",
        value: summary.incomeMtd,
        displayHe: formatIls(summary.incomeMtd),
        source: "MonthFacts.flows.income",
      },
      {
        id: "expense",
        labelHe: "הוצאות בחודש",
        value: summary.expenseMtd,
        displayHe: formatIls(summary.expenseMtd),
        source: "MonthFacts.flows.expense",
      },
      {
        id: "debt-principal",
        labelHe: "סך יתרות אשראי והלוואות",
        value: summary.debtsSummary.principalTotal,
        displayHe: formatIls(summary.debtsSummary.principalTotal),
        source: "Dashboard.debtsSummary.principalTotal",
      },
    ];
    return values;
  }
}

function formatIls(value: number) {
  return `₪${Math.round(value).toLocaleString("he-IL")}`;
}
