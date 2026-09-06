import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { categoryNature } from "../budget/nature";

const CATEGORY_HE: Record<string, string> = {
  housing: "דיור",
  food: "מזון",
  transport: "תחבורה",
  utilities: "חשבונות בית",
  cellular: "סלולר",
  internet: "אינטרנט",
  subscriptions: "מנויים",
  healthcare: "בריאות",
  insurance: "ביטוח",
  shopping: "קניות",
  entertainment: "בילויים",
  education: "חינוך",
  children: "ילדים",
  loans: "הלוואות",
  banking: "עמלות בנק",
  travel: "נסיעות",
  goal_funding: "ליעדים",
  other: "אחר",
  salary: "משכורת",
  freelance: "פרילנס",
  benefits: "קצבאות / הטבות",
  other_income: "הכנסה אחרת",
};

function categoryLabelHe(key: string): string {
  return CATEGORY_HE[key] || key;
}

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

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async buildReport(
    userId: string,
    monthsBack = 6,
    selectedMonth?: string,
  ) {
    const now = new Date();
    const period = await this.resolveFocusPeriod(userId, now);
    // Honor the user's requested window (do not force monthsNeeded onto the chart).
    const months = Math.min(24, Math.max(2, monthsBack || 6));

    let focusStart = period.focusStart;
    let focusEnd = period.focusEnd;
    if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
      const [y, m] = selectedMonth.split("-").map(Number);
      focusStart = new Date(y, m - 1, 1);
      focusEnd = new Date(y, m, 1);
    }

    const from = new Date(
      focusStart.getFullYear(),
      focusStart.getMonth() - (months - 1),
      1,
    );
    const txs = await this.prisma.transaction.findMany({
      where: { userId, bookedAt: { gte: from, lt: focusEnd } },
      orderBy: { bookedAt: "asc" },
    });

    const seriesMap = new Map<
      string,
      { month: string; income: number; expense: number; net: number }
    >();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(
        focusStart.getFullYear(),
        focusStart.getMonth() - i,
        1,
      );
      const key = monthKey(d);
      seriesMap.set(key, { month: key, income: 0, expense: 0, net: 0 });
    }

    for (const t of txs) {
      const key = monthKey(new Date(t.bookedAt));
      const row = seriesMap.get(key);
      if (!row) continue;
      const amount = Number(t.amount);
      if (t.direction === "INCOME") row.income += amount;
      if (t.direction === "EXPENSE") row.expense += amount;
      row.net = row.income - row.expense;
    }

    const monthlySeries = [...seriesMap.values()];

    const focusKey = monthKey(focusStart);
    const focusIdx = monthlySeries.findIndex((m) => m.month === focusKey);
    const current =
      focusIdx >= 0
        ? monthlySeries[focusIdx]
        : monthlySeries[monthlySeries.length - 1] || {
            month: focusKey,
            income: 0,
            expense: 0,
            net: 0,
          };
    const previous =
      focusIdx > 0
        ? monthlySeries[focusIdx - 1]
        : monthlySeries[monthlySeries.length - 2] || {
            income: 0,
            expense: 0,
            net: 0,
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
      net: {
        current: current?.net || 0,
        previous: previous.net,
        deltaPct: pctChange(previous.net, current?.net || 0),
      },
    };

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
          labelHe: categoryLabelHe(key),
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
        categoryLabelHe: categoryLabelHe(t.categoryKey),
        description: t.description,
        bookedAt: t.bookedAt.toISOString(),
      }));

    const balanceSheet = {
      month: focusKey,
      incomeTotal: mom.income.current,
      expenseTotal: mom.expense.current,
      net: mom.net.current,
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
      const nature = categoryNature(t.categoryKey);
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
            labelHe: categoryLabelHe(key),
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

  async analyze(userId: string) {
    const now = new Date();
    const period = await this.resolveFocusPeriod(userId, now);
    const focusStart = period.focusStart;
    const focusEnd = period.focusEnd;
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

    const [accounts, goals, monthTx, prevTx, recentTx, dismissed] =
      await Promise.all([
        this.prisma.financialAccount.findMany({
          where: { userId, isActive: true },
        }),
        this.prisma.goal.findMany({ where: { userId } }),
        this.prisma.transaction.findMany({
          where: {
            userId,
            bookedAt: { gte: focusStart, lt: focusEnd },
          },
        }),
        this.prisma.transaction.findMany({
          where: {
            userId,
            bookedAt: { gte: prevStart, lt: focusStart },
          },
        }),
        this.prisma.transaction.findMany({
          where: { userId, bookedAt: { gte: lookbackStart } },
        }),
        this.prisma.alert.findMany({
          where: { userId, dismissed: true },
          select: { type: true },
        }),
      ]);

    const dismissedTypes = new Set(dismissed.map((a) => a.type));
    const availableBalance = accounts.reduce(
      (s, a) => s + Number(a.currentBalance),
      0,
    );
    const incomeMtd = sumDir(monthTx, "INCOME");
    const expenseMtd = sumDir(monthTx, "EXPENSE");
    const expensePrev = sumDir(prevTx, "EXPENSE");
    const incomePrev = sumDir(prevTx, "INCOME");
    const netMtd = incomeMtd - expenseMtd;

    const byCategoryMonth = groupExpense(monthTx);
    const byCategoryPrev = groupExpense(prevTx);
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
    const projectedExpense = (expenseMtd / day) * daysInMonth;
    const projectedNet = incomeMtd - projectedExpense;
    const endBalanceProjected = availableBalance + projectedNet;

    let overdraftRisk: {
      level: "high" | "medium" | "low";
      messageHe: string;
      alreadyNegative: boolean;
    };
    if (availableBalance < 0) {
      overdraftRisk = {
        level: "high",
        alreadyNegative: true,
        messageHe: `החשבון כבר במינוס (₪${Math.round(Math.abs(availableBalance)).toLocaleString("he-IL")}). עומס משיכת היתר פעיל — עדיפות לייצוב תזרים לפני הוצאות חדשות.`,
      };
    } else if (endBalanceProjected < 0) {
      overdraftRisk = {
        level: "high",
        alreadyNegative: false,
        messageHe: `לפי הקצב הנוכחי צפוי מינוס של כ־₪${Math.round(Math.abs(endBalanceProjected)).toLocaleString("he-IL")} עד סוף החודש.`,
      };
    } else if (
      endBalanceProjected < Math.max(availableBalance * 0.15, 500)
    ) {
      overdraftRisk = {
        level: "medium",
        alreadyNegative: false,
        messageHe:
          "הנזילות צפויה להיות דקה לקראת סוף החודש — כדאי לצמצם הוצאות משתנות.",
      };
    } else {
      overdraftRisk = {
        level: "low",
        alreadyNegative: false,
        messageHe: "לא זוהה עומס מינוס גבוה לפי הנתונים הזמינים.",
      };
    }

    const dataGaps: Array<{
      id: string;
      titleHe: string;
      bodyHe: string;
      ctaHe: string;
      href: string;
    }> = [];
    if (monthTx.length === 0) {
      dataGaps.push({
        id: "empty-month",
        titleHe: "בחודש זה אין תנועות",
        bodyHe: "המאזן ריק לחודש הנבחר — ייבאו דף חשבון או הוסיפו תנועה.",
        ctaHe: "לייבוא",
        href: "/app/money?tab=import",
      });
    } else if (expenseMtd > 0 && incomeMtd <= 0) {
      dataGaps.push({
        id: "missing-income",
        titleHe: "חסרות הכנסות בחודש",
        bodyHe: "יש הוצאות בלי הכנסות — המאזן עלול להיות מטעה.",
        ctaHe: "הוספת הכנסה / ייבוא",
        href: "/app/money?tab=import",
      });
    } else if (prevTx.length >= 5 && monthTx.length <= 2) {
      dataGaps.push({
        id: "sparse-month",
        titleHe: "נתונים חלקיים לחודש",
        bodyHe: "יש מעט תנועות יחסית לחודש הקודם — ייתכן שחסר ייבוא.",
        ctaHe: "לייבוא",
        href: "/app/money?tab=import",
      });
    }

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
    // Prefer commitments when present; else recurring detection
    const expectedFixedNext =
      commitmentExpected > 0 ? commitmentExpected : recurringExpected;
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
        ...commitments.slice(0, 8).map((c) => ({
          titleHe: c.titleHe,
          amount:
            c.cadence === "YEARLY"
              ? Math.round((Number(c.expectedAmount) / 12) * 100) / 100
              : Number(c.expectedAmount),
          source: "commitment" as const,
        })),
        ...(commitmentExpected > 0
          ? []
          : recurring.slice(0, 8).map((r) => ({
              titleHe: r.label,
              amount: r.amount,
              source: "recurring" as const,
            }))),
      ],
    };

    const patterns: PatternFinding[] = [];
    const alerts: AlertItem[] = [];
    const recommendations: RankedRecommendation[] = [];

    // Pattern: MoM spend spike
    if (expensePrev > 0 && expenseMtd > expensePrev * 1.15) {
      const pct = Math.round(((expenseMtd - expensePrev) / expensePrev) * 100);
      patterns.push({
        id: "mom-spend-up",
        titleHe: "עלייה בהוצאות לעומת החודש הקודם",
        bodyHe: `ההוצאות גבוהות בכ־${pct}% (₪${Math.round(expenseMtd - expensePrev).toLocaleString("he-IL")} הפרש).`,
        severity: pct >= 30 ? "high" : "medium",
      });
      pushRec(recommendations, {
        id: "spend-up",
        titleHe: "עצרו את עליית ההוצאות",
        bodyHe: `ההוצאות עלו ב־${pct}% מול החודש הקודם. בדקו את 3 הקטגוריות הגדולות וקבעו תקרה לשבוע.`,
        priority: "high",
        score: 80 + Math.min(pct, 40),
        evidence: [`expenseMtd=${expenseMtd}`, `expensePrev=${expensePrev}`],
        annualImpactIls: Math.round((expenseMtd - expensePrev) * 12),
      });
    }

    // Pattern: category drift vs previous month
    for (const [key, amount] of Object.entries(byCategoryMonth)) {
      const prev = byCategoryPrev[key] || 0;
      if (prev >= 50 && amount > prev * 1.4 && amount - prev >= 100) {
        patterns.push({
          id: `cat-drift-${key}`,
          titleHe: `חריגה בקטגוריה: ${categoryLabelHe(key)}`,
          bodyHe: `החודש ₪${Math.round(amount).toLocaleString("he-IL")} לעומת ₪${Math.round(prev).toLocaleString("he-IL")} בחודש שעבר.`,
          severity: amount > prev * 2 ? "high" : "medium",
          categoryKey: key,
          categoryLabelHe: categoryLabelHe(key),
        });
      }
    }

    // Pattern: recurring same description/amount (subscription-like)
    for (const r of recurring.slice(0, 5)) {
      patterns.push({
        id: `recur-${r.categoryKey}-${Math.round(r.amount)}-${r.label.slice(0, 24)}`,
        titleHe: `חיוב חוזר אפשרי: ${r.label}`,
        bodyHe: `זוהו ${r.count} תנועות דומות בסביבות ₪${Math.round(r.amount).toLocaleString("he-IL")}.`,
        severity: "low",
        categoryKey: r.categoryKey,
        categoryLabelHe: categoryLabelHe(r.categoryKey),
      });
    }

    // Pattern: payday spike (expenses clustered in first 5 days after large income)
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
            t.direction === "EXPENSE" &&
            new Date(t.bookedAt) >= payDay &&
            new Date(t.bookedAt) <= windowEnd,
        )
        .reduce((s, t) => s + Number(t.amount), 0);
      if (spike > Number(salaryLike.amount) * 0.35 && spike >= 800) {
        patterns.push({
          id: "payday-spike",
          titleHe: "בזבוז אחרי משכורת",
          bodyHe: `תוך 5 ימים מההכנסה הגדולה יצאו ₪${Math.round(spike).toLocaleString("he-IL")} — שיעור גבוה יחסית.`,
          severity: "medium",
        });
        pushRec(recommendations, {
          id: "payday-buffer",
          titleHe: "הפרישו ליעד מיד אחרי המשכורת",
          bodyHe:
            "העבירו סכום קבוע ליעד/חיסכון ביום המשכורת לפני הוצאות שוטפות.",
          priority: "medium",
          score: 70,
          evidence: [`spike=${spike}`, `income=${salaryLike.amount}`],
        });
      }
    }

    // Alerts
    if (overdraftRisk.level !== "low") {
      maybeAlert(alerts, dismissedTypes, {
        id: "overdraft-forecast",
        type: "overdraft-forecast",
        titleHe: overdraftRisk.alreadyNegative
          ? "עומס משיכת יתר"
          : "סיכון משיכת יתר",
        bodyHe: overdraftRisk.messageHe,
        severity: overdraftRisk.level,
        actionable: true,
      });
      pushRec(recommendations, {
        id: "protect-cashflow",
        titleHe: overdraftRisk.alreadyNegative
          ? "ייצבו את המינוס השבוע"
          : "הגנו על התזרים השבוע",
        bodyHe: overdraftRisk.alreadyNegative
          ? "עצרו הוצאות משתנות, בדקו עמלות והעדיפו סגירת חוב על פני רכישות."
          : "דחו הוצאות לא דחופות ובדקו חיובים קבועים שניתן להקפיא זמנית.",
        priority: overdraftRisk.level === "high" ? "high" : "medium",
        score: overdraftRisk.level === "high" ? 95 : 75,
        evidence: [
          `balance=${availableBalance}`,
          `projectedNet=${projectedNet}`,
        ],
      });
    }

    if (incomePrev > 0 && incomeMtd > 0 && incomeMtd < incomePrev * 0.85) {
      maybeAlert(alerts, dismissedTypes, {
        id: "income-drop",
        type: "income-drop",
        titleHe: "ירידה בהכנסות",
        bodyHe: `ההכנסה החודש נמוכה בכ־${Math.round((1 - incomeMtd / incomePrev) * 100)}% מהחודש הקודם.`,
        severity: "medium",
        actionable: true,
      });
    }

    for (const g of goals) {
      const target = Number(g.targetAmount);
      const current = Number(g.currentAmount);
      const remaining = target - current;
      if (remaining <= 0) continue;
      const progress = current / Math.max(target, 1);
      if (progress < 0.15 && expenseMtd > incomeMtd * 0.9 && incomeMtd > 0) {
        maybeAlert(alerts, dismissedTypes, {
          id: `goal-risk-${g.id}`,
          type: `goal-risk-${g.id}`,
          titleHe: `יעד בסיכון: ${g.title}`,
          bodyHe: "קצב החיסכון נמוך ביחס להוצאות החודש.",
          severity: "medium",
          actionable: true,
        });
      }
      pushRec(recommendations, {
        id: `goal-${g.id}`,
        titleHe: `התקדמות ליעד: ${g.title}`,
        bodyHe: `נותרו ₪${Math.round(remaining).toLocaleString("he-IL")}. הצעד השבוע: להפריש סכום קבוע קטן.`,
        priority: "medium",
        score: 55 + Math.round((1 - progress) * 20),
        evidence: [`remaining=${remaining}`],
      });
    }

    // Cellular opportunity heuristic (estimate, labeled)
    const cellular = byCategoryMonth.cellular || 0;
    if (cellular >= 90) {
      pushRec(recommendations, {
        id: "cellular-market",
        titleHe: "בדיקת חבילת סלולר",
        bodyHe: `אתם מדווחים על ~₪${Math.round(cellular).toLocaleString("he-IL")}/חודש לסלולר. בשוק הישראלי יש חבילות סביב ₪30–60 — השוו (הערכה, לא הצעת ספק מאומתת).`,
        priority: "medium",
        score: 65,
        evidence: [`cellular=${cellular}`, "market=estimate"],
        annualImpactIls: Math.max(0, Math.round((cellular - 50) * 12)),
      });
    }

    if (recommendations.length === 0) {
      pushRec(recommendations, {
        id: "add-data",
        titleHe: "העשירו את תמונת המצב",
        bodyHe:
          "הוסיפו עוד תנועות או העלו דף חשבון — כך הדפוסים וההמלצות יהיו מדויקים יותר.",
        priority: "low",
        score: 20,
        evidence: ["sparse-data"],
      });
    }

    recommendations.sort((a, b) => b.score - a.score);

    let completeness = 15;
    if (accounts.length > 0) completeness += 20;
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
            (goals.length > 0 ? 12 : 0) +
            (accounts.length > 0 ? 12 : 0) +
            (overdraftRisk.level === "low"
              ? 12
              : overdraftRisk.level === "medium"
                ? 0
                : -18) +
            (patterns.some((p) => p.severity === "high") ? -8 : 0) +
            Math.min(10, Math.floor(recentTx.length / 3)),
        ),
      ),
    );

    // Persist non-dismissed alerts snapshot (upsert by type for current open ones)
    for (const alert of alerts) {
      const existing = await this.prisma.alert.findFirst({
        where: { userId, type: alert.type, dismissed: false },
      });
      if (!existing) {
        await this.prisma.alert.create({
          data: {
            userId,
            type: alert.type,
            titleHe: alert.titleHe,
            bodyHe: alert.bodyHe,
            severity: alert.severity,
          },
        });
      }
    }

    const openAlerts = await this.prisma.alert.findMany({
      where: { userId, dismissed: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return {
      period,
      availableBalance,
      incomeMtd,
      expenseMtd,
      netMtd,
      expensePrev,
      incomePrev,
      topCategories,
      overdraftRisk,
      dataGaps,
      cashFlowForecast,
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
      data: { dismissed: true },
    });
    return { ok: true };
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
  for (const t of txs.filter((x) => x.direction === "EXPENSE")) {
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
    income: { deltaPct: number };
    expense: { deltaPct: number };
    net: { current: number; deltaPct: number };
  },
  categories: Array<{ labelHe: string; amount: number }>,
  period?: { labelHe: string; isCurrentMonth: boolean },
) {
  const parts: string[] = [];
  if (period && !period.isCurrentMonth) {
    parts.push(`${period.labelHe}.`);
  }
  if (mom.expense.deltaPct >= 15) {
    parts.push(`ההוצאות עלו ב־${mom.expense.deltaPct}% מול החודש הקודם.`);
  } else if (mom.expense.deltaPct <= -10) {
    parts.push(`ההוצאות ירדו ב־${Math.abs(mom.expense.deltaPct)}% — מגמה חיובית.`);
  }
  if (mom.income.deltaPct <= -10) {
    parts.push(`ההכנסות ירדו ב־${Math.abs(mom.income.deltaPct)}%.`);
  }
  if (categories[0]) {
    parts.push(
      `הקטגוריה הגדולה בתקופה: ${categories[0].labelHe} (₪${Math.round(categories[0].amount).toLocaleString("he-IL")}).`,
    );
  }
  if (mom.net.current < 0) {
    parts.push("התזרים שלילי — עדיפות לייצוב לפני יעדים חדשים.");
  }
  return parts.join(" ") || "עדיין אין מספיק היסטוריה לנרטיב חודשי עשיר.";
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

function maybeAlert(
  list: AlertItem[],
  dismissed: Set<string>,
  alert: AlertItem,
) {
  if (dismissed.has(alert.type)) return;
  if (list.some((a) => a.type === alert.type)) return;
  list.push(alert);
}

function csvEscape(value: string) {
  const s = String(value ?? "").replace(/"/g, '""');
  return `"${s}"`;
}
