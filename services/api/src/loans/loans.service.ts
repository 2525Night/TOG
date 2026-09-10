import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MonthFactsService } from "../month-facts/month-facts.service";
import { CreateLoanDto, UpdateLoanDto } from "./loans.dto";
import {
  loanCountsTowardReserve,
  loanReserveAmount,
  monthKeyOf,
} from "./loan-reserve";

function monthKey(d: Date) {
  return monthKeyOf(d);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  async list(userId: string, month?: string) {
    const focus =
      month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(new Date());
    const facts = await this.monthFacts.forMonth(userId, focus);
    const rows = await this.prisma.loan.findMany({
      where: { userId, active: true },
      orderBy: { updatedAt: "desc" },
    });

    const staleClosed = rows.filter((r) => !(Number(r.principalBalance) > 0.001));
    if (staleClosed.length > 0) {
      await this.prisma.loan.updateMany({
        where: { userId, id: { in: staleClosed.map((r) => r.id) } },
        data: { active: false, nextDueDate: null },
      });
      this.monthFacts.invalidateUser(userId);
    }
    const openRows = rows.filter((r) => Number(r.principalBalance) > 0.001);
    const items = openRows.map((r) => this.serialize(r));
    const overdraft =
      facts.checkingBalanceNow < 0
        ? {
            id: "derived-overdraft",
            name: "מינוס בעו״ש",
            provider: null as string | null,
            originalAmount: Math.abs(facts.checkingBalanceNow),
            principalBalance: Math.abs(facts.checkingBalanceNow),
            monthlyPayment: 0,
            aprPercent: null as number | null,
            startDate: null as string | null,
            endDate: null as string | null,
            nextDueDate: null as string | null,
            linkedCommitmentId: null as string | null,
            notes: null as string | null,
            active: true,
            derived: true,
            repaidAmount: 0,
            progressPct: 0,
            remainingPayments: null as number | null,
            estimatedMonthlyInterest: null as number | null,
            estimatedPrincipalInPayment: null as number | null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : null;

    /** Paid-off loans are deactivated above and excluded from overview. */
    const openLoans = items;
    const principalTotal = round2(
      openLoans.reduce((s, x) => s + x.principalBalance, 0),
    );
    const monthlyTotal = round2(
      openLoans.reduce((s, x) => s + x.monthlyPayment, 0),
    );
    const nextPayments = openLoans
      .filter((x) =>
        loanCountsTowardReserve(
          {
            principalBalance: x.principalBalance,
            monthlyPayment: x.monthlyPayment,
            nextDueDate: x.nextDueDate,
            linkedCommitmentId: x.linkedCommitmentId,
          },
          focus,
        ),
      )
      .sort((a, b) => {
        if (!a.nextDueDate) return 1;
        if (!b.nextDueDate) return -1;
        return a.nextDueDate < b.nextDueDate ? -1 : 1;
      });

    return {
      month: focus,
      items: overdraft ? [overdraft, ...openLoans] : openLoans,
      loans: openLoans,
      overdraft,
      totals: {
        principal: principalTotal,
        original: round2(
          openLoans.reduce((s, x) => s + x.originalAmount, 0),
        ),
        repaid: round2(
          openLoans.reduce((s, x) => s + x.repaidAmount, 0),
        ),
        monthlyPayment: monthlyTotal,
        activeCount: openLoans.length,
        closedCount: staleClosed.length,
        nextPaymentAmount: nextPayments[0]?.monthlyPayment ?? null,
        nextPaymentDate: nextPayments[0]?.nextDueDate ?? null,
      },
    };
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.loan.findFirst({
      where: { id, userId, active: true },
    });
    if (!row) throw new NotFoundException("הלוואה לא נמצאה");

    const txs = await this.prisma.transaction.findMany({
      where: { userId, loanId: id },
      orderBy: { bookedAt: "desc" },
      take: 50,
      include: { account: { select: { id: true, name: true } } },
    });

    return {
      ...this.serialize(row),
      transactions: txs.map((t) => ({
        id: t.id,
        direction: t.direction,
        amount: Number(t.amount),
        categoryKey: t.categoryKey,
        description: t.description,
        economicRole: t.economicRole,
        bookedAt: t.bookedAt.toISOString(),
        account: t.account,
      })),
    };
  }

  async create(userId: string, dto: CreateLoanDto) {
    const original = dto.originalAmount;
    const principal = dto.principalBalance;
    if (principal > original + 0.001) {
      throw new BadRequestException("יתרה לא יכולה לעלות על הסכום המקורי");
    }
    const row = await this.prisma.loan.create({
      data: {
        userId,
        name: dto.name.trim(),
        provider: dto.provider?.trim() || null,
        originalAmount: new Prisma.Decimal(original),
        principalBalance: new Prisma.Decimal(principal),
        monthlyPayment: new Prisma.Decimal(dto.monthlyPayment ?? 0),
        aprPercent: dto.aprPercent ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        nextDueDate:
          principal > 0.001 && dto.nextDueDate
            ? new Date(dto.nextDueDate)
            : null,
        notes: dto.notes?.trim() || null,
        active: principal > 0.001,
      },
    });
    this.monthFacts.invalidateUser(userId);
    return this.serialize(row);
  }

  async update(userId: string, id: string, dto: UpdateLoanDto) {
    const existing = await this.prisma.loan.findFirst({
      where: { id, userId, active: true },
    });
    if (!existing) throw new NotFoundException("הלוואה לא נמצאה");

    const nextPrincipal =
      dto.principalBalance != null
        ? dto.principalBalance
        : Number(existing.principalBalance);
    const closed = !(nextPrincipal > 0.001);

    const row = await this.prisma.loan.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.provider !== undefined
          ? { provider: dto.provider?.trim() || null }
          : {}),
        ...(dto.originalAmount != null
          ? { originalAmount: new Prisma.Decimal(dto.originalAmount) }
          : {}),
        ...(dto.principalBalance != null
          ? { principalBalance: new Prisma.Decimal(dto.principalBalance) }
          : {}),
        ...(dto.monthlyPayment != null
          ? { monthlyPayment: new Prisma.Decimal(dto.monthlyPayment) }
          : {}),
        ...(dto.aprPercent !== undefined ? { aprPercent: dto.aprPercent } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
        ...(dto.nextDueDate !== undefined
          ? {
              nextDueDate: dto.nextDueDate
                ? new Date(dto.nextDueDate)
                : null,
            }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(closed
          ? { active: false, nextDueDate: null }
          : {}),
      },
    });
    this.monthFacts.invalidateUser(userId);
    return this.serialize(row);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.loan.findFirst({
      where: { id, userId, active: true },
    });
    if (!existing) throw new NotFoundException("הלוואה לא נמצאה");
    await this.prisma.loan.update({
      where: { id },
      data: { active: false },
    });
    this.monthFacts.invalidateUser(userId);
    return { ok: true };
  }

  /** Extra MonthFacts reserve — loan payments not already in fixed commitments. */
  async extraReserveForMonth(userId: string, month: string) {
    const rows = await this.prisma.loan.findMany({
      where: { userId, active: true },
    });
    let sum = 0;
    for (const r of rows) {
      if (!(Number(r.principalBalance) > 0.001)) continue;
      sum += loanReserveAmount(r, month);
    }
    return round2(sum);
  }

  private serialize(r: {
    id: string;
    name: string;
    provider: string | null;
    originalAmount: Prisma.Decimal | number;
    principalBalance: Prisma.Decimal | number;
    monthlyPayment: Prisma.Decimal | number;
    aprPercent: number | null;
    startDate: Date | null;
    endDate: Date | null;
    nextDueDate: Date | null;
    linkedCommitmentId: string | null;
    notes: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const original = Number(r.originalAmount);
    const principal = Number(r.principalBalance);
    const repaid = Math.max(0, original - principal);
    const progressPct =
      original > 0
        ? Math.min(100, Math.round((repaid / original) * 100))
        : 0;
    const monthly = Number(r.monthlyPayment);
    const remainingPayments =
      monthly > 0 ? Math.ceil(principal / monthly) : null;

    /** Rough monthly interest on remaining principal (APR / 12). Guidance only. */
    const estimatedMonthlyInterest =
      r.aprPercent != null && r.aprPercent >= 0 && principal > 0
        ? round2((principal * r.aprPercent) / 100 / 12)
        : null;
    const estimatedPrincipalInPayment =
      estimatedMonthlyInterest != null && monthly > 0
        ? round2(Math.max(0, monthly - estimatedMonthlyInterest))
        : null;

    return {
      id: r.id,
      name: r.name,
      provider: r.provider,
      originalAmount: original,
      principalBalance: principal,
      monthlyPayment: monthly,
      aprPercent: r.aprPercent,
      startDate: r.startDate ? r.startDate.toISOString() : null,
      endDate: r.endDate ? r.endDate.toISOString() : null,
      nextDueDate: r.nextDueDate ? r.nextDueDate.toISOString() : null,
      linkedCommitmentId: r.linkedCommitmentId,
      notes: r.notes,
      active: r.active,
      derived: false as boolean,
      repaidAmount: round2(repaid),
      progressPct,
      remainingPayments,
      estimatedMonthlyInterest,
      estimatedPrincipalInPayment,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
