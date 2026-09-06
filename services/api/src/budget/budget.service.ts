import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { categoryLabelHe, categoryNature } from "./nature";

export type BudgetItemStatus = "paid" | "partial" | "pending" | "over";

export type BudgetSnapshot = {
  month: string;
  incomeActual: number;
  fixed: {
    expectedTotal: number;
    actualTotal: number;
    items: Array<{
      commitmentId?: string;
      titleHe: string;
      categoryKey: string;
      expected: number;
      actual: number;
      status: BudgetItemStatus;
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
  /** Amount already steered to goals this month (category goal_funding). */
  allocatedToGoals: number;
};

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(userId: string, month?: string): Promise<BudgetSnapshot> {
    const focus =
      month && /^\d{4}-\d{2}$/.test(month)
        ? month
        : monthKey(new Date());
    const { start, end } = monthBounds(focus);

    const [txs, commitments, settings, userCats] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId, bookedAt: { gte: start, lt: end } },
      }),
      this.prisma.budgetCommitment.findMany({
        where: { userId, active: true },
      }),
      this.prisma.userBudgetSettings.findUnique({ where: { userId } }),
      this.prisma.userCategory.findMany({ where: { userId } }),
    ]);

    const catExtras = {
      natures: Object.fromEntries(
        userCats.map((c) => [c.key, c.nature as "fixed" | "variable" | "periodic"]),
      ),
      labels: Object.fromEntries(userCats.map((c) => [c.key, c.labelHe])),
    };

    const incomeActual = txs
      .filter((t) => t.direction === "INCOME")
      .reduce((s, t) => s + Number(t.amount), 0);

    const expenseTxs = txs.filter((t) => t.direction === "EXPENSE");

    const budgetCommitments = commitments.filter(
      (c) =>
        c.categoryKey !== "goal_funding" &&
        !(c.merchantNorm || "").startsWith("goal:"),
    );

    const expectedTotal = budgetCommitments.reduce((s, c) => {
      const amt = Number(c.expectedAmount);
      return s + (c.cadence === "YEARLY" ? amt / 12 : amt);
    }, 0);

    type FixedItem = {
      commitmentId?: string;
      titleHe: string;
      categoryKey: string;
      expected: number;
      actual: number;
      status: BudgetItemStatus;
    };

    const matchedTxIds = new Set<string>();
    const items: FixedItem[] = budgetCommitments.map((c) => {
      const expected =
        c.cadence === "YEARLY"
          ? Number(c.expectedAmount) / 12
          : Number(c.expectedAmount);
      const matched = expenseTxs.filter((t) => {
        if (c.merchantNorm) {
          return t.merchantNorm === c.merchantNorm;
        }
        return t.categoryKey === c.categoryKey;
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
        expected: Math.round(expected * 100) / 100,
        actual: Math.round(actual * 100) / 100,
        status,
      };
    });

    // Fixed actual = commitment-matched + other fixed-nature expenses
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

    // Uncommitted fixed categories as synthetic items for visibility
    const committedCats = new Set(budgetCommitments.map((c) => c.categoryKey));
    const extraFixed: FixedItem[] = [];
    const byFixedCat: Record<string, number> = {};
    for (const t of expenseTxs) {
      if (matchedTxIds.has(t.id)) continue;
      const nature = categoryNature(t.categoryKey, catExtras);
      if (nature !== "fixed" && nature !== "periodic") continue;
      if (committedCats.has(t.categoryKey)) continue;
      byFixedCat[t.categoryKey] =
        (byFixedCat[t.categoryKey] || 0) + Number(t.amount);
    }
    for (const [key, actual] of Object.entries(byFixedCat)) {
      extraFixed.push({
        titleHe: categoryLabelHe(key, catExtras),
        categoryKey: key,
        expected: 0,
        actual: Math.round(actual * 100) / 100,
        status: "paid",
      });
    }

    const allFixedItems = [...items, ...extraFixed].sort(
      (a, b) => b.actual - a.actual || b.expected - a.expected,
    );

    const flexibleCap =
      settings?.flexibleCap != null ? Number(settings.flexibleCap) : null;

    const useExpected = fixedActualTotal < 0.01 && expectedTotal > 0;
    const afterFixed = incomeActual - (useExpected ? expectedTotal : fixedActualTotal);
    const leftover = afterFixed - flexibleActual - allocatedToGoals;

    return {
      month: focus,
      incomeActual: Math.round(incomeActual * 100) / 100,
      fixed: {
        expectedTotal: Math.round(expectedTotal * 100) / 100,
        actualTotal: Math.round(fixedActualTotal * 100) / 100,
        items: allFixedItems,
      },
      flexible: {
        actualTotal: Math.round(flexibleActual * 100) / 100,
        cap: flexibleCap,
        remainingToCap:
          flexibleCap != null
            ? Math.round((flexibleCap - flexibleActual) * 100) / 100
            : null,
        byCategory: Object.entries(flexibleByCat)
          .map(([key, amount]) => ({
            key,
            labelHe: categoryLabelHe(key, catExtras),
            amount: Math.round(amount * 100) / 100,
          }))
          .sort((a, b) => b.amount - a.amount),
      },
      allocatedToGoals: Math.round(allocatedToGoals * 100) / 100,
      afterFixed: Math.round(afterFixed * 100) / 100,
      leftover: Math.round(leftover * 100) / 100,
    };
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
    },
  ) {
    return this.prisma.budgetCommitment.create({
      data: {
        userId,
        titleHe: body.titleHe,
        categoryKey: body.categoryKey,
        merchantNorm: body.merchantNorm || null,
        nature: body.nature || "FIXED",
        expectedAmount: new Prisma.Decimal(body.expectedAmount),
        cadence: body.cadence || "MONTHLY",
        anchorDay: body.anchorDay ?? null,
        startMonth: body.startMonth ?? null,
        endMonth: body.endMonth ?? null,
        untilGoal: body.untilGoal ?? false,
        sourceType: "USER_INPUT",
        userConfirmed: true,
        active: true,
      },
    });
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
      existing.map(
        (e) => `${e.merchantNorm || ""}|${e.categoryKey}`,
      ),
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

    return out.sort((a, b) => b.expectedAmount - a.expectedAmount).slice(0, 8);
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
