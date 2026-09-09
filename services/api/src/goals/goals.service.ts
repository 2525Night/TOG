import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SourceType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BudgetService } from "../budget/budget.service";
import { MonthFactsService } from "../month-facts/month-facts.service";
import {
  ApplyStandingRangeDto,
  ApplySurplusDto,
  CreateGoalDto,
  CreateStandingDto,
  ReverseAllocationDto,
  UpdateGoalDto,
} from "./goals.dto";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(y, m - 1, 1),
    end: new Date(y, m, 1),
  };
}

function bookedAtForMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const now = new Date();
  if (now.getFullYear() === y && now.getMonth() === m - 1) {
    return now;
  }
  return new Date(y, m - 1, 15, 12, 0, 0);
}

function goalMerchant(goalId: string) {
  return `goal:${goalId}`;
}

function balanceDelta(
  direction: "INCOME" | "EXPENSE" | "TRANSFER",
  amount: number,
) {
  if (direction === "INCOME") return amount;
  if (direction === "EXPENSE") return -amount;
  return 0;
}

function addMonths(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

function monthsInRange(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addMonths(cur, 1);
    if (out.length > 120) break;
  }
  return out;
}

function monthsBetweenInclusive(from: string, to: string) {
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

type StandingRow = {
  id: string;
  expectedAmount: Prisma.Decimal;
  anchorDay: number | null;
  startMonth: string | null;
  endMonth: string | null;
  untilGoal: boolean;
};

function resolveStandingWindow(dto: CreateStandingDto) {
  const startMonth =
    dto.startMonth && /^\d{4}-\d{2}$/.test(dto.startMonth)
      ? dto.startMonth
      : monthKey(new Date());
  const untilGoal = Boolean(dto.untilGoal);
  if (untilGoal) {
    return { startMonth, endMonth: null as string | null, untilGoal: true };
  }
  if (dto.endMonth && /^\d{4}-\d{2}$/.test(dto.endMonth)) {
    if (dto.endMonth < startMonth) {
      throw new BadRequestException("חודש סיום לפני חודש התחלה");
    }
    return { startMonth, endMonth: dto.endMonth, untilGoal: false };
  }
  if (dto.monthsCount && dto.monthsCount >= 1) {
    return {
      startMonth,
      endMonth: addMonths(startMonth, dto.monthsCount - 1),
      untilGoal: false,
    };
  }
  // Open-ended default when no duration given
  return { startMonth, endMonth: null as string | null, untilGoal: false };
}

function standingActiveInMonth(
  standing: StandingRow,
  month: string,
  goalRemaining: number,
) {
  const start = standing.startMonth || monthKey(new Date(0));
  if (month < start) return false;
  if (standing.untilGoal) {
    return goalRemaining > 0.01;
  }
  if (standing.endMonth && month > standing.endMonth) return false;
  return true;
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budget: BudgetService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  /** Primary checking account — create BANK if none exists. */
  private async ensureCheckingAccount(userId: string) {
    const existing = await this.prisma.financialAccount.findFirst({
      where: { userId, isActive: true, kind: "BANK" },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing;
    const any = await this.prisma.financialAccount.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (any) return any;
    return this.prisma.financialAccount.create({
      data: {
        userId,
        name: "עו״ש ראשי",
        kind: "BANK",
        currentBalance: new Prisma.Decimal(0),
        sourceType: "USER_INPUT",
        userConfirmed: true,
      },
    });
  }

  private enrichStanding(
    standing: StandingRow,
    focusMonth: string,
    doneMonths: Set<string>,
    goalRemaining: number,
  ) {
    const startMonth = standing.startMonth || focusMonth;
    const untilGoal = standing.untilGoal;
    const endMonth = untilGoal ? null : standing.endMonth;
    const horizonEnd =
      endMonth ||
      (untilGoal
        ? addMonths(focusMonth, 24)
        : addMonths(startMonth, 11));
    const covered = monthsInRange(startMonth, horizonEnd).filter((m) =>
      standingActiveInMonth(standing, m, goalRemaining),
    );
    const pendingMonths = covered.filter((m) => !doneMonths.has(m));
    const monthsLeft =
      endMonth != null
        ? Math.max(0, monthsBetweenInclusive(focusMonth, endMonth))
        : untilGoal
          ? pendingMonths.filter((m) => m >= focusMonth).length
          : null;

    return {
      id: standing.id,
      monthlyAmount: Number(standing.expectedAmount),
      anchorDay: standing.anchorDay,
      startMonth,
      endMonth,
      untilGoal,
      monthsLeft,
      pendingMonths: pendingMonths.slice(0, 36),
      activeInFocusMonth: standingActiveInMonth(
        standing,
        focusMonth,
        goalRemaining,
      ),
    };
  }

  async list(userId: string, month?: string) {
    const focus =
      month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(new Date());
    const { start, end } = monthBounds(focus);
    const lookback = new Date(start);
    lookback.setMonth(lookback.getMonth() - 3);

    const [goals, commitments, recentFunding, allFunding] = await Promise.all([
      this.prisma.goal.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.budgetCommitment.findMany({
        where: {
          userId,
          active: true,
          categoryKey: "goal_funding",
          merchantNorm: { startsWith: "goal:" },
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId,
          categoryKey: "goal_funding",
          bookedAt: { gte: lookback, lt: end },
        },
        orderBy: { bookedAt: "desc" },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId,
          categoryKey: "goal_funding",
          merchantNorm: { startsWith: "goal:" },
        },
        orderBy: { bookedAt: "desc" },
      }),
    ]);

    const standingByGoal = new Map(
      commitments.map((c) => [c.merchantNorm || "", c]),
    );

    return goals
      .map((g) => {
        const merchant = goalMerchant(g.id);
        const standing = standingByGoal.get(merchant) || null;
        const goalAllTx = allFunding.filter((t) => t.merchantNorm === merchant);
        const goalMonthTx = goalAllTx.filter((t) => {
          const k = monthKey(new Date(t.bookedAt));
          return k === focus;
        });
        const fundedAll = goalAllTx.reduce((s, t) => s + Number(t.amount), 0);
        const fundedAsOf = goalAllTx
          .filter((t) => monthKey(new Date(t.bookedAt)) <= focus)
          .reduce((s, t) => s + Number(t.amount), 0);
        // Seed / manual current without matching txs — count from goal creation month onward
        const createdMonth = monthKey(new Date(g.createdAt));
        const openingBalance = Math.max(0, Number(g.currentAmount) - fundedAll);
        const rawSaved =
          (openingBalance > 0 && focus >= createdMonth ? openingBalance : 0) +
          fundedAsOf;
        const savedAsOfMonth = Math.min(
          Number(g.targetAmount),
          Math.round(rawSaved * 100) / 100,
        );
        const goalRecent = recentFunding.filter(
          (t) => t.merchantNorm === merchant,
        );
        const doneMonths = new Set(
          goalAllTx.map((t) => monthKey(new Date(t.bookedAt))),
        );
        const remaining = Math.max(
          0,
          Number(g.targetAmount) - Number(g.currentAmount),
        );
        const standingActive = Boolean(
          standing && standingActiveInMonth(standing, focus, remaining),
        );
        const forecast = this.buildForecast(
          g,
          standingActive ? standing : null,
          goalRecent,
        );
        return {
          id: g.id,
          title: g.title,
          kind: g.kind,
          currency: g.currency,
          targetDate: g.targetDate,
          sourceType: g.sourceType,
          userConfirmed: g.userConfirmed,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
          targetAmount: Number(g.targetAmount),
          currentAmount: Number(g.currentAmount),
          createdMonth,
          savedAsOfMonth,
          standing: standing
            ? this.enrichStanding(standing, focus, doneMonths, remaining)
            : null,
          doneThisMonth: goalMonthTx.length > 0,
          monthAllocated: Math.round(
            goalMonthTx.reduce((s, t) => s + Number(t.amount), 0) * 100,
          ) / 100,
          contributions: goalMonthTx.map((t) => ({
            id: t.id,
            amount: Number(t.amount),
            bookedAt: t.bookedAt,
            description: t.description,
          })),
          forecast,
          relevantInFocus:
            createdMonth <= focus ||
            goalMonthTx.length > 0 ||
            standingActive,
        };
      })
      .filter((g) => g.relevantInFocus)
      .map(({ relevantInFocus: _r, ...g }) => g);
  }

  async monthPool(userId: string, month?: string) {
    const focus =
      month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(new Date());
    const facts = await this.monthFacts.forMonth(userId, focus);
    const { start, end } = monthBounds(focus);

    const [commitments, monthFunding, goals] = await Promise.all([
      this.prisma.budgetCommitment.findMany({
        where: {
          userId,
          active: true,
          categoryKey: "goal_funding",
          merchantNorm: { startsWith: "goal:" },
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId,
          categoryKey: "goal_funding",
          bookedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.goal.findMany({ where: { userId } }),
    ]);

    const remainingByMerchant = new Map(
      goals.map((g) => [
        goalMerchant(g.id),
        Math.max(0, Number(g.targetAmount) - Number(g.currentAmount)),
      ]),
    );

    const allocated = facts.flows.allocatedToGoals;
    const doneMerchants = new Set(
      monthFunding.map((t) => t.merchantNorm).filter(Boolean),
    );
    const plannedStanding = commitments
      .filter((c) => {
        const merchant = c.merchantNorm || "";
        if (doneMerchants.has(merchant)) return false;
        const rem = remainingByMerchant.get(merchant) ?? 1;
        return standingActiveInMonth(c, focus, rem);
      })
      .reduce((s, c) => s + Number(c.expectedAmount), 0);

    const leftover = facts.budget.leftover;
    const free = Math.max(0, leftover - plannedStanding);
    const poolBase = leftover + allocated;
    const tight = plannedStanding > leftover + 0.01;
    const hasEmergency = goals.some((g) => g.kind === "EMERGENCY");
    const checkingBalanceNow = facts.checkingBalanceNow;
    const showReserveCta =
      !hasEmergency && leftover > 0 && checkingBalanceNow >= 0;

    return {
      month: focus,
      formulaVersion: facts.formulaVersion,
      leftover,
      allocated: Math.round(allocated * 100) / 100,
      plannedStanding: Math.round(plannedStanding * 100) / 100,
      free: Math.round(free * 100) / 100,
      poolBase: Math.round(poolBase * 100) / 100,
      tight,
      checkingBalanceNow: Math.round(checkingBalanceNow * 100) / 100,
      hasEmergency,
      showReserveCta,
      suggestedReserveTarget: Math.max(
        3000,
        Math.round(leftover > 0 ? leftover * 3 : 3000),
      ),
      labelHe: new Date(
        Number(focus.slice(0, 4)),
        Number(focus.slice(5, 7)) - 1,
        1,
      ).toLocaleDateString("he-IL", { month: "long", year: "numeric" }),
    };
  }

  async create(userId: string, dto: CreateGoalDto) {
    const kind = dto.kind === "EMERGENCY" ? "EMERGENCY" : "GENERAL";
    if (kind === "EMERGENCY") {
      const existing = await this.prisma.goal.findFirst({
        where: { userId, kind: "EMERGENCY" },
      });
      if (existing) {
        throw new BadRequestException("כבר קיימת רזרבה להפתעות");
      }
    }
    return this.prisma.goal.create({
      data: {
        userId,
        title:
          kind === "EMERGENCY"
            ? dto.title.trim() || "רזרבה להפתעות"
            : dto.title,
        kind,
        targetAmount: new Prisma.Decimal(dto.targetAmount),
        currentAmount: new Prisma.Decimal(dto.currentAmount ?? 0),
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        sourceType: "USER_INPUT",
        userConfirmed: true,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateGoalDto) {
    const existing = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("יעד לא נמצא");
    return this.prisma.goal.update({
      where: { id },
      data: {
        title: dto.title,
        targetAmount:
          dto.targetAmount === undefined
            ? undefined
            : new Prisma.Decimal(dto.targetAmount),
        currentAmount:
          dto.currentAmount === undefined
            ? undefined
            : new Prisma.Decimal(dto.currentAmount),
        targetDate:
          dto.targetDate === undefined
            ? undefined
            : dto.targetDate
              ? new Date(dto.targetDate)
              : null,
      },
    });
  }

  async applySurplus(
    userId: string,
    id: string,
    dto: ApplySurplusDto,
    options: {
      sourceType?: SourceType;
      auditAction?: string;
    } = {},
  ) {
    if (!dto.confirm) {
      throw new BadRequestException(
        "נדרש אישור מפורש (confirm: true) לפני הקצאת עודף ליעד",
      );
    }
    const amount = Math.round(Number(dto.amount) * 100) / 100;
    if (!(amount > 0)) {
      throw new BadRequestException("סכום לא תקין");
    }
    const existing = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("יעד לא נמצא");

    const month =
      dto.month && /^\d{4}-\d{2}$/.test(dto.month)
        ? dto.month
        : monthKey(new Date());
    const nowKey = monthKey(new Date());
    const isFuture = month > nowKey;
    const isPastOrCurrent = month <= nowKey;

    if (isPastOrCurrent) {
      const snap = await this.budget.snapshot(userId, month);
      if (amount > snap.leftover + 0.01) {
        throw new BadRequestException(
          `ניתן להקצות עד ₪${Math.round(snap.leftover).toLocaleString("he-IL")} מהנותר של ${month}`,
        );
      }
    }

    const next = Number(existing.currentAmount) + amount;
    const bookedAt = bookedAtForMonth(month);
    const merchant = goalMerchant(id);
    const account = await this.ensureCheckingAccount(userId);

    const [, tx] = await this.prisma.$transaction([
      this.prisma.goal.update({
        where: { id },
        data: { currentAmount: new Prisma.Decimal(next) },
      }),
      this.prisma.transaction.create({
        data: {
          userId,
          accountId: account.id,
          direction: "EXPENSE",
          amount: new Prisma.Decimal(amount),
          categoryKey: "goal_funding",
          description: `הקצאה ליעד: ${existing.title}`,
          merchantNorm: merchant,
          bookedAt,
          sourceType: options.sourceType ?? SourceType.USER_INPUT,
          userConfirmed: true,
        },
      }),
      this.prisma.financialAccount.update({
        where: { id: account.id },
        data: {
          currentBalance: { increment: balanceDelta("EXPENSE", amount) },
        },
      }),
      this.prisma.auditEvent.create({
        data: {
          userId,
          action: options.auditAction ?? "GOAL_SURPLUS_APPLIED",
          meta: JSON.stringify({
            goalId: id,
            amount,
            month,
            title: existing.title,
            future: isFuture,
          }),
        },
      }),
    ]);

    const updated = await this.prisma.goal.findUniqueOrThrow({ where: { id } });
    const monthLabel = bookedAt.toLocaleDateString("he-IL", {
      month: "long",
      year: "numeric",
    });

    return {
      ok: true,
      goal: updated,
      appliedAmount: amount,
      month,
      transactionId: tx.id,
      messageHe: `הוקצו ₪${amount.toLocaleString("he-IL")} ליעד «${existing.title}» ונרשמה תנועה ב־${monthLabel}`,
    };
  }

  async reverseAllocation(
    userId: string,
    id: string,
    dto: ReverseAllocationDto,
  ) {
    if (!dto.confirm) {
      throw new BadRequestException(
        "נדרש אישור מפורש (confirm: true) לפני ביטול הקצאה",
      );
    }
    const goal = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException("יעד לא נמצא");

    const tx = await this.prisma.transaction.findFirst({
      where: {
        id: dto.transactionId,
        userId,
        categoryKey: "goal_funding",
        merchantNorm: goalMerchant(id),
      },
    });
    if (!tx) throw new NotFoundException("הקצאה לא נמצאה");

    const amount = Number(tx.amount);
    const next = Math.max(0, Number(goal.currentAmount) - amount);

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.transaction.delete({ where: { id: tx.id } }),
      this.prisma.goal.update({
        where: { id },
        data: { currentAmount: new Prisma.Decimal(next) },
      }),
      this.prisma.auditEvent.create({
        data: {
          userId,
          action: "GOAL_ALLOCATION_REVERSED",
          meta: JSON.stringify({
            goalId: id,
            transactionId: tx.id,
            amount,
          }),
        },
      }),
    ];
    if (tx.accountId) {
      ops.push(
        this.prisma.financialAccount.update({
          where: { id: tx.accountId },
          data: {
            currentBalance: {
              increment: -balanceDelta(tx.direction, amount),
            },
          },
        }),
      );
    }

    await this.prisma.$transaction(ops);

    return {
      ok: true,
      reversedAmount: amount,
      messageHe: `בוטלה הקצאה של ₪${amount.toLocaleString("he-IL")} ליעד «${goal.title}»`,
    };
  }

  async createStanding(userId: string, id: string, dto: CreateStandingDto) {
    const goal = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException("יעד לא נמצא");
    const merchant = goalMerchant(id);

    const existing = await this.prisma.budgetCommitment.findFirst({
      where: { userId, merchantNorm: merchant, active: true },
    });

    const explicitStart =
      dto.startMonth && /^\d{4}-\d{2}$/.test(dto.startMonth)
        ? dto.startMonth
        : undefined;
    const startAnchor =
      explicitStart || existing?.startMonth || undefined;
    const window = resolveStandingWindow({
      ...dto,
      startMonth: startAnchor,
    });

    if (existing) {
      return this.prisma.budgetCommitment.update({
        where: { id: existing.id },
        data: {
          expectedAmount: new Prisma.Decimal(dto.monthlyAmount),
          anchorDay: dto.anchorDay ?? existing.anchorDay,
          titleHe: `הקצאה ליעד: ${goal.title}`,
          endMonth: window.endMonth,
          untilGoal: window.untilGoal,
          ...(explicitStart ? { startMonth: window.startMonth } : {}),
        },
      });
    }

    return this.budget.createCommitment(userId, {
      titleHe: `הקצאה ליעד: ${goal.title}`,
      categoryKey: "goal_funding",
      expectedAmount: dto.monthlyAmount,
      merchantNorm: merchant,
      nature: "FIXED",
      cadence: "MONTHLY",
      anchorDay: dto.anchorDay,
      startMonth: window.startMonth,
      endMonth: window.endMonth,
      untilGoal: window.untilGoal,
    });
  }

  async applyStandingRange(
    userId: string,
    id: string,
    dto: ApplyStandingRangeDto,
  ) {
    if (!dto.confirm) {
      throw new BadRequestException(
        "נדרש אישור מפורש (confirm: true) לפני ביצוע הוראת קבע",
      );
    }
    if (dto.fromMonth > dto.toMonth) {
      throw new BadRequestException("טווח חודשים לא תקין");
    }

    const goal = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException("יעד לא נמצא");
    const merchant = goalMerchant(id);
    const standing = await this.prisma.budgetCommitment.findFirst({
      where: { userId, merchantNorm: merchant, active: true },
    });
    if (!standing) throw new NotFoundException("אין הוראת קבע פעילה");

    const amount = Number(standing.expectedAmount);
    const months = monthsInRange(dto.fromMonth, dto.toMonth);
    if (months.length > 36) {
      throw new BadRequestException("טווח מקסימלי 36 חודשים");
    }

    const existingTx = await this.prisma.transaction.findMany({
      where: { userId, categoryKey: "goal_funding", merchantNorm: merchant },
    });
    const doneMonths = new Set(
      existingTx.map((t) => monthKey(new Date(t.bookedAt))),
    );

    const applied: Array<{
      month: string;
      transactionId: string;
      amount: number;
    }> = [];
    const skipped: Array<{ month: string; reasonHe: string }> = [];
    const nowKey = monthKey(new Date());
    let currentAmount = Number(goal.currentAmount);
    const target = Number(goal.targetAmount);

    for (const m of months) {
      const remaining = Math.max(0, target - currentAmount);
      if (!standingActiveInMonth(standing, m, remaining)) {
        skipped.push({ month: m, reasonHe: "מחוץ למשך הוראת הקבע" });
        continue;
      }
      if (doneMonths.has(m)) {
        skipped.push({ month: m, reasonHe: "כבר בוצע" });
        continue;
      }
      if (remaining <= 0.01) {
        skipped.push({ month: m, reasonHe: "היעד כבר מולא" });
        continue;
      }

      const applyAmt = Math.min(amount, remaining);
      if (m <= nowKey) {
        const snap = await this.budget.snapshot(userId, m);
        // leftover shrinks as we apply in same request for same month only once
        if (applyAmt > snap.leftover + 0.01) {
          skipped.push({
            month: m,
            reasonHe: `נותר לא מספיק (₪${Math.round(snap.leftover).toLocaleString("he-IL")})`,
          });
          continue;
        }
      }

      const next = currentAmount + applyAmt;
      const bookedAt = bookedAtForMonth(m);
      const account = await this.ensureCheckingAccount(userId);
      const [, tx] = await this.prisma.$transaction([
        this.prisma.goal.update({
          where: { id },
          data: { currentAmount: new Prisma.Decimal(next) },
        }),
        this.prisma.transaction.create({
          data: {
            userId,
            accountId: account.id,
            direction: "EXPENSE",
            amount: new Prisma.Decimal(applyAmt),
            categoryKey: "goal_funding",
            description: `הקצאה ליעד: ${goal.title}`,
            merchantNorm: merchant,
            bookedAt,
            sourceType: "USER_INPUT",
            userConfirmed: true,
          },
        }),
        this.prisma.financialAccount.update({
          where: { id: account.id },
          data: {
            currentBalance: {
              increment: balanceDelta("EXPENSE", applyAmt),
            },
          },
        }),
        this.prisma.auditEvent.create({
          data: {
            userId,
            action: "GOAL_STANDING_APPLIED",
            meta: JSON.stringify({
              goalId: id,
              amount: applyAmt,
              month: m,
              range: true,
            }),
          },
        }),
      ]);

      currentAmount = next;
      doneMonths.add(m);
      applied.push({ month: m, transactionId: tx.id, amount: applyAmt });
    }

    const total = applied.reduce((s, a) => s + a.amount, 0);
    return {
      ok: true,
      applied,
      skipped,
      messageHe:
        applied.length > 0
          ? `בוצעו ${applied.length} הקצאות · סה״כ ₪${total.toLocaleString("he-IL")}`
          : "לא בוצעו הקצאות חדשות בטווח שנבחר",
    };
  }

  async stopStanding(userId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException("יעד לא נמצא");
    const merchant = goalMerchant(id);
    const existing = await this.prisma.budgetCommitment.findFirst({
      where: { userId, merchantNorm: merchant, active: true },
    });
    if (!existing) throw new NotFoundException("אין הוראת קבע פעילה");
    return this.budget.deactivateCommitment(userId, existing.id);
  }

  /** Remove goal; standing stops. Past allocations stay in Transactions (reverse there if needed). */
  async remove(userId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException("יעד לא נמצא");
    const merchant = goalMerchant(id);
    await this.prisma.budgetCommitment.updateMany({
      where: { userId, merchantNorm: merchant, active: true },
      data: { active: false },
    });
    await this.prisma.goal.delete({ where: { id } });
    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "GOAL_REMOVED",
        meta: JSON.stringify({
          goalId: id,
          title: goal.title,
          currentAmount: Number(goal.currentAmount),
        }),
      },
    });
    return { ok: true };
  }

  private buildForecast(
    g: {
      targetAmount: Prisma.Decimal;
      currentAmount: Prisma.Decimal;
      targetDate: Date | null;
    },
    standing: { expectedAmount: Prisma.Decimal } | null,
    recentTx: Array<{ amount: Prisma.Decimal; bookedAt: Date }>,
  ) {
    const target = Number(g.targetAmount);
    const current = Number(g.currentAmount);
    const remaining = Math.max(0, target - current);

    let monthlyPace = 0;
    let paceSource: "standing" | "average" | "target_needed" | "none" = "none";

    if (standing) {
      monthlyPace = Number(standing.expectedAmount);
      paceSource = "standing";
    } else if (recentTx.length > 0) {
      const byMonth = new Map<string, number>();
      for (const t of recentTx) {
        const k = monthKey(new Date(t.bookedAt));
        byMonth.set(k, (byMonth.get(k) || 0) + Number(t.amount));
      }
      const vals = [...byMonth.values()];
      monthlyPace = vals.reduce((a, b) => a + b, 0) / vals.length;
      paceSource = "average";
    }

    let targetNeeded: number | null = null;
    if (g.targetDate && remaining > 0) {
      const now = new Date();
      const t = new Date(g.targetDate);
      const months = Math.max(
        1,
        (t.getFullYear() - now.getFullYear()) * 12 +
          (t.getMonth() - now.getMonth()),
      );
      targetNeeded = Math.ceil(remaining / months);
      if (paceSource === "none") {
        monthlyPace = targetNeeded;
        paceSource = "target_needed";
      }
    }

    let etaMonth: string | null = null;
    let onTrack: boolean | null = null;
    let shortfallPerMonth: number | null = null;

    if (remaining <= 0) {
      etaMonth = monthKey(new Date());
      onTrack = true;
    } else if (monthlyPace > 0 && paceSource !== "target_needed") {
      const monthsNeeded = Math.ceil(remaining / monthlyPace);
      const eta = new Date();
      eta.setMonth(eta.getMonth() + monthsNeeded);
      etaMonth = monthKey(eta);
      if (g.targetDate) {
        const targetM = monthKey(new Date(g.targetDate));
        onTrack = etaMonth <= targetM;
        if (!onTrack && targetNeeded != null) {
          shortfallPerMonth = Math.max(0, targetNeeded - monthlyPace);
        }
      }
    }

    return {
      remaining: Math.round(remaining * 100) / 100,
      monthlyPace: Math.round(monthlyPace * 100) / 100,
      paceSource,
      targetNeeded,
      etaMonth,
      onTrack,
      shortfallPerMonth:
        shortfallPerMonth != null
          ? Math.round(shortfallPerMonth * 100) / 100
          : null,
    };
  }
}
