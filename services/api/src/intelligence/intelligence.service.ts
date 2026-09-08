import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { categoryLabelHe, categoryNature } from "../budget/nature";
import { MonthFactsService } from "../month-facts/month-facts.service";
import type { MonthFacts } from "../month-facts/types";
import { projectLiquidity } from "./project-liquidity";
import { countsAsCashSpend } from "../month-facts/cash-role";

export type IntelligenceTx = {
  id: string;
  direction: string;
  amount: unknown;
  categoryKey: string;
  description: string | null;
  economicRole?: string | null;
  bookedAt: Date;
};

/** Optional preloaded facts/txs to avoid duplicate MonthFacts work on dashboard. */
export type IntelligencePreload = {
  facts?: MonthFacts;
  prevFacts?: MonthFacts;
  factsList?: MonthFacts[];
  monthTx?: IntelligenceTx[];
  recentTx?: IntelligenceTx[];
  txs?: IntelligenceTx[];
};

export type RecPriority = "high" | "medium" | "low";

export type RankedRecommendation = {
  id: string;
  titleHe: string;
  bodyHe: string;
  priority: RecPriority;
  score: number;
  evidence: string[];
  annualImpactIls?: number;
};

export type PatternFinding = {
  id: string;
  titleHe: string;
  bodyHe: string;
  severity: "high" | "medium" | "low";
  categoryKey?: string;
  categoryLabelHe?: string;
};

export type AlertItem = {
  id: string;
  type: string;
  titleHe: string;
  bodyHe: string;
  severity: "high" | "medium" | "low";
  actionable: boolean;
};

/**
 * Light insight contract for dashboard attention (Phase 0).
 * Conclusion → Meaning → money line → one CTA. No LLM / Roey.
 * titleHe/bodyHe are emitted as aliases for alert persistence + older clients.
 */
export type AttentionItem = {
  id: string;
  type: string;
  /** מסקנה — what to understand first */
  conclusionHe: string;
  /** משמעות — plain Hebrew for non-experts */
  meaningHe: string;
  moneyLineHe?: string;
  ctaHe: string;
  href: string;
  severity: "high" | "medium" | "low";
  score: number;
  alertId?: string;
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  async buildReport(
    userId: string,
    monthsBack = 6,
    selectedMonth?: string,
    preload?: IntelligencePreload,
  ) {
    const now = new Date();
    const period = await this.resolveFocusPeriod(userId, now);
    const months = Math.min(24, Math.max(2, monthsBack || 6));

    let focusStart = period.focusStart;
    let focusEnd = period.focusEnd;
    if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
      const [y, m] = selectedMonth.split("-").map(Number);
      focusStart = new Date(y, m - 1, 1);
      focusEnd = new Date(y, m, 1);
    }

    const monthKeys: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(
        focusStart.getFullYear(),
        focusStart.getMonth() - i,
        1,
      );
      monthKeys.push(monthKey(d));
    }

    const focusKey = monthKey(focusStart);
    const lookbackStart = new Date(
      focusStart.getFullYear(),
      focusStart.getMonth() - (months - 1),
      1,
    );

    const [factsList, txs, userCats] = await Promise.all([
      preload?.factsList ?? this.monthFacts.series(userId, monthKeys),
      preload?.txs
        ? Promise.resolve(preload.txs)
        : this.prisma.transaction.findMany({
            where: {
              userId,
              bookedAt: {
                gte: lookbackStart,
                lt: focusEnd,
              },
            },
            orderBy: { bookedAt: "asc" },
          }),
      this.prisma.userCategory.findMany({ where: { userId } }),
    ]);

    const catExtras = {
      natures: Object.fromEntries(
        userCats.map((c) => [
          c.key,
          c.nature as "fixed" | "variable" | "periodic",
        ]),
      ),
      labels: Object.fromEntries(userCats.map((c) => [c.key, c.labelHe])),
    };

    const monthlySeries = factsList.map((f) => ({
      month: f.month,
      income: f.flows.income,
      expense: f.flows.expense,
      allocatedToGoals: f.flows.allocatedToGoals,
      net: f.flows.net,
      netAfterGoals: f.flows.netAfterGoals,
      leftover: f.budget.leftover,
    }));

    const focusIdx = monthlySeries.findIndex((m) => m.month === focusKey);
    const current =
      focusIdx >= 0
        ? monthlySeries[focusIdx]
        : monthlySeries[monthlySeries.length - 1] || {
            month: focusKey,
            income: 0,
            expense: 0,
            allocatedToGoals: 0,
            net: 0,
            netAfterGoals: 0,
          };
    const previous =
      focusIdx > 0
        ? monthlySeries[focusIdx - 1]
        : monthlySeries[monthlySeries.length - 2] || {
            income: 0,
            expense: 0,
            allocatedToGoals: 0,
            net: 0,
            netAfterGoals: 0,
          };

    const mom = {
      income: {
        current: current?.income || 0,
        previous: previous.income,
        deltaPct: pctChange(previous.income, current?.income || 0),
      },
      expense: {
        current: current?.expense || 0,
        previous: previous.expense,
        deltaPct: pctChange(previous.expense, current?.expense || 0),
      },
      allocatedToGoals: {
        current: current?.allocatedToGoals || 0,
        previous: previous.allocatedToGoals || 0,
        deltaPct: pctChange(
          previous.allocatedToGoals || 0,
          current?.allocatedToGoals || 0,
        ),
      },
      net: {
        current: current?.netAfterGoals || 0,
        previous: previous.netAfterGoals || 0,
        deltaPct: pctChange(
          previous.netAfterGoals || 0,
          current?.netAfterGoals || 0,
        ),
      },
      netOperating: {
        current: current?.net || 0,
        previous: previous.net || 0,
        deltaPct: pctChange(previous.net || 0, current?.net || 0),
      },
    };

    const focusFacts =
      factsList.find((f) => f.month === focusKey) ||
      (await this.monthFacts.forMonth(userId, focusKey));

    const focusTx = txs.filter(
      (t) =>
        new Date(t.bookedAt) >= focusStart &&
        new Date(t.bookedAt) < focusEnd,
    );

    const expenseByCat: Record<string, number> = {};
    const incomeByCat: Record<string, number> = {};
    for (const t of focusTx) {
      const amount = Number(t.amount);
      if (t.direction === "EXPENSE") {
        if (t.categoryKey === "goal_funding") continue;
        expenseByCat[t.categoryKey] =
          (expenseByCat[t.categoryKey] || 0) + amount;
      } else if (t.direction === "INCOME") {
        incomeByCat[t.categoryKey] =
          (incomeByCat[t.categoryKey] || 0) + amount;
      }
    }

    const toBreakdown = (map: Record<string, number>) => {
      const total = Object.values(map).reduce((a, b) => a + b, 0);
      return Object.entries(map)
        .map(([key, amount]) => ({
          key,
          labelHe: categoryLabelHe(key, catExtras),
          amount,
          sharePct: total ? Math.round((amount / total) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount);
    };

    const categoryBreakdown = toBreakdown(expenseByCat);
    const incomeBreakdown = toBreakdown(incomeByCat);

    const topTransactions = [...focusTx]
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 25)
      .map((t) => ({
        id: t.id,
        direction: t.direction,
        amount: Number(t.amount),
        categoryKey: t.categoryKey,
        categoryLabelHe: categoryLabelHe(t.categoryKey, catExtras),
        description: t.description,
        bookedAt: t.bookedAt.toISOString(),
      }));

    const balanceSheet = {
      month: focusKey,
      incomeTotal: focusFacts.flows.income,
      expenseTotal: focusFacts.flows.expense,
      allocatedToGoals: focusFacts.flows.allocatedToGoals,
      net: focusFacts.flows.netAfterGoals,
      netOperating: focusFacts.flows.net,
      leftover: focusFacts.budget.leftover,
      incomeByCategory: incomeBreakdown,
      expenseByCategory: categoryBreakdown,
      topTransactions,
    };

    const fixedCats: Record<string, number> = {};
    const variableCats: Record<string, number> = {};
    for (const t of focusTx) {
      if (t.direction !== "EXPENSE") continue;
      if (t.categoryKey === "goal_funding") continue;
      const amount = Number(t.amount);
      const nature = categoryNature(t.categoryKey, catExtras);
      if (nature === "fixed" || nature === "periodic") {
        fixedCats[t.categoryKey] = (fixedCats[t.categoryKey] || 0) + amount;
      } else {
        variableCats[t.categoryKey] =
          (variableCats[t.categoryKey] || 0) + amount;
      }
    }
    const toNatureBreakdown = (map: Record<string, number>) => {
      const total = Object.values(map).reduce((a, b) => a + b, 0);
      return {
        total,
        items: Object.entries(map)
          .map(([key, amount]) => ({
            key,
            labelHe: categoryLabelHe(key, catExtras),
            amount,
            sharePct: total ? Math.round((amount / total) * 100) : 0,
          }))
          .sort((a, b) => b.amount - a.amount),
      };
    };
    const expenseByNature = {
      fixed: toNatureBreakdown(fixedCats),
      variable: toNatureBreakdown(variableCats),
    };

    const selectedPeriod = {
      ...period,
      focusStart,
      focusEnd,
      labelHe: focusStart.toLocaleDateString("he-IL", {
        month: "long",
        year: "numeric",
      }),
      isCurrentMonth:
        focusStart.getFullYear() === now.getFullYear() &&
        focusStart.getMonth() === now.getMonth(),
    };

    return {
      monthsBack: months,
      selectedMonth: focusKey,
      formulaVersion: focusFacts.formulaVersion,
      monthFacts: focusFacts,
      period: selectedPeriod,
      monthlySeries,
      mom,
      categoryBreakdown,
      incomeBreakdown,
      balanceSheet,
      expenseByNature,
      narrativeHe: buildNarrative(mom, categoryBreakdown, selectedPeriod),
    };
  }

  async exportBalanceCsv(userId: string, selectedMonth?: string) {
    const report = await this.buildReport(userId, 6, selectedMonth);
    const sheet = report.balanceSheet;
    const month = sheet?.month || report.selectedMonth || "";
    const lines: string[] = [
      "\uFEFFsection,category,amount,direction",
      `summary,income_total,${sheet?.incomeTotal ?? 0},INCOME`,
      `summary,expense_total,${sheet?.expenseTotal ?? 0},EXPENSE`,
      `summary,allocated_to_goals,${sheet?.allocatedToGoals ?? 0},GOALS`,
      `summary,net,${sheet?.net ?? 0},NET`,
    ];
    for (const row of sheet?.incomeByCategory || []) {
      lines.push(
        `income,${csvEscape(row.labelHe)},${row.amount},INCOME`,
      );
    }
    for (const row of sheet?.expenseByCategory || []) {
      lines.push(
        `expense,${csvEscape(row.labelHe)},${row.amount},EXPENSE`,
      );
    }
    for (const t of sheet?.topTransactions || []) {
      lines.push(
        `tx,${csvEscape(t.description || t.categoryLabelHe)},${t.amount},${t.direction}`,
      );
    }
    return `# MoneyTail balance ${month}\n${lines.join("\n")}\n`;
  }

  async analyze(
    userId: string,
    selectedMonth?: string,
    preload?: IntelligencePreload,
  ) {
    const now = new Date();
    let focusStart: Date;
    let focusEnd: Date;
    let isCurrentMonth: boolean;
    let labelHe: string;
    let monthsNeeded = 6;

    if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
      const [y, m] = selectedMonth.split("-").map(Number);
      focusStart = new Date(y, m - 1, 1);
      focusEnd = new Date(y, m, 1);
      isCurrentMonth =
        focusStart.getFullYear() === now.getFullYear() &&
        focusStart.getMonth() === now.getMonth();
      labelHe = focusStart.toLocaleDateString("he-IL", {
        month: "long",
        year: "numeric",
      });
    } else {
      const resolved = await this.resolveFocusPeriod(userId, now);
      focusStart = resolved.focusStart;
      focusEnd = resolved.focusEnd;
      isCurrentMonth = resolved.isCurrentMonth;
      labelHe = resolved.labelHe;
      monthsNeeded = resolved.monthsNeeded;
    }

    const period = {
      isCurrentMonth,
      focusStart,
      focusEnd,
      labelHe,
      monthsNeeded,
    };
    const prevStart = new Date(
      focusStart.getFullYear(),
      focusStart.getMonth() - 1,
      1,
    );
    const lookbackStart = new Date(
      focusStart.getFullYear(),
      focusStart.getMonth() - 2,
      1,
    );

    const focusMonthKey = monthKey(focusStart);
    const prevMonthKey = monthKey(prevStart);

    const [facts, prevFacts, goals, monthTx, recentTx, silenced] =
      await Promise.all([
        preload?.facts ?? this.monthFacts.forMonth(userId, focusMonthKey),
        preload?.prevFacts ??
          this.monthFacts.forMonth(userId, prevMonthKey),
        this.prisma.goal.findMany({ where: { userId } }),
        preload?.monthTx
          ? Promise.resolve(preload.monthTx)
          : this.prisma.transaction.findMany({
              where: {
                userId,
                bookedAt: { gte: focusStart, lt: focusEnd },
              },
            }),
        preload?.recentTx
          ? Promise.resolve(preload.recentTx)
          : this.prisma.transaction.findMany({
              where: { userId, bookedAt: { gte: lookbackStart } },
            }),
        this.prisma.alert.findMany({
          where: {
            userId,
            OR: [
              { dismissed: true },
              { snoozedUntil: { gt: now } },
            ],
          },
          select: { type: true, dismissed: true, snoozedUntil: true },
        }),
      ]);

    const silencedTypes = new Set(silenced.map((a) => a.type));
    const availableBalance = facts.checkingBalanceNow;
    const incomeMtd = facts.flows.income;
    const expenseMtd = facts.flows.expense;
    const allocatedToGoalsMtd = facts.flows.allocatedToGoals;
    const expensePrev = prevFacts.flows.expense;
    const incomePrev = prevFacts.flows.income;
    const netMtd = facts.flows.net;
    const leftover = facts.budget.leftover;
    const fixedExpected = facts.budget.fixed.expectedTotal;
    const fixedActual = facts.budget.fixed.actualTotal;
    const remainingFixed = Math.max(0, fixedExpected - fixedActual);

    const byCategoryMonth = groupExpense(monthTx);
    const topCategories = Object.entries(byCategoryMonth)
      .map(([key, amount]) => ({
        key,
        labelHe: categoryLabelHe(key),
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    const daysInMonth = new Date(
      focusStart.getFullYear(),
      focusStart.getMonth() + 1,
      0,
    ).getDate();
    const day = period.isCurrentMonth
      ? Math.max(now.getDate(), 1)
      : daysInMonth;
    const daysLeft = Math.max(daysInMonth - day, 0);
    const flexibleSoFar = facts.budget.flexible.actualTotal;
    const flexiblePace =
      day > 0 ? (flexibleSoFar / day) * daysInMonth : flexibleSoFar;
    const remainingFlexibleGuess = Math.max(0, flexiblePace - flexibleSoFar);
    const liquidityProj = projectLiquidity({
      checkingBalanceNow: facts.checkingBalanceNow,
      availableInPractice: facts.liquidity.availableInPractice,
      remainingFixed,
      remainingFlexibleGuess,
      isCurrentMonth: period.isCurrentMonth,
    });
    const projectedOutflow = liquidityProj.projectedOutflow;
    const endBalanceProjected = liquidityProj.endBalanceProjected;

    let overdraftRisk: {
      level: "high" | "medium" | "low";
      messageHe: string;
      alreadyNegative: boolean;
    } = {
      level: liquidityProj.level,
      messageHe: liquidityProj.messageHe,
      alreadyNegative: liquidityProj.alreadyNegative,
    };

    const dataGaps: Array<{
      id: string;
      titleHe: string;
      bodyHe: string;
      ctaHe: string;
      href: string;
    }> = [];
    const prevTxCount = prevFacts.meta.txCount;
    if (monthTx.length === 0) {
      dataGaps.push({
        id: "empty-month",
        titleHe: "בחודש זה עדיין אין תנועות",
        bodyHe:
          "בלי תנועות אי אפשר לחשב מאזן אמיתי — ייבאו דף חשבון או הוסיפו תנועה אחת.",
        ctaHe: "לייבוא",
        href: `/app/money?tab=import&month=${focusMonthKey}`,
      });
    } else if (expenseMtd > 0 && incomeMtd <= 0) {
      dataGaps.push({
        id: "missing-income",
        titleHe: "חסרות הכנסות בחודש",
        bodyHe:
          "יש הוצאות בלי הכנסות רשומות — המספרים עלולים להטעות עד שתוסיפו הכנסה או ייבוא.",
        ctaHe: "הוספת הכנסה / ייבוא",
        href: `/app/money?tab=import&month=${focusMonthKey}`,
      });
    } else if (prevTxCount >= 5 && monthTx.length <= 2) {
      dataGaps.push({
        id: "sparse-month",
        titleHe: "התמונה עדיין חלקית",
        bodyHe:
          "יש מעט תנועות יחסית לחודש הקודם — אולי חסר ייבוא. בינתיים לא נציג אזהרות חזקות.",
        ctaHe: "לייבוא",
        href: `/app/money?tab=import&month=${focusMonthKey}`,
      });
    }

    const signalsReliable =
      dataGaps.length === 0 &&
      incomeMtd > 0 &&
      monthTx.length >= 3;

    const recurring = detectRecurring(recentTx);
    const commitments = await this.prisma.budgetCommitment.findMany({
      where: { userId, active: true },
    });
    const commitmentExpected = commitments.reduce((s, c) => {
      const amt = Number(c.expectedAmount);
      return s + (c.cadence === "YEARLY" ? amt / 12 : amt);
    }, 0);
    const recurringExpected = recurring
      .slice(0, 12)
      .reduce((s, r) => s + r.amount, 0);
    const expectedFixedNext =
      fixedExpected > 0
        ? fixedExpected
        : commitmentExpected > 0
          ? commitmentExpected
          : recurringExpected;
    const incomeAvg =
      (incomeMtd + incomePrev) / (incomeMtd > 0 && incomePrev > 0 ? 2 : 1) ||
      incomeMtd ||
      incomePrev;
    const cashFlowForecast = {
      nextMonthLabelHe: new Date(
        focusStart.getFullYear(),
        focusStart.getMonth() + 1,
        1,
      ).toLocaleDateString("he-IL", { month: "long", year: "numeric" }),
      expectedIncome: Math.round(incomeAvg * 100) / 100,
      expectedFixedExpenses: Math.round(expectedFixedNext * 100) / 100,
      expectedFlexibleBuffer: Math.round(
        Math.max(expenseMtd - expectedFixedNext, 0) * 100,
      ) / 100,
      projectedNet:
        Math.round((incomeAvg - expectedFixedNext) * 100) / 100,
      items: [
        ...facts.budget.fixed.items.slice(0, 8).map((c) => ({
          titleHe: c.titleHe,
          amount: c.expected,
          source: "commitment" as const,
        })),
        ...(fixedExpected > 0 || commitmentExpected > 0
          ? []
          : recurring.slice(0, 8).map((r) => ({
              titleHe: r.label,
              amount: r.amount,
              source: "recurring" as const,
            }))),
      ],
    };

    const attention: AttentionItem[] = [];
    const patterns: PatternFinding[] = [];
    const recommendations: RankedRecommendation[] = [];
    const monthQ = `month=${focusMonthKey}`;

    // --- Deduped stories from MonthFacts (conclusion → meaning → money → CTA) ---
    const availableInPractice = facts.liquidity.availableInPractice;
    if (
      (signalsReliable || overdraftRisk.alreadyNegative) &&
      overdraftRisk.level !== "low"
    ) {
      pushAttention(attention, {
        id: "overdraft",
        type: "overdraft-forecast",
        conclusionHe: overdraftRisk.alreadyNegative
          ? "החשבון במינוס כרגע"
          : "הזמין בפועל עלול להימתח עד סוף החודש",
        meaningHe: overdraftRisk.messageHe,
        moneyLineHe:
          endBalanceProjected < 0
            ? `פער צפוי ≈ ₪${Math.round(Math.abs(endBalanceProjected)).toLocaleString("he-IL")}`
            : `זמין בפועל ≈ ₪${Math.round(availableInPractice).toLocaleString("he-IL")}`,
        ctaHe: "לתנועות",
        href: `/app/money?${monthQ}`,
        severity: overdraftRisk.level,
        score: overdraftRisk.level === "high" ? 95 : 75,
      });
    }

    if (signalsReliable && leftover < 0) {
      const gap = Math.round(Math.abs(leftover));
      pushAttention(attention, {
        id: "leftover-negative",
        type: "leftover-negative",
        conclusionHe: "החודש חרג מהמסגרת",
        meaningHe:
          "הקבועים והגמיש יחד עברו את ההכנסה לפי חלוקת התקציב — כדאי לבדוק איפה אפשר להאט.",
        moneyLineHe: `נותר ≈ ₪${gap.toLocaleString("he-IL")} מתחת לאפס`,
        ctaHe: "למאזן",
        href: `/app/reports?${monthQ}`,
        severity: gap >= 1000 ? "high" : "medium",
        score: 88,
      });
    }

    const hasOverdraftAttention = attention.some((a) => a.id === "overdraft");
    if (
      signalsReliable &&
      !hasOverdraftAttention &&
      availableInPractice < Math.max(500, facts.liquidity.reservedForObligations * 0.1)
    ) {
      pushAttention(attention, {
        id: "available-tight",
        type: "available-tight",
        conclusionHe:
          availableInPractice < 0
            ? "אין מספיק זמין לתשלומים הקרובים"
            : "נשאר מעט זמין בפועל",
        meaningHe:
          availableInPractice < 0
            ? "מה שבחשבון לא מכסה את מה ששמור לתשלומים — כדאי לעדכן תנועות או לדחות הוצאה גמישה."
            : "אחרי שמור לתשלומים נשאר מעט לשימוש חופשי — כדאי להיזהר מהוצאות גמישות גדולות.",
        moneyLineHe: `זמין בפועל ≈ ₪${Math.round(availableInPractice).toLocaleString("he-IL")}`,
        ctaHe: "לתנועות",
        href: `/app/money?${monthQ}`,
        severity: availableInPractice < 0 ? "high" : "medium",
        score: availableInPractice < 0 ? 90 : 70,
      });
    }

    const overFixed = facts.budget.fixed.items.filter((i) => i.status === "over");
    if (signalsReliable && overFixed.length > 0) {
      const top = [...overFixed].sort(
        (a, b) => b.actual - b.expected - (a.actual - a.expected),
      )[0];
      const delta = Math.round(top.actual - top.expected);
      pushAttention(attention, {
        id: "fixed-over",
        type: `fixed-over-${top.categoryKey}`,
        conclusionHe: `שולם יותר מהצפוי ב«${top.titleHe}»`,
        meaningHe:
          "בקטגוריה הקבועה הזו יצא יותר ממה שתכננתם — לא בהכרח טעות, כדאי להבין למה.",
        moneyLineHe: `≈ ₪${delta.toLocaleString("he-IL")} מעל הצפוי`,
        ctaHe: "לתנועות",
        href: `/app/money?${monthQ}&category=${encodeURIComponent(top.categoryKey)}`,
        severity: delta >= 500 ? "high" : "medium",
        score: 82,
      });
    }

    const flexCap = facts.budget.flexible.cap;
    const flexRemaining = facts.budget.flexible.remainingToCap;
    if (
      signalsReliable &&
      flexCap != null &&
      flexRemaining != null &&
      flexRemaining < 0
    ) {
      const over = Math.round(Math.abs(flexRemaining));
      pushAttention(attention, {
        id: "flexible-over-cap",
        type: "flexible-over-cap",
        conclusionHe: "הגמיש עבר את התקרה שקבעתם",
        meaningHe:
          "הוצאות הגמיש החודש גבוהות מהתקרה — אפשר להאט או לעדכן את התקרה אם היא כבר לא מתאימה.",
        moneyLineHe: `≈ ₪${over.toLocaleString("he-IL")} מעל התקרה · גמיש ₪${Math.round(flexibleSoFar).toLocaleString("he-IL")}`,
        ctaHe: "לתנועות",
        href: `/app/money?${monthQ}`,
        severity: over >= 800 ? "high" : "medium",
        score: 78,
      });
    }

    if (
      signalsReliable &&
      expensePrev > 0 &&
      expenseMtd > expensePrev * 1.15
    ) {
      const delta = Math.round(expenseMtd - expensePrev);
      const pct = Math.round(((expenseMtd - expensePrev) / expensePrev) * 100);
      pushAttention(attention, {
        id: "spend-up",
        type: "spend-up",
        conclusionHe: "ההוצאות גבוהות יותר מהחודש הקודם",
        meaningHe: `עלייה של כ־${pct}% — זה לא בהכרח בעיה, כדאי להבין מה השתנה במאזן.`,
        moneyLineHe: `הפרש ≈ ₪${delta.toLocaleString("he-IL")}`,
        ctaHe: "למאזן",
        href: `/app/reports?${monthQ}`,
        severity: pct >= 30 ? "high" : "medium",
        score: 80 + Math.min(pct, 40),
      });
      patterns.push({
        id: "mom-spend-up",
        titleHe: "ההוצאות גבוהות יותר מהחודש הקודם",
        bodyHe: `עלייה של כ־${pct}% (הפרש ₪${delta.toLocaleString("he-IL")}).`,
        severity: pct >= 30 ? "high" : "medium",
      });
      pushRec(recommendations, {
        id: "spend-up",
        titleHe: "בדקו מה העלה את ההוצאות",
        bodyHe: `ההוצאות עלו בכ־${pct}% מול החודש הקודם — במאזן רואים איפה.`,
        priority: "high",
        score: 80 + Math.min(pct, 40),
        evidence: [`expenseMtd=${expenseMtd}`, `expensePrev=${expensePrev}`],
      });
    }

    if (
      signalsReliable &&
      incomePrev > 0 &&
      incomeMtd > 0 &&
      incomeMtd < incomePrev * 0.85
    ) {
      const drop = Math.round(incomePrev - incomeMtd);
      const pct = Math.round((1 - incomeMtd / incomePrev) * 100);
      pushAttention(attention, {
        id: "income-drop",
        type: "income-drop",
        conclusionHe: "ההכנסה נמוכה יותר מהחודש הקודם",
        meaningHe: `ירידה של כ־${pct}% — אם זה חד־פעמי אפשר להתעלם; אם חוזר, כדאי להתאים קבועים וגמיש.`,
        moneyLineHe: `≈ ₪${drop.toLocaleString("he-IL")} פחות בחודש`,
        ctaHe: "לתנועות",
        href: `/app/money?${monthQ}`,
        severity: "medium",
        score: 72,
      });
    }

    for (const g of goals) {
      const target = Number(g.targetAmount);
      const current = Number(g.currentAmount);
      const remaining = target - current;
      if (remaining <= 0) continue;
      const progress = current / Math.max(target, 1);
      if (
        signalsReliable &&
        progress < 0.15 &&
        leftover <= 0 &&
        incomeMtd > 0
      ) {
        pushAttention(attention, {
          id: `goal-risk-${g.id}`,
          type: `goal-risk-${g.id}`,
          conclusionHe: `ליעד «${g.title}» כמעט אין מקום החודש`,
          meaningHe:
            "אין נותר להקצות ליעד אחרי הקבועים והגמיש — אפשר לחכות לחודש הבא או לצמצם גמיש.",
          moneyLineHe: `נותר בתקציב ≈ ₪${Math.round(leftover).toLocaleString("he-IL")}`,
          ctaHe: "ליעדים",
          href: `/app/goals?${monthQ}`,
          severity: "medium",
          score: 60,
        });
      }
      pushRec(recommendations, {
        id: `goal-${g.id}`,
        titleHe: `התקדמות ליעד: ${g.title}`,
        bodyHe: `נותרו ₪${Math.round(remaining).toLocaleString("he-IL")}.`,
        priority: "medium",
        score: 55 + Math.round((1 - progress) * 20),
        evidence: [`remaining=${remaining}`],
      });
    }

    // Soft patterns (API compat) — not duplicated into attention when unreliable
    if (signalsReliable) {
      const salaryLike = monthTx
        .filter((t) => t.direction === "INCOME" && Number(t.amount) >= 3000)
        .sort((a, b) => Number(b.amount) - Number(a.amount))[0];
      if (salaryLike) {
        const payDay = new Date(salaryLike.bookedAt);
        const windowEnd = new Date(payDay);
        windowEnd.setDate(windowEnd.getDate() + 5);
        const spike = monthTx
          .filter(
            (t) =>
              countsAsCashSpend(t) &&
              new Date(t.bookedAt) >= payDay &&
              new Date(t.bookedAt) <= windowEnd,
          )
          .reduce((s, t) => s + Number(t.amount), 0);
        if (spike > Number(salaryLike.amount) * 0.35 && spike >= 800) {
          patterns.push({
            id: "payday-spike",
            titleHe: "הוצאות גבוהות מיד אחרי הכנסה גדולה",
            bodyHe: `תוך 5 ימים מההכנסה הגדולה יצאו ₪${Math.round(spike).toLocaleString("he-IL")} — כדאי לבדוק אם זה חוזר.`,
            severity: "medium",
          });
        }
      }
    }

    if (
      signalsReliable &&
      leftover > 200 &&
      facts.checkingBalanceNow >= 0 &&
      !(await this.prisma.goal.findFirst({
        where: { userId, kind: "EMERGENCY" },
        select: { id: true },
      }))
    ) {
      pushAttention(attention, {
        id: "cushion-missing",
        type: "cushion-missing",
        conclusionHe: "כדאי להתחיל רזרבה להפתעות",
        meaningHe:
          "יש נותר החודש — סכום קטן שמפרידים מהשוטף עוזר לא לחזור למינוס כשמשהו נשבר.",
        moneyLineHe: `נותר ≈ ₪${Math.round(leftover).toLocaleString("he-IL")}`,
        ctaHe: "ליעדים",
        href: `/app/goals?${monthQ}&reserve=1`,
        severity: "low",
        score: 45,
      });
    }

    if (attention.length === 0 && !signalsReliable && dataGaps.length === 0) {
      pushAttention(attention, {
        id: "add-data",
        type: "add-data",
        conclusionHe: "כדי לקבל תמונה ברורה יותר",
        meaningHe:
          "הוסיפו כמה תנועות או ייבאו דף חשבון — רק אז נוכל להציע מסקנות מדויקות.",
        ctaHe: "לייבוא",
        href: `/app/money?tab=import&${monthQ}`,
        severity: "low",
        score: 20,
      });
    }

    attention.sort((a, b) => b.score - a.score);
    const visibleAttention = attention.filter((a) => !silencedTypes.has(a.type));

    recommendations.sort((a, b) => b.score - a.score);

    let completeness = 15;
    if (facts.meta.hasCheckingAccount) completeness += 20;
    if (monthTx.length >= 3) completeness += 20;
    if (goals.length > 0) completeness += 15;
    if (incomeMtd > 0) completeness += 15;
    if (recentTx.length >= 8) completeness += 15;
    completeness = Math.min(100, completeness);

    const healthScore = Math.round(
      Math.min(
        100,
        Math.max(
          0,
          35 +
            (netMtd >= 0 ? 20 : -12) +
            (leftover >= 0 ? 8 : -8) +
            (goals.length > 0 ? 12 : 0) +
            (facts.meta.hasCheckingAccount ? 12 : 0) +
            (overdraftRisk.level === "low"
              ? 12
              : overdraftRisk.level === "medium"
                ? 0
                : -18) +
            (visibleAttention.some((p) => p.severity === "high") ? -8 : 0) +
            Math.min(10, Math.floor(recentTx.length / 3)),
        ),
      ),
    );

    // Persist open attention as alerts (for snooze/dismiss by type)
    for (const item of visibleAttention.slice(0, 8)) {
      const existing = await this.prisma.alert.findFirst({
        where: {
          userId,
          type: item.type,
          dismissed: false,
        },
        orderBy: { createdAt: "desc" },
      });
      if (
        existing &&
        existing.snoozedUntil &&
        existing.snoozedUntil > now
      ) {
        continue;
      }
      if (!existing) {
        const created = await this.prisma.alert.create({
          data: {
            userId,
            type: item.type,
            titleHe: item.conclusionHe,
            bodyHe: item.meaningHe,
            severity: item.severity,
          },
        });
        item.alertId = created.id;
      } else {
        item.alertId = existing.id;
        await this.prisma.alert.update({
          where: { id: existing.id },
          data: {
            titleHe: item.conclusionHe,
            bodyHe: item.meaningHe,
            severity: item.severity,
          },
        });
      }
    }

    // Drop stale overdraft alerts when current projection is calm.
    if (overdraftRisk.level === "low" && !overdraftRisk.alreadyNegative) {
      await this.prisma.alert.updateMany({
        where: {
          userId,
          type: "overdraft-forecast",
          dismissed: false,
        },
        data: { dismissed: true },
      });
    }

    const openAlerts = await this.prisma.alert.findMany({
      where: {
        userId,
        dismissed: false,
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const attentionOut = visibleAttention.slice(0, 2).map((a) => ({
      id: a.id,
      type: a.type,
      conclusionHe: a.conclusionHe,
      meaningHe: a.meaningHe,
      /** Aliases for older clients / alert list */
      titleHe: a.conclusionHe,
      bodyHe: a.meaningHe,
      moneyLineHe: a.moneyLineHe,
      ctaHe: a.ctaHe,
      href: a.href,
      severity: a.severity,
      score: a.score,
      alertId:
        a.alertId ||
        openAlerts.find((x) => x.type === a.type)?.id,
    }));

    return {
      period,
      formulaVersion: facts.formulaVersion,
      monthFacts: facts,
      availableBalance,
      incomeMtd,
      expenseMtd,
      allocatedToGoalsMtd,
      netMtd,
      expensePrev,
      incomePrev,
      topCategories,
      overdraftRisk,
      dataGaps,
      cashFlowForecast,
      attention: attentionOut,
      patterns,
      alerts: openAlerts.map((a) => ({
        id: a.id,
        type: a.type,
        titleHe: a.titleHe,
        bodyHe: a.bodyHe,
        severity: a.severity as "high" | "medium" | "low",
        actionable: true,
        createdAt: a.createdAt,
      })),
      recommendations: recommendations.slice(0, 5),
      completeness,
      healthScore,
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        progressPct: Math.min(
          100,
          Math.round(
            (Number(g.currentAmount) / Math.max(Number(g.targetAmount), 1)) *
              100,
          ),
        ),
      })),
    };
  }

  async dismissAlert(userId: string, alertId: string) {
    const row = await this.prisma.alert.findFirst({
      where: { id: alertId, userId },
    });
    if (!row) return { ok: false };
    await this.prisma.alert.update({
      where: { id: alertId },
      data: { dismissed: true, snoozedUntil: null },
    });
    return { ok: true };
  }

  async snoozeAlert(userId: string, alertId: string, days = 7) {
    const row = await this.prisma.alert.findFirst({
      where: { id: alertId, userId },
    });
    if (!row) return { ok: false };
    const until = new Date();
    until.setDate(until.getDate() + Math.min(30, Math.max(1, days)));
    await this.prisma.alert.update({
      where: { id: alertId },
      data: { snoozedUntil: until, dismissed: false },
    });
    return { ok: true, snoozedUntil: until };
  }

  /** Prefer current calendar month; if empty, use the latest month that has txs. */
  private async resolveFocusPeriod(userId: string, now = new Date()) {
    const currentStart = startOfMonth(now);
    const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const currentCount = await this.prisma.transaction.count({
      where: {
        userId,
        bookedAt: { gte: currentStart, lt: currentEnd },
      },
    });

    if (currentCount > 0) {
      return {
        isCurrentMonth: true,
        focusStart: currentStart,
        focusEnd: currentEnd,
        labelHe: "החודש הנוכחי",
        monthsNeeded: 6,
      };
    }

    const latest = await this.prisma.transaction.findFirst({
      where: { userId },
      orderBy: { bookedAt: "desc" },
      select: { bookedAt: true },
    });
    if (!latest) {
      return {
        isCurrentMonth: true,
        focusStart: currentStart,
        focusEnd: currentEnd,
        labelHe: "החודש הנוכחי",
        monthsNeeded: 6,
      };
    }

    const focusStart = startOfMonth(new Date(latest.bookedAt));
    const focusEnd = new Date(
      focusStart.getFullYear(),
      focusStart.getMonth() + 1,
      1,
    );
    const monthsNeeded = Math.min(
      12,
      Math.max(
        6,
        (now.getFullYear() - focusStart.getFullYear()) * 12 +
          (now.getMonth() - focusStart.getMonth()) +
          1,
      ),
    );
    const labelHe = focusStart.toLocaleDateString("he-IL", {
      month: "long",
      year: "numeric",
    });

    return {
      isCurrentMonth: false,
      focusStart,
      focusEnd,
      labelHe: `תקופת הנתונים: ${labelHe}`,
      monthsNeeded,
    };
  }
}

function sumDir(
  txs: Array<{ direction: string; amount: unknown }>,
  dir: string,
) {
  return txs
    .filter((t) => t.direction === dir)
    .reduce((s, t) => s + Number(t.amount), 0);
}

function groupExpense(
  txs: Array<{ direction: string; categoryKey: string; amount: unknown }>,
) {
  const map: Record<string, number> = {};
  for (const t of txs.filter(
    (x) => x.direction === "EXPENSE" && x.categoryKey !== "goal_funding",
  )) {
    map[t.categoryKey] = (map[t.categoryKey] || 0) + Number(t.amount);
  }
  return map;
}

function pctChange(prev: number, curr: number) {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / Math.abs(prev)) * 100);
}

function buildNarrative(
  mom: {
    income: { deltaPct: number; previous?: number };
    expense: { deltaPct: number; previous?: number };
    net: { current: number; deltaPct: number };
  },
  categories: Array<{ labelHe: string; amount: number }>,
  period?: { labelHe: string; isCurrentMonth: boolean },
) {
  const parts: string[] = [];
  const expensePrev = mom.expense.previous ?? 0;
  const incomePrev = mom.income.previous ?? 0;
  const canCompareExpense = expensePrev > 0;
  const canCompareIncome = incomePrev > 0;

  // מסקנה קודם
  if (mom.net.current < 0) {
    parts.push(
      "החודש נגמר במינוס תזרימי — כדאי לייצב לפני יעדים חדשים.",
    );
  } else if (canCompareExpense && mom.expense.deltaPct >= 15) {
    parts.push(
      `ההוצאות עלו משמעותית מול החודש הקודם (+${mom.expense.deltaPct}%).`,
    );
  } else if (canCompareExpense && mom.expense.deltaPct <= -10) {
    parts.push(
      `ההוצאות ירדו בכ־${Math.abs(mom.expense.deltaPct)}% — מגמה חיובית.`,
    );
  } else if (canCompareIncome && mom.income.deltaPct <= -10) {
    parts.push(
      `ההכנסות ירדו בכ־${Math.abs(mom.income.deltaPct)}% מול החודש הקודם.`,
    );
  } else if (mom.net.current > 0) {
    parts.push("החודש נשאר חיובי אחרי הוצאות וליעדים.");
  }

  // פרטים תומכים (בלי לחזור על המסקנה)
  if (mom.net.current < 0 && canCompareExpense && mom.expense.deltaPct >= 15) {
    parts.push(`ההוצאות עלו ב־${mom.expense.deltaPct}% מול החודש הקודם.`);
  }
  if (
    canCompareIncome &&
    mom.income.deltaPct <= -10 &&
    !parts.some((p) => p.includes("הכנסות ירדו"))
  ) {
    parts.push(`ההכנסות ירדו ב־${Math.abs(mom.income.deltaPct)}%.`);
  }
  if (categories[0] && categories[0].amount > 0) {
    parts.push(
      `הקטגוריה הגדולה: ${categories[0].labelHe} (₪${Math.round(categories[0].amount).toLocaleString("he-IL")}).`,
    );
  }

  if (parts.length === 0) {
    return "עדיין אין מספיק היסטוריה למסקנה חודשית ברורה.";
  }

  if (period && !period.isCurrentMonth) {
    parts.splice(1, 0, `${period.labelHe}.`);
  }

  return parts.join(" ");
}

function detectRecurring(
  txs: Array<{
    direction: string;
    amount: unknown;
    description: string | null;
    categoryKey: string;
  }>,
) {
  const map = new Map<
    string,
    { label: string; amount: number; count: number; categoryKey: string }
  >();
  for (const t of txs.filter((x) => x.direction === "EXPENSE")) {
    const desc = (t.description || "").trim().toLowerCase();
    if (!desc || desc.length < 2) continue;
    const rounded = Math.round(Number(t.amount));
    const key = `${desc}|${rounded}`;
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else
      map.set(key, {
        label: t.description || desc,
        amount: rounded,
        count: 1,
        categoryKey: t.categoryKey,
      });
  }
  return [...map.values()].filter((x) => x.count >= 2).sort((a, b) => b.count - a.count);
}

function pushRec(list: RankedRecommendation[], rec: RankedRecommendation) {
  if (list.some((r) => r.id === rec.id)) return;
  list.push(rec);
}

function pushAttention(list: AttentionItem[], item: AttentionItem) {
  if (list.some((r) => r.id === item.id || r.type === item.type)) return;
  list.push(item);
}

function csvEscape(value: string) {
  const s = String(value ?? "").replace(/"/g, '""');
  return `"${s}"`;
}
