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
import {
  loanReserveAmount,
  monthKeyOf,
} from "../loans/loan-reserve";
import { TtlMemo } from "./ttl-memo";

@Injectable()
export class MonthFactsService {
  private readonly monthMemo = new TtlMemo<MonthFacts>(3_000);
  private readonly seriesMemo = new TtlMemo<MonthFacts[]>(3_000);

  constructor(private readonly prisma: PrismaService) {}

  /** Drop cached facts after any money-mutating write for this user. */
  invalidateUser(userId: string) {
    this.monthMemo.invalidatePrefix(`${userId}:`);
    this.seriesMemo.invalidatePrefix(`${userId}:`);
  }

  /** Canonical monthly numbers for one user + month. */
  async forMonth(userId: string, month?: string): Promise<MonthFacts> {
    const focus = resolveMonthKey(month);
    return this.monthMemo.getOrSet(`${userId}:${focus}`, () =>
      this.computeForMonth(userId, focus),
    );
  }

  private async computeForMonth(
    userId: string,
    focus: string,
  ): Promise<MonthFacts> {
    const { start, end } = monthBounds(focus);

    const [txs, commitments, settings, userCats, accounts, loans, cards] =
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
        this.prisma.loan.findMany({
          where: { userId, active: true },
        }),
        this.prisma.creditCard.findMany({
          where: { userId, active: true },
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
      extraObligationReserve: sumUnlinkedObligationReserve(
        loans,
        cards,
        focus,
      ),
    });

    assertMonthFactsInvariants(facts);
    // Warm single-month slot from this compute as well
    return facts;
  }

  /** Efficient multi-month series sharing commitments / categories / balance. */
  async series(
    userId: string,
    months: string[],
  ): Promise<MonthFacts[]> {
    if (months.length === 0) return [];
    const sorted = [...months].sort();
    const seriesKey = `${userId}:series:${sorted.join(",")}`;
    return this.seriesMemo.getOrSet(seriesKey, async () => {
      const list = await this.computeSeries(userId, sorted);
      // Also seed per-month memo so forMonth(focus) hits in the same request.
      for (const f of list) {
        this.monthMemo.getOrSet(`${userId}:${f.month}`, async () => f);
      }
      return list;
    });
  }

  private async computeSeries(
    userId: string,
    sorted: string[],
  ): Promise<MonthFacts[]> {
    const first = monthBounds(sorted[0]);
    const last = monthBounds(sorted[sorted.length - 1]);

    const [txs, commitments, settings, userCats, accounts, loans, cards] =
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
        this.prisma.loan.findMany({
          where: { userId, active: true },
        }),
        this.prisma.creditCard.findMany({
          where: { userId, active: true },
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
        extraObligationReserve: sumUnlinkedObligationReserve(
          loans,
          cards,
          m,
        ),
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

function sumUnlinkedObligationReserve(
  loans: Array<{
    principalBalance: unknown;
    monthlyPayment: unknown;
    nextDueDate: Date | null;
    linkedCommitmentId: string | null;
  }>,
  cards: Array<{
    currentBalance: unknown;
    nextBillingDate: Date | null;
    linkedCommitmentId: string | null;
  }>,
  month: string,
) {
  let sum = 0;
  for (const r of loans) {
    sum += loanReserveAmount(r, month);
  }
  for (const c of cards) {
    if (c.linkedCommitmentId) continue;
    if (c.nextBillingDate && monthKeyOf(c.nextBillingDate) !== month) {
      continue;
    }
    const bal = Number(c.currentBalance);
    if (bal > 0) sum += bal;
  }
  return Math.round(sum * 100) / 100;
}
