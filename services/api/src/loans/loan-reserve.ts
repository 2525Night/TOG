/**
 * Shared rule: when does a loan count toward MonthFacts reserve /
 * "תשלומים קרובים" totals.
 */
export function monthKeyOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type LoanReserveInput = {
  principalBalance: unknown;
  monthlyPayment: unknown;
  nextDueDate: Date | string | null;
  linkedCommitmentId?: string | null;
};

/** True when this loan still reserves cash in the focus month. */
export function loanCountsTowardReserve(
  loan: LoanReserveInput,
  month: string,
): boolean {
  const principal = Number(loan.principalBalance);
  if (!(principal > 0.001)) return false;
  const pay = Number(loan.monthlyPayment);
  if (!(pay > 0)) return false;
  if (loan.linkedCommitmentId) return false;
  if (loan.nextDueDate) {
    const d =
      loan.nextDueDate instanceof Date
        ? loan.nextDueDate
        : new Date(loan.nextDueDate);
    if (!Number.isNaN(d.getTime()) && monthKeyOf(d) !== month) return false;
  }
  return true;
}

export function loanReserveAmount(loan: LoanReserveInput, month: string) {
  if (!loanCountsTowardReserve(loan, month)) return 0;
  return Math.round(Number(loan.monthlyPayment) * 100) / 100;
}
