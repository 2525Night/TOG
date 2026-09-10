import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MonthFactsService } from "../month-facts/month-facts.service";

@Injectable()
export class RoeyReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  async scheduleAction(userId: string, proposalId: string) {
    const proposal = await this.prisma.roeyActionProposal.findFirst({
      where: { id: proposalId, userId, status: "EXECUTED" },
    });
    if (!proposal) throw new NotFoundException("הפעולה שבוצעה לא נמצאה");
    return this.prisma.roeyOutcomeReconciliation.upsert({
      where: { proposalId },
      create: {
        userId,
        proposalId,
        type: "ACTION_POSTCONDITION",
        expectedJson: JSON.stringify({
          type: proposal.type,
          payload: parseJson(proposal.payloadJson),
          result: parseJson(proposal.resultJson),
        }),
        dueAt: new Date(),
      },
      update: {},
    });
  }

  async scheduleForecast(
    userId: string,
    runId: string,
    forecast: {
      scenarios: Array<{
        id: string;
        points: Array<{ days: number; projectedAvailable: number }>;
      }>;
    },
  ) {
    const expected = forecast.scenarios
      .find((scenario) => scenario.id === "BASE")
      ?.points.find((point) => point.days === 30);
    if (!expected) return null;
    return this.prisma.roeyOutcomeReconciliation.upsert({
      where: { forecastRunId: runId },
      create: {
        userId,
        forecastRunId: runId,
        type: "FORECAST_DAY_30",
        expectedJson: JSON.stringify(expected),
        dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
      },
      update: {},
    });
  }

  async reconcileDue(userId: string) {
    const due = await this.prisma.roeyOutcomeReconciliation.findMany({
      where: { userId, status: "PENDING", dueAt: { lte: new Date() } },
      orderBy: { dueAt: "asc" },
      take: 20,
    });
    for (const item of due) {
      if (item.proposalId) await this.reconcileAction(item.id, item.proposalId);
      else if (item.forecastRunId) {
        await this.reconcileForecast(userId, item.id);
      }
    }
    return this.list(userId);
  }

  list(userId: string) {
    return this.prisma.roeyOutcomeReconciliation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  private async reconcileAction(id: string, proposalId: string) {
    const proposal = await this.prisma.roeyActionProposal.findUnique({
      where: { id: proposalId },
    });
    const result = parseJson(proposal?.resultJson);
    const payload = parseJson(proposal?.payloadJson);
    let matched = false;
    let actual: unknown = null;
    if (proposal?.type === "ADD_TRANSACTION") {
      const transactionId = objectString(result, "transactionId");
      actual = transactionId
        ? await this.prisma.transaction.findUnique({
            where: { id: transactionId },
          })
        : null;
      matched = Boolean(actual);
    } else if (proposal?.type === "CREATE_COMMITMENT") {
      const commitmentId = objectString(result, "commitmentId");
      actual = commitmentId
        ? await this.prisma.budgetCommitment.findUnique({
            where: { id: commitmentId },
          })
        : null;
      matched = Boolean(actual);
    } else if (proposal?.type === "CHANGE_TRANSACTION_CATEGORY") {
      const transactionId = objectString(result, "transactionId");
      actual = transactionId
        ? await this.prisma.transaction.findUnique({
            where: { id: transactionId },
          })
        : null;
      matched =
        Boolean(actual) &&
        objectString(actual, "categoryKey") ===
          objectString(payload, "categoryKey");
    } else if (proposal?.type === "ALLOCATE_SURPLUS_TO_GOAL") {
      const transactionId = objectString(result, "transactionId");
      actual = transactionId
        ? await this.prisma.transaction.findUnique({
            where: { id: transactionId },
          })
        : null;
      matched = Boolean(actual);
    }
    await this.prisma.roeyOutcomeReconciliation.update({
      where: { id },
      data: {
        status: matched ? "MATCHED" : "DIVERGED",
        actualJson: JSON.stringify(safeRecord(actual)),
        varianceJson: JSON.stringify({ matched }),
        reconciledAt: new Date(),
      },
    });
  }

  private async reconcileForecast(userId: string, id: string) {
    const row = await this.prisma.roeyOutcomeReconciliation.findUnique({
      where: { id },
    });
    if (!row) return;
    const expected = parseJson(row.expectedJson);
    const projected = objectNumber(expected, "projectedAvailable");
    const actual = (await this.monthFacts.forMonth(userId)).liquidity
      .availableInPractice;
    const variance = projected == null ? null : actual - projected;
    const tolerance =
      projected == null ? 0 : Math.max(100, Math.abs(projected) * 0.1);
    const matched = variance != null && Math.abs(variance) <= tolerance;
    await this.prisma.roeyOutcomeReconciliation.update({
      where: { id },
      data: {
        status: matched ? "MATCHED" : "DIVERGED",
        actualJson: JSON.stringify({ availableInPractice: actual }),
        varianceJson: JSON.stringify({
          projectedAvailable: projected,
          actualAvailable: actual,
          variance,
          tolerance,
        }),
        reconciledAt: new Date(),
      },
    });
    if (!matched) await this.flagPlanReview(userId, variance);
  }

  private async flagPlanReview(userId: string, variance: number | null) {
    const plan = await this.prisma.userFinancialPlan.findUnique({
      where: { userId },
    });
    if (!plan) return;
    await this.prisma.$transaction([
      this.prisma.userFinancialPlan.update({
        where: { id: plan.id },
        data: { reviewAt: new Date() },
      }),
      this.prisma.financialPlanEvent.create({
        data: {
          planId: plan.id,
          version: plan.version,
          type: "FORECAST_VARIANCE",
          summaryHe:
            "התוצאה בפועל סטתה מהתחזית ונדרשת בדיקה מחדש של התוכנית.",
          changesJson: JSON.stringify({ variance }),
          source: "RECONCILIATION",
        },
      }),
    ]);
  }
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function objectString(value: unknown, key: string) {
  return value &&
    typeof value === "object" &&
    key in value &&
    typeof value[key as keyof typeof value] === "string"
    ? (value[key as keyof typeof value] as string)
    : null;
}

function objectNumber(value: unknown, key: string) {
  return value &&
    typeof value === "object" &&
    key in value &&
    typeof value[key as keyof typeof value] === "number"
    ? (value[key as keyof typeof value] as number)
    : null;
}

function safeRecord(value: unknown) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as unknown;
}
