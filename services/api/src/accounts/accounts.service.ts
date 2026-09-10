import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MonthFactsService } from "../month-facts/month-facts.service";
import { CreateAccountDto, UpdateAccountDto } from "./accounts.dto";
import { cashBalanceFromTransactions } from "./checking-balance";

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  list(userId: string) {
    return this.prisma.financialAccount.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Pocket cash wallet — at most one active CASH account per user. */
  async ensureCashAccount(userId: string) {
    const existing = await this.prisma.financialAccount.findFirst({
      where: { userId, isActive: true, kind: "CASH" },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing;
    const account = await this.prisma.financialAccount.create({
      data: {
        userId,
        name: "מזומן בכיס",
        kind: "CASH",
        currentBalance: new Prisma.Decimal(0),
        sourceType: "USER_INPUT",
        userConfirmed: true,
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "ACCOUNT_CREATED",
        meta: JSON.stringify({ accountId: account.id, kind: "CASH" }),
      },
    });
    this.monthFacts.invalidateUser(userId);
    return account;
  }

  async create(userId: string, dto: CreateAccountDto) {
    if (dto.kind === "CASH") {
      const existingCash = await this.prisma.financialAccount.findFirst({
        where: { userId, isActive: true, kind: "CASH" },
      });
      if (existingCash) {
        throw new BadRequestException("כבר קיים ארנק מזומן");
      }
      const account = await this.prisma.financialAccount.create({
        data: {
          userId,
          name: dto.name?.trim() || "מזומן בכיס",
          kind: "CASH",
          currentBalance: new Prisma.Decimal(0),
          sourceType: "USER_INPUT",
          userConfirmed: true,
        },
      });
      await this.prisma.auditEvent.create({
        data: {
          userId,
          action: "ACCOUNT_CREATED",
          meta: JSON.stringify({ accountId: account.id, kind: "CASH" }),
        },
      });
      this.monthFacts.invalidateUser(userId);
      return account;
    }
    if (dto.kind !== "BANK") {
      throw new BadRequestException("כרגע נתמכים רק חשבון בנק וארנק מזומן");
    }
    const existingBank = await this.prisma.financialAccount.findFirst({
      where: { userId, isActive: true, kind: "BANK" },
    });
    if (existingBank) {
      throw new BadRequestException(
        "כרגע ניתן לנהל חשבון בנק אחד בלבד",
      );
    }
    const account = await this.prisma.financialAccount.create({
      data: {
        userId,
        name: dto.name,
        kind: "BANK",
        currentBalance: new Prisma.Decimal(0),
        sourceType: "USER_INPUT",
        userConfirmed: true,
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: "ACCOUNT_CREATED",
        meta: JSON.stringify({ accountId: account.id }),
      },
    });
    return account;
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    await this.ensureOwned(userId, id);
    if (dto.kind === "CREDIT_CARD" || dto.kind === "LOAN") {
      throw new BadRequestException(
        "כרטיס אשראי והלוואה מנוהלים במסך אשראי והלוואות — לא כחשבון עו״ש",
      );
    }
    const account = await this.prisma.financialAccount.update({
      where: { id },
      data: {
        name: dto.name,
        kind: dto.kind,
        isActive: dto.isActive,
        // Checking is derived from transactions, not a separately typed snapshot.
      },
    });
    this.monthFacts.invalidateUser(userId);
    return account;
  }

  async recomputeCheckingFromTransactions(userId?: string) {
    const accounts = await this.prisma.financialAccount.findMany({
      where: {
        kind: "BANK",
        isActive: true,
        ...(userId ? { userId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    const byUser = new Map<string, typeof accounts>();
    for (const account of accounts) {
      const list = byUser.get(account.userId) ?? [];
      list.push(account);
      byUser.set(account.userId, list);
    }

    let updated = 0;
    for (const [ownerId, userAccounts] of byUser) {
      const primary = userAccounts[0];
      const txs = await this.prisma.transaction.findMany({
        where: { userId: ownerId },
        select: { direction: true, amount: true, economicRole: true },
      });
      const next = cashBalanceFromTransactions(txs);
      if (Number(primary.currentBalance) !== next) {
        await this.prisma.financialAccount.update({
          where: { id: primary.id },
          data: { currentBalance: new Prisma.Decimal(next) },
        });
        updated += 1;
      }
      for (const extra of userAccounts.slice(1)) {
        if (Number(extra.currentBalance) === 0) continue;
        await this.prisma.financialAccount.update({
          where: { id: extra.id },
          data: { currentBalance: new Prisma.Decimal(0) },
        });
        updated += 1;
      }
      this.monthFacts.invalidateUser(ownerId);
    }
    return { accounts: accounts.length, updated };
  }

  private async ensureOwned(userId: string, id: string) {
    const row = await this.prisma.financialAccount.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException("חשבון לא נמצא");
    return row;
  }
}
