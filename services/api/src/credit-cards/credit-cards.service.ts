import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TransactionsService } from "../transactions/transactions.service";
import { MonthFactsService } from "../month-facts/month-facts.service";
import {
  CreateCreditCardDto,
  CreateInstallmentPlanDto,
  RecordCardChargeDto,
  UpdateCreditCardDto,
  UpdateInstallmentPlanDto,
} from "./credit-cards.dto";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseMonthKey(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { y, m };
}

/** Add n calendar months to YYYY-MM. */
function addMonthsKey(month: string, n: number) {
  const { y, m } = parseMonthKey(month);
  const d = new Date(y, m - 1 + n, 1);
  return monthKey(d);
}

/** Whole months from a to b (b − a). */
function monthsBetweenKeys(a: string, b: string) {
  const A = parseMonthKey(a);
  const B = parseMonthKey(b);
  return (B.y - A.y) * 12 + (B.m - A.m);
}

function remainingInstallments(plan: {
  installmentCount: number;
  chargedCount: number;
  installmentAmount: unknown;
  active: boolean;
}) {
  if (!plan.active) return 0;
  const left = Math.max(0, plan.installmentCount - plan.chargedCount);
  return round2(left * Number(plan.installmentAmount));
}

@Injectable()
export class CreditCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  async list(userId: string, month?: string) {
    const focus =
      month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(new Date());
    const [y, m] = focus.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);

    const cards = await this.prisma.creditCard.findMany({
      where: { userId, active: true },
      orderBy: { updatedAt: "desc" },
      include: {
        installmentPlans: { where: { active: true } },
      },
    });

    const purchaseAgg = await this.prisma.transaction.groupBy({
      by: ["creditCardId"],
      where: {
        userId,
        creditCardId: { not: null },
        economicRole: "CARD_PURCHASE",
        bookedAt: { gte: start, lt: end },
      },
      _sum: { amount: true },
    });
    const cycleByCard = new Map(
      purchaseAgg.map((r) => [
        r.creditCardId as string,
        Number(r._sum.amount || 0),
      ]),
    );

    const items = cards.map((c) => {
      const installmentsRemaining = c.installmentPlans.reduce(
        (s, p) => s + remainingInstallments(p),
        0,
      );
      const monthlyInstallments = c.installmentPlans.reduce((s, p) => {
        if (!p.active) return s;
        if (p.chargedCount >= p.installmentCount) return s;
        return s + Number(p.installmentAmount);
      }, 0);
      const cycleSpend = round2(cycleByCard.get(c.id) || 0);
      const balance = Number(c.currentBalance);
      const limit = Number(c.creditLimit);
      const available = Math.max(0, limit - balance);
      const utilizationPct =
        limit > 0 ? Math.min(100, Math.round((balance / limit) * 100)) : 0;
      // Single source: what still sits on the card (settlements reduce this).
      // cycleSpend is month purchases only — must not inflate after settlement.
      const upcomingCharge = round2(balance);

      return {
        id: c.id,
        name: c.name,
        provider: c.provider,
        lastFour: c.lastFour,
        creditLimit: limit,
        currentBalance: balance,
        availableCredit: round2(available),
        utilizationPct,
        billingDay: c.billingDay,
        nextBillingDate: c.nextBillingDate
          ? c.nextBillingDate.toISOString()
          : null,
        notes: c.notes,
        active: c.active,
        cycleSpend,
        upcomingCharge,
        installmentCommitment: round2(installmentsRemaining),
        monthlyInstallments: round2(monthlyInstallments),
        installmentPlanCount: c.installmentPlans.length,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });

    const totalBalance = round2(
      items.reduce((s, x) => s + x.currentBalance, 0),
    );
    const totalLimit = round2(items.reduce((s, x) => s + x.creditLimit, 0));
    const totalCycle = round2(items.reduce((s, x) => s + x.cycleSpend, 0));
    const totalUpcoming = round2(
      items.reduce((s, x) => s + x.upcomingCharge, 0),
    );
    const totalAvailable = round2(
      items.reduce((s, x) => s + x.availableCredit, 0),
    );
    const totalInstallments = round2(
      items.reduce((s, x) => s + x.installmentCommitment, 0),
    );

    return {
      month: focus,
      items,
      totals: {
        cycleSpend: totalCycle,
        upcomingCharges: totalUpcoming,
        availableCredit: totalAvailable,
        currentBalance: totalBalance,
        creditLimit: totalLimit,
        utilizationPct:
          totalLimit > 0
            ? Math.min(100, Math.round((totalBalance / totalLimit) * 100))
            : 0,
        activeCount: items.length,
        installmentCommitment: totalInstallments,
      },
    };
  }

  async get(userId: string, id: string, month?: string) {
    const card = await this.prisma.creditCard.findFirst({
      where: { id, userId, active: true },
      include: { installmentPlans: { where: { active: true } } },
    });
    if (!card) throw new NotFoundException("כרטיס לא נמצא");

    const list = await this.list(userId, month);
    const summary = list.items.find((i) => i.id === id);
    if (!summary) throw new NotFoundException("כרטיס לא נמצא");

    const focus =
      month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(new Date());

    const txs = await this.prisma.transaction.findMany({
      where: { userId, creditCardId: id },
      orderBy: { bookedAt: "desc" },
      take: 80,
      include: { account: { select: { id: true, name: true } } },
    });

    return {
      ...summary,
      focusMonth: focus,
      installmentPlans: card.installmentPlans.map((p) =>
        this.serializePlan(p, focus),
      ),
      transactions: txs.map((t) => ({
        id: t.id,
        direction: t.direction,
        amount: Number(t.amount),
        categoryKey: t.categoryKey,
        description: t.description,
        economicRole: t.economicRole,
        installmentPlanId: t.installmentPlanId,
        bookedAt: t.bookedAt.toISOString(),
        account: t.account,
      })),
    };
  }

  async create(userId: string, dto: CreateCreditCardDto) {
    const row = await this.prisma.creditCard.create({
      data: {
        userId,
        name: dto.name.trim(),
        provider: dto.provider?.trim() || null,
        lastFour: dto.lastFour?.trim() || null,
        creditLimit: new Prisma.Decimal(dto.creditLimit ?? 0),
        currentBalance: new Prisma.Decimal(dto.currentBalance ?? 0),
        billingDay: dto.billingDay ?? null,
        nextBillingDate: dto.nextBillingDate
          ? new Date(dto.nextBillingDate)
          : null,
        notes: dto.notes?.trim() || null,
      },
    });
    this.monthFacts.invalidateUser(userId);
    return (await this.list(userId)).items.find((i) => i.id === row.id);
  }

  async update(userId: string, id: string, dto: UpdateCreditCardDto) {
    const existing = await this.prisma.creditCard.findFirst({
      where: { id, userId, active: true },
    });
    if (!existing) throw new NotFoundException("כרטיס לא נמצא");

    await this.prisma.creditCard.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.provider !== undefined
          ? { provider: dto.provider?.trim() || null }
          : {}),
        ...(dto.lastFour !== undefined
          ? { lastFour: dto.lastFour?.trim() || null }
          : {}),
        ...(dto.creditLimit != null
          ? { creditLimit: new Prisma.Decimal(dto.creditLimit) }
          : {}),
        ...(dto.currentBalance != null
          ? { currentBalance: new Prisma.Decimal(dto.currentBalance) }
          : {}),
        ...(dto.billingDay !== undefined ? { billingDay: dto.billingDay } : {}),
        ...(dto.nextBillingDate !== undefined
          ? {
              nextBillingDate: dto.nextBillingDate
                ? new Date(dto.nextBillingDate)
                : null,
            }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
      },
    });
    this.monthFacts.invalidateUser(userId);
    return (await this.list(userId)).items.find((i) => i.id === id);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.creditCard.findFirst({
      where: { id, userId, active: true },
    });
    if (!existing) throw new NotFoundException("כרטיס לא נמצא");
    await this.prisma.creditCard.update({
      where: { id },
      data: { active: false },
    });
    await this.prisma.installmentPlan.updateMany({
      where: { creditCardId: id, userId },
      data: { active: false },
    });
    this.monthFacts.invalidateUser(userId);
    return { ok: true };
  }

  /**
   * Record a card purchase:
   * - installmentCount 1 → full amount as CARD_PURCHASE (MonthFacts expense + balance).
   * - installmentCount ≥2 → InstallmentPlan; only this month's installment is expense;
   *   remaining installments stay as future commitment (not double-counted).
   */
  async recordCharge(userId: string, cardId: string, dto: RecordCardChargeDto) {
    const card = await this.prisma.creditCard.findFirst({
      where: { id: cardId, userId, active: true },
    });
    if (!card) throw new NotFoundException("כרטיס לא נמצא");

    const count = dto.installmentCount ?? 1;
    if (count < 1) {
      throw new BadRequestException("מספר תשלומים לא תקין");
    }

    const description = dto.description.trim();
    if (!description) {
      throw new BadRequestException("נא להזין תיאור");
    }

    const booked = new Date(dto.bookedAt);
    if (Number.isNaN(booked.getTime())) {
      throw new BadRequestException("תאריך לא תקין");
    }
    const startMonth = monthKey(booked);

    if (count === 1) {
      const tx = await this.transactions.create(userId, {
        direction: "EXPENSE",
        amount: dto.amount,
        categoryKey: dto.categoryKey,
        description,
        bookedAt: dto.bookedAt,
        economicRole: "CARD_PURCHASE",
        creditCardId: cardId,
      });
      return {
        mode: "ONE_TIME" as const,
        thisMonthCharge: dto.amount,
        futureCommitment: 0,
        originalAmount: dto.amount,
        installmentCount: 1,
        transaction: tx,
        plan: null,
      };
    }

    const installmentAmount = round2(dto.amount / count);
    if (installmentAmount < 0.01) {
      throw new BadRequestException("סכום תשלום קטן מדי");
    }

    const plan = await this.prisma.installmentPlan.create({
      data: {
        userId,
        creditCardId: cardId,
        titleHe: description,
        originalAmount: new Prisma.Decimal(dto.amount),
        installmentCount: count,
        installmentAmount: new Prisma.Decimal(installmentAmount),
        chargedCount: 0,
        startMonth,
      },
    });

    const tx = await this.transactions.create(userId, {
      direction: "EXPENSE",
      amount: installmentAmount,
      categoryKey: dto.categoryKey,
      description: `${description} (תשלום 1/${count})`,
      bookedAt: dto.bookedAt,
      economicRole: "CARD_PURCHASE",
      creditCardId: cardId,
      installmentPlanId: plan.id,
    });

    const updatedPlan = await this.prisma.installmentPlan.update({
      where: { id: plan.id },
      data: {
        chargedCount: 1,
        linkedPurchaseTxId: tx.id,
      },
    });

    return {
      mode: "INSTALLMENTS" as const,
      thisMonthCharge: installmentAmount,
      futureCommitment: round2(installmentAmount * (count - 1)),
      originalAmount: dto.amount,
      installmentCount: count,
      transaction: tx,
      plan: this.serializePlan(updatedPlan),
    };
  }

  async createInstallment(
    userId: string,
    cardId: string,
    dto: CreateInstallmentPlanDto,
  ) {
    const card = await this.prisma.creditCard.findFirst({
      where: { id: cardId, userId, active: true },
    });
    if (!card) throw new NotFoundException("כרטיס לא נמצא");
    if (!/^\d{4}-\d{2}$/.test(dto.startMonth)) {
      throw new BadRequestException("startMonth חייב להיות YYYY-MM");
    }
    const installmentAmount =
      dto.installmentAmount ??
      round2(dto.originalAmount / dto.installmentCount);

    const plan = await this.prisma.installmentPlan.create({
      data: {
        userId,
        creditCardId: cardId,
        titleHe: dto.titleHe.trim(),
        originalAmount: new Prisma.Decimal(dto.originalAmount),
        installmentCount: dto.installmentCount,
        installmentAmount: new Prisma.Decimal(installmentAmount),
        chargedCount: dto.chargedCount ?? 0,
        startMonth: dto.startMonth,
        linkedPurchaseTxId: dto.linkedPurchaseTxId || null,
      },
    });
    return this.serializePlan(plan);
  }

  async updateInstallment(
    userId: string,
    cardId: string,
    planId: string,
    dto: UpdateInstallmentPlanDto,
  ) {
    const plan = await this.prisma.installmentPlan.findFirst({
      where: { id: planId, creditCardId: cardId, userId },
    });
    if (!plan) throw new NotFoundException("פריסה לא נמצאה");

    const updated = await this.prisma.installmentPlan.update({
      where: { id: planId },
      data: {
        ...(dto.titleHe != null ? { titleHe: dto.titleHe.trim() } : {}),
        ...(dto.chargedCount != null ? { chargedCount: dto.chargedCount } : {}),
        ...(dto.installmentAmount != null
          ? {
              installmentAmount: new Prisma.Decimal(dto.installmentAmount),
            }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    return this.serializePlan(updated);
  }

  async removeInstallment(userId: string, cardId: string, planId: string) {
    const plan = await this.prisma.installmentPlan.findFirst({
      where: { id: planId, creditCardId: cardId, userId, active: true },
    });
    if (!plan) throw new NotFoundException("פריסה לא נמצאה");

    const linked = await this.prisma.transaction.findMany({
      where: { userId, installmentPlanId: planId },
      select: { id: true },
    });
    for (const t of linked) {
      await this.transactions.remove(userId, t.id);
    }

    const still = await this.prisma.installmentPlan.findFirst({
      where: { id: planId, userId },
    });
    if (still?.active) {
      await this.prisma.installmentPlan.update({
        where: { id: planId },
        data: { active: false, linkedPurchaseTxId: null },
      });
    }
    return { ok: true };
  }

  /**
   * Register due installment purchases through the focus month (inclusive).
   * Creates one CARD_PURCHASE per missing schedule month up to `month`
   * so a plan like 3× from July fills Aug+Sep when rolling September.
   */
  async chargeDueInstallments(
    userId: string,
    month: string,
    cardId?: string,
  ) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException("חודש חייב להיות YYYY-MM");
    }
    if (cardId) {
      const card = await this.prisma.creditCard.findFirst({
        where: { id: cardId, userId, active: true },
      });
      if (!card) throw new NotFoundException("כרטיס לא נמצא");
    }

    const plans = await this.prisma.installmentPlan.findMany({
      where: {
        userId,
        active: true,
        ...(cardId ? { creditCardId: cardId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    const charged: Array<{
      planId: string;
      creditCardId: string;
      titleHe: string;
      paymentIndex: number;
      installmentCount: number;
      amount: number;
      transactionId: string;
      month: string;
    }> = [];
    const skipped: Array<{
      planId: string;
      reason: "not_due" | "already" | "completed";
    }> = [];

    for (const plan of plans) {
      if (plan.chargedCount >= plan.installmentCount) {
        await this.prisma.installmentPlan.update({
          where: { id: plan.id },
          data: { active: false },
        });
        skipped.push({ planId: plan.id, reason: "completed" });
        continue;
      }

      if (monthsBetweenKeys(plan.startMonth, month) < 0) {
        skipped.push({ planId: plan.id, reason: "not_due" });
        continue;
      }

      const priorTx = await this.prisma.transaction.findFirst({
        where: { userId, installmentPlanId: plan.id },
        orderBy: { bookedAt: "asc" },
        select: { categoryKey: true },
      });
      const categoryKey = priorTx?.categoryKey || "other";
      const amount = round2(Number(plan.installmentAmount));
      if (amount < 0.01) {
        skipped.push({ planId: plan.id, reason: "not_due" });
        continue;
      }

      let chargedCount = plan.chargedCount;
      let createdHere = 0;
      let linkedPurchaseTxId = plan.linkedPurchaseTxId;

      while (chargedCount < plan.installmentCount) {
        const dueMonth = addMonthsKey(plan.startMonth, chargedCount);
        if (dueMonth > month) break;

        const [dy, dm] = dueMonth.split("-").map(Number);
        const dStart = new Date(dy, dm - 1, 1);
        const dEnd = new Date(dy, dm, 1);
        const existing = await this.prisma.transaction.findFirst({
          where: {
            userId,
            installmentPlanId: plan.id,
            economicRole: "CARD_PURCHASE",
            bookedAt: { gte: dStart, lt: dEnd },
          },
          select: { id: true },
        });

        const paymentIndex = chargedCount + 1;
        if (existing) {
          chargedCount = paymentIndex;
          continue;
        }

        const bookedDay =
          dueMonth === monthKey(new Date())
            ? Math.min(28, new Date().getDate())
            : 1;
        const bookedAt = `${dueMonth}-${String(bookedDay).padStart(2, "0")}T12:00:00.000Z`;

        const tx = await this.transactions.create(userId, {
          direction: "EXPENSE",
          amount,
          categoryKey,
          description: `${plan.titleHe} (תשלום ${paymentIndex}/${plan.installmentCount})`,
          bookedAt,
          economicRole: "CARD_PURCHASE",
          creditCardId: plan.creditCardId,
          installmentPlanId: plan.id,
        });

        chargedCount = paymentIndex;
        createdHere += 1;
        if (!linkedPurchaseTxId) linkedPurchaseTxId = tx.id;
        charged.push({
          planId: plan.id,
          creditCardId: plan.creditCardId,
          titleHe: plan.titleHe,
          paymentIndex,
          installmentCount: plan.installmentCount,
          amount,
          transactionId: tx.id,
          month: dueMonth,
        });
      }

      const done = chargedCount >= plan.installmentCount;
      await this.prisma.installmentPlan.update({
        where: { id: plan.id },
        data: {
          chargedCount,
          linkedPurchaseTxId,
          ...(done ? { active: false } : {}),
        },
      });

      if (createdHere === 0) {
        const nextDue = addMonthsKey(plan.startMonth, chargedCount);
        if (chargedCount >= plan.installmentCount) {
          skipped.push({ planId: plan.id, reason: "completed" });
        } else if (nextDue > month) {
          skipped.push({ planId: plan.id, reason: "not_due" });
        } else {
          skipped.push({ planId: plan.id, reason: "already" });
        }
      }
    }

    return {
      month,
      chargedCount: charged.length,
      chargedTotal: round2(charged.reduce((s, c) => s + c.amount, 0)),
      charged,
      skipped,
    };
  }

  /** Card settlement / installment amounts due this month (not in commitments). */
  async extraReserveForMonth(userId: string, month: string) {
    const cards = await this.prisma.creditCard.findMany({
      where: { userId, active: true },
      include: { installmentPlans: { where: { active: true } } },
    });
    let sum = 0;
    for (const c of cards) {
      if (c.linkedCommitmentId) continue;
      const dueThisMonth =
        !c.nextBillingDate ||
        monthKey(c.nextBillingDate) === month;
      if (dueThisMonth) {
        // Prefer upcoming settlement ≈ current balance when billing this month
        sum += Number(c.currentBalance);
      }
      for (const p of c.installmentPlans) {
        if (p.chargedCount >= p.installmentCount) continue;
        // Avoid double-count if balance already includes installments — only add
        // future installment commitments beyond currentBalance when balance is 0.
        // Conservative: installments already typically sit inside card balance.
        void p;
      }
    }
    return round2(sum);
  }

  private serializePlan(
    p: {
      id: string;
      creditCardId: string;
      titleHe: string;
      originalAmount: Prisma.Decimal | number;
      installmentCount: number;
      installmentAmount: Prisma.Decimal | number;
      chargedCount: number;
      startMonth: string;
      linkedPurchaseTxId: string | null;
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    focusMonth?: string,
  ) {
    const remainingCount = Math.max(
      0,
      p.installmentCount - p.chargedCount,
    );
    const installmentAmount = Number(p.installmentAmount);
    const focus =
      focusMonth && /^\d{4}-\d{2}$/.test(focusMonth)
        ? focusMonth
        : monthKey(new Date());
    const schedule = Array.from({ length: p.installmentCount }, (_, i) => {
      const m = addMonthsKey(p.startMonth, i);
      let status: "paid" | "due" | "upcoming" = "upcoming";
      if (i < p.chargedCount) status = "paid";
      else if (m <= focus) status = "due";
      return {
        month: m,
        index: i + 1,
        status,
        amount: installmentAmount,
      };
    });
    return {
      id: p.id,
      creditCardId: p.creditCardId,
      titleHe: p.titleHe,
      originalAmount: Number(p.originalAmount),
      installmentCount: p.installmentCount,
      installmentAmount,
      chargedCount: p.chargedCount,
      remainingCount,
      remainingAmount: round2(remainingCount * installmentAmount),
      startMonth: p.startMonth,
      linkedPurchaseTxId: p.linkedPurchaseTxId,
      active: p.active,
      schedule,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
