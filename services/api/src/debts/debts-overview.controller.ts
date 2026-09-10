import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, AuthUser } from "../auth/current-user.decorator";
import { LoansService } from "../loans/loans.service";
import { CreditCardsService } from "../credit-cards/credit-cards.service";
import { MonthFactsService } from "../month-facts/month-facts.service";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

@Controller("debts")
@UseGuards(JwtAuthGuard)
export class DebtsOverviewController {
  constructor(
    private readonly loans: LoansService,
    private readonly cards: CreditCardsService,
    private readonly monthFacts: MonthFactsService,
  ) {}

  @Get("overview")
  async overview(
    @CurrentUser() user: AuthUser,
    @Query("month") month?: string,
  ) {
    const [loans, cards, facts] = await Promise.all([
      this.loans.list(user.ledgerUserId, month),
      this.cards.list(user.ledgerUserId, month),
      this.monthFacts.forMonth(user.ledgerUserId, month),
    ]);

    const loansThisMonth = loans.totals.monthlyPayment;
    const cardsThisMonth = cards.totals.upcomingCharges;
    const attention: Array<{ kind: string; titleHe: string; bodyHe: string }> =
      [];

    if (cards.totals.utilizationPct >= 70) {
      attention.push({
        kind: "card_utilization",
        titleHe: "ניצול אשראי גבוה",
        bodyHe: `ניצול כולל של ${cards.totals.utilizationPct}% ממסגרת האשראי.`,
      });
    }
    if (
      loans.totals.nextPaymentDate &&
      loans.totals.nextPaymentAmount != null
    ) {
      const d = new Date(loans.totals.nextPaymentDate);
      const days =
        (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (days >= 0 && days <= 7) {
        attention.push({
          kind: "loan_due_soon",
          titleHe: "תשלום הלוואה קרוב",
          bodyHe: `תשלום של ₪${loans.totals.nextPaymentAmount.toLocaleString("he-IL")} בקרוב.`,
        });
      }
    }

    return {
      month: loans.month,
      loans: {
        principal: loans.totals.principal,
        original: loans.totals.original,
        repaid: loans.totals.repaid,
        monthlyPayment: loans.totals.monthlyPayment,
        activeCount: loans.totals.activeCount,
        nextPaymentAmount: loans.totals.nextPaymentAmount,
        nextPaymentDate: loans.totals.nextPaymentDate,
        overdraft:
          facts.checkingBalanceNow < 0
            ? Math.abs(facts.checkingBalanceNow)
            : null,
      },
      creditCards: {
        cycleSpend: cards.totals.cycleSpend,
        upcomingCharges: cards.totals.upcomingCharges,
        availableCredit: cards.totals.availableCredit,
        creditLimit: cards.totals.creditLimit ?? 0,
        utilizationPct: cards.totals.utilizationPct,
        activeCount: cards.totals.activeCount,
        installmentCommitment: cards.totals.installmentCommitment,
      },
      upcomingObligations: {
        loansThisMonth: round2(loansThisMonth),
        creditCardCharges: round2(cardsThisMonth),
        total: round2(loansThisMonth + cardsThisMonth),
      },
      attention,
    };
  }
}
