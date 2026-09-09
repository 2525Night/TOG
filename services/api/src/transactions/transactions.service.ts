import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { EconomicRole, Prisma, TxDirection } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MonthFactsService } from "../month-facts/month-facts.service";
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from "./transactions.dto";

type DbClient = Prisma.TransactionClient | PrismaService;

function balanceSignedDelta(
  direction: TxDirection,
  amount: number,
  economicRole: EconomicRole | string,
): number {
  // Card purchases do not move bank cash until settlement.
  if (economicRole === "CARD_PURCHASE") return 0;
  if (direction === "INCOME") return amount;
  if (direction === "EXPENSE") return -amount;
  return 0;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  private async ensureCheckingAccountId(userId: string) {
    const bank = await this.prisma.financialAccount.findFirst({
      where: { userId, isActive: true, kind: "BANK" },
      orderBy: { createdAt: "asc" },
    });
    if (bank) return bank.id;
    const any = await this.prisma.financialAccount.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (any) return any.id;
    const created = await this.prisma.financialAccount.create({
      data: {
        userId,
        name: "עו״ש ראשי",
        kind: "BANK",
        currentBalance: new Prisma.Decimal(0),
        sourceType: "USER_INPUT",
        userConfirmed: true,
      },
    });
    return created.id;
  }

  private async assertLinks(
    userId: string,
    opts: {
      loanId?: string | null;
      creditCardId?: string | null;
      installmentPlanId?: string | null;
      economicRole: EconomicRole;
    },
  ) {
    if (opts.loanId) {
      const loan = await this.prisma.loan.findFirst({
        where: { id: opts.loanId, userId, active: true },
      });
      if (!loan) throw new NotFoundException("הלוואה לא נמצאה");
    }
    if (opts.creditCardId) {
      const card = await this.prisma.creditCard.findFirst({
        where: { id: opts.creditCardId, userId, active: true },
      });
      if (!card) throw new NotFoundException("כרטיס לא נמצא");
    }
    if (opts.installmentPlanId) {
      const plan = await this.prisma.installmentPlan.findFirst({
        where: {
          id: opts.installmentPlanId,
          userId,
          active: true,
          ...(opts.creditCardId ? { creditCardId: opts.creditCardId } : {}),
        },
      });
      if (!plan) throw new NotFoundException("פריסה לא נמצאה");
    }
    if (
      opts.economicRole === "LOAN_PAYMENT" &&
      !opts.loanId
    ) {
      throw new BadRequestException("תשלום הלוואה דורש שיוך להלוואה");
    }
    if (
      (opts.economicRole === "CARD_PURCHASE" ||
        opts.economicRole === "CARD_SETTLEMENT") &&
      !opts.creditCardId
    ) {
      throw new BadRequestException("תנועת כרטיס דורשת שיוך לכרטיס");
    }
  }

  private async applyDomainSideEffects(
    db: DbClient,
    userId: string,
    opts: {
      economicRole: EconomicRole;
      amount: number;
      loanId?: string | null;
      creditCardId?: string | null;
      sign: 1 | -1;
    },
  ) {
    const delta = opts.sign * opts.amount;
    if (opts.economicRole === "LOAN_PAYMENT" && opts.loanId) {
      const loan = await db.loan.findFirst({
        where: { id: opts.loanId, userId },
      });
      if (loan) {
        const next = Math.max(0, Number(loan.principalBalance) - delta);
        await db.loan.update({
          where: { id: opts.loanId },
          data: {
            principalBalance: new Prisma.Decimal(next),
            ...(opts.sign > 0 && next <= 0.001 ? { nextDueDate: null } : {}),
          },
        });
      }
    }
    if (
      (opts.economicRole === "CARD_PURCHASE" ||
        opts.economicRole === "CARD_SETTLEMENT") &&
      opts.creditCardId
    ) {
      const card = await db.creditCard.findFirst({
        where: { id: opts.creditCardId, userId },
      });
      if (card) {
        const bal = Number(card.currentBalance);
        const next =
          opts.economicRole === "CARD_PURCHASE"
            ? Math.max(0, bal + delta)
            : Math.max(0, bal - delta);
        await db.creditCard.update({
          where: { id: opts.creditCardId },
          data: { currentBalance: new Prisma.Decimal(next) },
        });
      }
    }
  }

  async list(
    userId: string,
    opts?: {
      month?: string;
      loanId?: string;
      creditCardId?: string;
      limit?: number;
      before?: string;
      beforeId?: string;
      /** After the selected month is exhausted — load txs before month start */
      older?: boolean | string;
    },
  ) {
    const limit = Math.min(
      Math.max(Number(opts?.limit) || 40, 1),
      100,
    );
    const wantOlder =
      opts?.older === true ||
      opts?.older === "1" ||
      opts?.older === "true";

    const where: Prisma.TransactionWhereInput = { userId };
    if (opts?.loanId) where.loanId = opts.loanId;
    if (opts?.creditCardId) where.creditCardId = opts.creditCardId;

    let monthStart: Date | null = null;
    let monthEnd: Date | null = null;
    if (opts?.month && /^\d{4}-\d{2}$/.test(opts.month)) {
      const [y, m] = opts.month.split("-").map(Number);
      monthStart = new Date(y, m - 1, 1);
      monthEnd = new Date(y, m, 1);
    }

    const beforeDate =
      opts?.before && !Number.isNaN(Date.parse(opts.before))
        ? new Date(opts.before)
        : null;
    const beforeId = opts?.beforeId?.trim() || null;

    const andParts: Prisma.TransactionWhereInput[] = [];

    if (monthStart && monthEnd && !wantOlder) {
      andParts.push({
        bookedAt: { gte: monthStart, lt: monthEnd },
      });
    } else if (monthStart && wantOlder) {
      andParts.push({ bookedAt: { lt: monthStart } });
    }

    if (beforeDate) {
      if (beforeId) {
        andParts.push({
          OR: [
            { bookedAt: { lt: beforeDate } },
            { bookedAt: beforeDate, id: { lt: beforeId } },
          ],
        });
      } else {
        andParts.push({ bookedAt: { lt: beforeDate } });
      }
    }

    if (andParts.length) where.AND = andParts;

    const rows = await this.prisma.transaction.findMany({
      where,
      orderBy: [{ bookedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        account: { select: { id: true, name: true } },
        loan: { select: { id: true, name: true, provider: true } },
        creditCard: {
          select: { id: true, name: true, lastFour: true, provider: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];

    return {
      items,
      hasMore,
      nextBefore: last ? last.bookedAt.toISOString() : null,
      nextBeforeId: last ? last.id : null,
    };
  }

  async create(userId: string, dto: CreateTransactionDto) {
    const economicRole = dto.economicRole ?? EconomicRole.STANDARD;
    await this.assertLinks(userId, {
      loanId: dto.loanId,
      creditCardId: dto.creditCardId,
      installmentPlanId: dto.installmentPlanId,
      economicRole,
    });

    if (economicRole === "LOAN_PAYMENT" && dto.loanId) {
      const loan = await this.prisma.loan.findFirst({
        where: { id: dto.loanId, userId, active: true },
        select: { id: true, principalBalance: true },
      });
      if (!loan) throw new NotFoundException("הלוואה לא נמצאה");
      if (Number(loan.principalBalance) <= 0.001) {
        throw new BadRequestException(
          "ההלוואה כבר סגורה (יתרה 0) — אין מה לרשום תשלום",
        );
      }
      const booked = new Date(dto.bookedAt);
      if (!Number.isNaN(booked.getTime())) {
        const y = booked.getFullYear();
        const m = booked.getMonth();
        const rangeStart = new Date(y, m, 1);
        const rangeEnd = new Date(y, m + 1, 1);
        const existing = await this.prisma.transaction.findFirst({
          where: {
            userId,
            loanId: dto.loanId,
            economicRole: "LOAN_PAYMENT",
            bookedAt: { gte: rangeStart, lt: rangeEnd },
          },
          select: { id: true },
        });
        if (existing) {
          throw new BadRequestException(
            "כבר נרשם תשלום להלוואה זו בחודש זה — אפשר למחוק את הקיים ואז לרשום מחדש",
          );
        }
      }
    }

    let accountId = dto.accountId || null;
    if (economicRole === "CARD_PURCHASE") {
      // Purchases live on the card domain; bank cash moves on settlement.
      accountId = null;
    } else if (accountId) {
      const account = await this.prisma.financialAccount.findFirst({
        where: { id: accountId, userId },
      });
      if (!account) throw new NotFoundException("חשבון לא נמצא");
    } else if (dto.direction === "INCOME" || dto.direction === "EXPENSE") {
      accountId = await this.ensureCheckingAccountId(userId);
    }

    const tx = await this.prisma.$transaction(async (db) => {
      const created = await db.transaction.create({
        data: {
          userId,
          accountId,
          direction: dto.direction,
          amount: new Prisma.Decimal(dto.amount),
          categoryKey: dto.categoryKey,
          description: dto.description || null,
          bookedAt: new Date(dto.bookedAt),
          sourceType: "USER_INPUT",
          userConfirmed: true,
          economicRole,
          loanId: dto.loanId || null,
          creditCardId: dto.creditCardId || null,
          installmentPlanId: dto.installmentPlanId || null,
        },
      });

      if (accountId) {
        const delta = balanceSignedDelta(
          dto.direction,
          dto.amount,
          economicRole,
        );
        if (delta !== 0) {
          await db.financialAccount.update({
            where: { id: accountId },
            data: { currentBalance: { increment: delta } },
          });
        }
      }

      await this.applyDomainSideEffects(db, userId, {
        economicRole,
        amount: dto.amount,
        loanId: dto.loanId,
        creditCardId: dto.creditCardId,
        sign: 1,
      });

      await db.auditEvent.create({
        data: {
          userId,
          action: "TRANSACTION_CREATED",
          meta: JSON.stringify({
            transactionId: created.id,
            sourceType: "USER_INPUT",
            economicRole,
          }),
        },
      });

      return created;
    });

    this.monthFacts.invalidateUser(userId);
    return tx;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const existing = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException("תנועה לא נמצאה");

    if (existing.installmentPlanId) {
      const amountChanged =
        dto.amount !== undefined &&
        Math.abs(dto.amount - Number(existing.amount)) > 0.001;
      const roleChanged =
        dto.economicRole !== undefined &&
        dto.economicRole !== existing.economicRole;
      const planChanged =
        dto.installmentPlanId !== undefined &&
        dto.installmentPlanId !== existing.installmentPlanId;
      const cardChanged =
        dto.creditCardId !== undefined &&
        dto.creditCardId !== existing.creditCardId;
      const directionChanged =
        dto.direction !== undefined && dto.direction !== existing.direction;
      if (
        amountChanged ||
        roleChanged ||
        planChanged ||
        cardChanged ||
        directionChanged
      ) {
        throw new BadRequestException(
          "עסקה בתשלומים: לא ניתן לשנות סכום או קישור. מחקו את הפריסה או את התנועה והזינו מחדש.",
        );
      }
    }

    const nextDirection = dto.direction ?? existing.direction;
    const nextAmount =
      dto.amount !== undefined ? dto.amount : Number(existing.amount);
    let nextCategory = dto.categoryKey ?? existing.categoryKey;
    if (
      dto.direction &&
      dto.direction !== existing.direction &&
      !dto.categoryKey
    ) {
      nextCategory =
        dto.direction === "INCOME"
          ? "salary"
          : dto.direction === "TRANSFER"
            ? "other"
            : "other";
    }

    const nextDescription =
      dto.description === undefined
        ? existing.description
        : dto.description;
    const nextNote =
      dto.note === undefined ? existing.note : dto.note;
    const nextRole = dto.economicRole ?? existing.economicRole;
    const nextLoanId =
      dto.loanId === undefined ? existing.loanId : dto.loanId;
    const nextCardId =
      dto.creditCardId === undefined
        ? existing.creditCardId
        : dto.creditCardId;
    const nextPlanId =
      dto.installmentPlanId === undefined
        ? existing.installmentPlanId
        : dto.installmentPlanId;

    await this.assertLinks(userId, {
      loanId: nextLoanId,
      creditCardId: nextCardId,
      installmentPlanId: nextPlanId,
      economicRole: nextRole,
    });

    const updated = await this.prisma.$transaction(async (db) => {
      await this.applyDomainSideEffects(db, userId, {
        economicRole: existing.economicRole,
        amount: Number(existing.amount),
        loanId: existing.loanId,
        creditCardId: existing.creditCardId,
        sign: -1,
      });

      const row = await db.transaction.update({
        where: { id },
        data: {
          direction: nextDirection,
          amount: new Prisma.Decimal(nextAmount),
          categoryKey: nextCategory,
          description: nextDescription,
          note: nextNote,
          economicRole: nextRole,
          loanId: nextLoanId,
          creditCardId: nextCardId,
          installmentPlanId: nextPlanId,
          userConfirmed: true,
        },
      });

      if (existing.accountId) {
        const oldSigned = balanceSignedDelta(
          existing.direction,
          Number(existing.amount),
          existing.economicRole,
        );
        const newSigned = balanceSignedDelta(
          nextDirection,
          nextAmount,
          nextRole,
        );
        const delta = newSigned - oldSigned;
        if (delta !== 0) {
          await db.financialAccount.update({
            where: { id: existing.accountId },
            data: { currentBalance: { increment: delta } },
          });
        }
      }

      await this.applyDomainSideEffects(db, userId, {
        economicRole: nextRole,
        amount: nextAmount,
        loanId: nextLoanId,
        creditCardId: nextCardId,
        sign: 1,
      });

      return row;
    });

    this.monthFacts.invalidateUser(userId);
    return updated;
  }

  async updateByMerchant(
    userId: string,
    body: {
      merchantNorm: string;
      categoryKey: string;
      direction?: TxDirection;
      month?: string;
      excludeId?: string;
    },
  ) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      merchantNorm: body.merchantNorm,
    };
    if (body.month && /^\d{4}-\d{2}$/.test(body.month)) {
      const [y, m] = body.month.split("-").map(Number);
      where.bookedAt = {
        gte: new Date(y, m - 1, 1),
        lt: new Date(y, m, 1),
      };
    }
    if (body.excludeId) {
      where.id = { not: body.excludeId };
    }

    const targets = await this.prisma.transaction.findMany({ where });
    let updated = 0;
    for (const t of targets) {
      const nextDirection = body.direction ?? t.direction;
      if (
        t.categoryKey === body.categoryKey &&
        t.direction === nextDirection
      ) {
        continue;
      }
      await this.update(userId, t.id, {
        categoryKey: body.categoryKey,
        direction: body.direction,
      });
      updated += 1;
    }
    return { updated };
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException("תנועה לא נמצאה");

    await this.prisma.$transaction(async (db) => {
      await this.applyDomainSideEffects(db, userId, {
        economicRole: existing.economicRole,
        amount: Number(existing.amount),
        loanId: existing.loanId,
        creditCardId: existing.creditCardId,
        sign: -1,
      });

      await db.transaction.delete({ where: { id } });

      if (existing.accountId) {
        const delta = -balanceSignedDelta(
          existing.direction,
          Number(existing.amount),
          existing.economicRole,
        );
        if (delta !== 0) {
          await db.financialAccount.update({
            where: { id: existing.accountId },
            data: { currentBalance: { increment: delta } },
          });
        }
      }

      await this.syncInstallmentPlanAfterTxRemove(
        db,
        userId,
        existing.installmentPlanId,
        id,
      );
    });

    this.monthFacts.invalidateUser(userId);
    return { ok: true };
  }

  /** Keep installment commitment in sync when a linked purchase is undone. */
  private async syncInstallmentPlanAfterTxRemove(
    db: DbClient,
    userId: string,
    planId: string | null,
    deletedTxId: string,
  ) {
    if (!planId) return;
    const plan = await db.installmentPlan.findFirst({
      where: { id: planId, userId },
    });
    if (!plan) return;

    const newCharged = Math.max(0, plan.chargedCount - 1);
    const clearLink = plan.linkedPurchaseTxId === deletedTxId;

    if (newCharged === 0) {
      await db.installmentPlan.update({
        where: { id: planId },
        data: {
          chargedCount: 0,
          linkedPurchaseTxId: null,
          active: false,
        },
      });
      return;
    }

    await db.installmentPlan.update({
      where: { id: planId },
      data: {
        chargedCount: newCharged,
        ...(clearLink ? { linkedPurchaseTxId: null } : {}),
      },
    });
  }
}
