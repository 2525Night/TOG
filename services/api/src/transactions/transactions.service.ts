import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TxDirection } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from "./transactions.dto";

function balanceSignedDelta(
  direction: TxDirection,
  amount: number,
): number {
  if (direction === "INCOME") return amount;
  if (direction === "EXPENSE") return -amount;
  return 0;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

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

  list(userId: string, month?: string) {
    const where: Prisma.TransactionWhereInput = { userId };
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      where.bookedAt = {
        gte: new Date(y, m - 1, 1),
        lt: new Date(y, m, 1),
      };
    }
    return this.prisma.transaction.findMany({
      where,
      orderBy: { bookedAt: "desc" },
      take: month ? 500 : 120,
      include: { account: { select: { id: true, name: true } } },
    });
  }

  async create(userId: string, dto: CreateTransactionDto) {
    let accountId = dto.accountId || null;
    if (accountId) {
      const account = await this.prisma.financialAccount.findFirst({
        where: { id: accountId, userId },
      });
      if (!account) throw new NotFoundException("חשבון לא נמצא");
    } else if (dto.direction === "INCOME" || dto.direction === "EXPENSE") {
      accountId = await this.ensureCheckingAccountId(userId);
    }

    const tx = await this.prisma.transaction.create({
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
      },
    });

    if (accountId) {
      const delta = balanceSignedDelta(dto.direction, dto.amount);
      if (delta !== 0) {
        await this.prisma.financialAccount.update({
          where: { id: accountId },
          data: { currentBalance: { increment: delta } },
        });
      }
    }

    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "TRANSACTION_CREATED",
        meta: JSON.stringify({
          transactionId: tx.id,
          sourceType: "USER_INPUT",
        }),
      },
    });

    return tx;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const existing = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException("תנועה לא נמצאה");

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

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        direction: nextDirection,
        amount: new Prisma.Decimal(nextAmount),
        categoryKey: nextCategory,
        description: nextDescription,
        note: nextNote,
        userConfirmed: true,
      },
    });

    if (existing.accountId) {
      const oldSigned = balanceSignedDelta(
        existing.direction,
        Number(existing.amount),
      );
      const newSigned = balanceSignedDelta(nextDirection, nextAmount);
      const delta = newSigned - oldSigned;
      if (delta !== 0) {
        await this.prisma.financialAccount.update({
          where: { id: existing.accountId },
          data: { currentBalance: { increment: delta } },
        });
      }
    }

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

    await this.prisma.transaction.delete({ where: { id } });

    if (existing.accountId) {
      const delta = -balanceSignedDelta(
        existing.direction,
        Number(existing.amount),
      );
      if (delta !== 0) {
        await this.prisma.financialAccount.update({
          where: { id: existing.accountId },
          data: { currentBalance: { increment: delta } },
        });
      }
    }

    return { ok: true };
  }
}
