import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SourceType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { categoryLabelHe, categoryNature } from "./nature";
import { MonthFactsService } from "../month-facts/month-facts.service";
import type { BudgetItemStatus } from "../month-facts/types";

export type { BudgetItemStatus };

/** @deprecated Prefer MonthFacts; kept for API compatibility. */
export type BudgetSnapshot = {
  month: string;
  incomeActual: number;
  fixed: {
    expectedTotal: number;
    actualTotal: number;
    basisForLeftover: "expected" | "actual";
    items: Array<{
      commitmentId?: string;
      titleHe: string;
      categoryKey: string;
      expected: number;
      actual: number;
      status: BudgetItemStatus;
      payVia?: "ACCOUNT" | "CREDIT_CARD";
      creditCardId?: string | null;
      startMonth?: string | null;
      endMonth?: string | null;
    }>;
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
  leftover: number;
  allocatedToGoals: number;
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  /** Thin projection of MonthFacts — single calculation path. */
  async snapshot(userId: string, month?: string): Promise<BudgetSnapshot> {
    return this.monthFacts.asBudgetSnapshot(userId, month);
  }

  listCommitments(userId: string) {
    return this.prisma.budgetCommitment.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async createCommitment(
    userId: string,
    body: {
      titleHe: string;
      categoryKey: string;
      expectedAmount: number;
      merchantNorm?: string;
      nature?: "FIXED" | "PERIODIC";
      cadence?: "MONTHLY" | "YEARLY";
      anchorDay?: number;
      startMonth?: string | null;
      endMonth?: string | null;
      untilGoal?: boolean;
      payVia?: "ACCOUNT" | "CREDIT_CARD";
      creditCardId?: string | null;
    },
    options: {
      sourceType?: SourceType;
      auditAction?: string;
    } = {},
  ) {
    const payVia = body.payVia === "CREDIT_CARD" ? "CREDIT_CARD" : "ACCOUNT";
    let creditCardId: string | null = null;
    if (payVia === "CREDIT_CARD") {
      if (!body.creditCardId) {
        throw new BadRequestException("נא לבחור כרטיס להוראת קבע באשראי");
      }
      const card = await this.prisma.creditCard.findFirst({
        where: { id: body.creditCardId, userId, active: true },
      });
      if (!card) throw new NotFoundException("כרטיס לא נמצא");
      creditCardId = card.id;
    }

    const created = await this.prisma.budgetCommitment.create({
      data: {
        userId,
        titleHe: body.titleHe,
        categoryKey: body.categoryKey,
        merchantNorm: body.merchantNorm || null,
        nature: body.nature || "FIXED",
        expectedAmount: new Prisma.Decimal(body.expectedAmount),
        cadence: body.cadence || "MONTHLY",
        payVia,
        creditCardId,
        anchorDay: body.anchorDay ?? null,
        startMonth: body.startMonth ?? null,
        endMonth: body.endMonth ?? null,
        untilGoal: body.untilGoal ?? false,
        sourceType: options.sourceType ?? SourceType.USER_INPUT,
        userConfirmed: true,
        active: true,
      },
    });
    if (options.auditAction) {
      await this.prisma.auditEvent.create({
        data: {
          userId,
          action: options.auditAction,
          meta: JSON.stringify({
            commitmentId: created.id,
            sourceType: created.sourceType,
          }),
        },
      });
    }
    return created;
  }

  async suggestions(userId: string) {
    const from = new Date();
    from.setMonth(from.getMonth() - 4);
    const txs = await this.prisma.transaction.findMany({
      where: {
        userId,
        direction: "EXPENSE",
        bookedAt: { gte: from },
        merchantNorm: { not: null },
      },
      orderBy: { bookedAt: "asc" },
    });

    const existing = await this.prisma.budgetCommitment.findMany({
      where: { userId, active: true },
      select: { merchantNorm: true, categoryKey: true },
    });
    const existingKeys = new Set(
      existing.map((e) => `${e.merchantNorm || ""}|${e.categoryKey}`),
    );

    type Agg = {
      merchantNorm: string;
      categoryKey: string;
      amounts: number[];
      months: Set<string>;
      titleHe: string;
    };
    const map = new Map<string, Agg>();
    for (const t of txs) {
      const norm = t.merchantNorm || "";
      if (!norm) continue;
      const key = `${norm}|${t.categoryKey}`;
      if (existingKeys.has(key)) continue;
      const nature = categoryNature(t.categoryKey);
      if (nature !== "fixed" && nature !== "periodic") continue;
      let agg = map.get(key);
      if (!agg) {
        agg = {
          merchantNorm: norm,
          categoryKey: t.categoryKey,
          amounts: [],
          months: new Set(),
          titleHe: t.description || categoryLabelHe(t.categoryKey),
        };
        map.set(key, agg);
      }
      agg.amounts.push(Number(t.amount));
      agg.months.add(monthKey(new Date(t.bookedAt)));
    }

    const out: Array<{
      titleHe: string;
      categoryKey: string;
      merchantNorm: string;
      expectedAmount: number;
      monthsSeen: number;
    }> = [];

    for (const agg of map.values()) {
      if (agg.months.size < 2) continue;
      const avg =
        agg.amounts.reduce((a, b) => a + b, 0) / agg.amounts.length;
      const stable = agg.amounts.every(
        (a) => Math.abs(a - avg) / Math.max(avg, 1) <= 0.05,
      );
      if (!stable && agg.months.size < 3) continue;
      out.push({
        titleHe: agg.titleHe.slice(0, 80),
        categoryKey: agg.categoryKey,
        merchantNorm: agg.merchantNorm,
        expectedAmount: Math.round(avg * 100) / 100,
        monthsSeen: agg.months.size,
      });
    }

    return out
      .sort((a, b) => b.expectedAmount - a.expectedAmount)
      .slice(0, 8);
  }

  async confirmSuggestion(
    userId: string,
    body: {
      titleHe: string;
      categoryKey: string;
      merchantNorm: string;
      expectedAmount: number;
    },
  ) {
    return this.createCommitment(userId, {
      titleHe: body.titleHe,
      categoryKey: body.categoryKey,
      merchantNorm: body.merchantNorm,
      expectedAmount: body.expectedAmount,
      nature: "FIXED",
      cadence: "MONTHLY",
    });
  }

  async setFlexibleCap(userId: string, flexibleCap: number | null) {
    return this.prisma.userBudgetSettings.upsert({
      where: { userId },
      create: {
        userId,
        flexibleCap:
          flexibleCap == null ? null : new Prisma.Decimal(flexibleCap),
      },
      update: {
        flexibleCap:
          flexibleCap == null ? null : new Prisma.Decimal(flexibleCap),
      },
    });
  }

  async deactivateCommitment(userId: string, id: string) {
    const row = await this.prisma.budgetCommitment.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException("התחייבות לא נמצאה");
    return this.prisma.budgetCommitment.update({
      where: { id },
      data: { active: false },
    });
  }
}
