import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  computeMonthFacts,
  monthBounds,
  resolveMonthKey,
  toBudgetSnapshot,
  type MonthCommitmentInput,
  type MonthTxInput,
} from "./compute";
import { assertMonthFactsInvariants } from "./invariants";
import type { MonthFacts } from "./types";
import { MONTH_VOCAB } from "./vocab";

@Injectable()
export class MonthFactsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Canonical monthly numbers for one user + month. */
  async forMonth(userId: string, month?: string): Promise<MonthFacts> {
    const focus = resolveMonthKey(month);
    const { start, end } = monthBounds(focus);

    const [txs, commitments, settings, userCats, accounts] =
      await Promise.all([
        this.prisma.transaction.findMany({
          where: { userId, bookedAt: { gte: start, lt: end } },
        }),
        this.prisma.budgetCommitment.findMany({
          where: { userId, active: true },
        }),
        this.prisma.userBudgetSettings.findUnique({ where: { userId } }),
        this.prisma.userCategory.findMany({ where: { userId } }),
        this.prisma.financialAccount.findMany({
          where: { userId, isActive: true },
        }),
      ]);

    const bankAccounts = accounts.filter((a) => a.kind === "BANK");
    const balanceAccounts =
      bankAccounts.length > 0 ? bankAccounts : accounts;
    const checkingBalanceNow = balanceAccounts.reduce(
      (s, a) => s + Number(a.currentBalance),
      0,
    );

    const facts = computeMonthFacts({
      month: focus,
      start,
      end,
      txs: txs as MonthTxInput[],
      commitments: commitments as MonthCommitmentInput[],
      userCats,
      flexibleCap:
        settings?.flexibleCap != null ? Number(settings.flexibleCap) : null,
      checkingBalanceNow,
      hasCheckingAccount: balanceAccounts.length > 0,
    });

    assertMonthFactsInvariants(facts);
    return facts;
  }

  /** Efficient multi-month series sharing commitments / categories / balance. */
  async series(
    userId: string,
    months: string[],
  ): Promise<MonthFacts[]> {
    if (months.length === 0) return [];
    const sorted = [...months].sort();
    const first = monthBounds(sorted[0]);
    const last = monthBounds(sorted[sorted.length - 1]);

    const [txs, commitments, settings, userCats, accounts] =
      await Promise.all([
        this.prisma.transaction.findMany({
          where: {
            userId,
            bookedAt: { gte: first.start, lt: last.end },
          },
        }),
        this.prisma.budgetCommitment.findMany({
          where: { userId, active: true },
        }),
        this.prisma.userBudgetSettings.findUnique({ where: { userId } }),
        this.prisma.userCategory.findMany({ where: { userId } }),
        this.prisma.financialAccount.findMany({
          where: { userId, isActive: true },
        }),
      ]);

    const bankAccounts = accounts.filter((a) => a.kind === "BANK");
    const balanceAccounts =
      bankAccounts.length > 0 ? bankAccounts : accounts;
    const checkingBalanceNow = balanceAccounts.reduce(
      (s, a) => s + Number(a.currentBalance),
      0,
    );
    const flexibleCap =
      settings?.flexibleCap != null ? Number(settings.flexibleCap) : null;

    return sorted.map((m) => {
      const { start, end } = monthBounds(m);
      const monthTxs = txs.filter((t) => {
        const d = new Date(t.bookedAt);
        return d >= start && d < end;
      });
      const facts = computeMonthFacts({
        month: m,
        start,
        end,
        txs: monthTxs as MonthTxInput[],
        commitments: commitments as MonthCommitmentInput[],
        userCats,
        flexibleCap,
        checkingBalanceNow,
        hasCheckingAccount: balanceAccounts.length > 0,
      });
      assertMonthFactsInvariants(facts);
      return facts;
    });
  }

  async asBudgetSnapshot(userId: string, month?: string) {
    return toBudgetSnapshot(await this.forMonth(userId, month));
  }

  vocab() {
    return MONTH_VOCAB;
  }
}
