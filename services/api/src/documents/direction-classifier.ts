export type TxDirection = "INCOME" | "EXPENSE" | "TRANSFER";

export type DirectionResult = {
  direction: TxDirection;
  confidence: number;
  evidence: string[];
  /** Ambiguous / conflicting signals — UI should highlight for review */
  needsReview?: boolean;
};

type ClassifyInput = {
  description: string;
  amount: number;
  credit?: number | null;
  debit?: number | null;
  balance?: number | null;
  prevBalance?: number | null;
  /** Prior user-confirmed direction for same merchantNorm */
  rememberedDirection?: TxDirection | null;
  /** Explicit CSV type cell */
  typeHint?: string | null;
};

const P0_EXPENSE =
  /כרטיס|אשראי|משיכת|עמל|החזרת הרשאה|פרעון|הלווא|מימון|סילוק|ויזה|מקס |כאל|ישראכרט|העברה לפיגור|ביטוח לאומי|חובה|הרשאה ישראכרט|debit|expense/i;

const P0_INCOME =
  /משכורת|שכר\b|קצבת|יומן זכות|זיכוי|הפקדת שיק|זכות|salary|income|credit\b/i;

const P1_INCOME =
  /העברה דיגיטל|הפקד|תקבול|החזר מס|העברה מ/i;

const P1_EXPENSE =
  /הוראת קבע|בזק|סלקום|פרטנר|ביטוח|הוט(?!\s*מובייל)/i;

const TRANSFER_HINT =
  /העברה בין|בין חשבונות|transfer|העברה עצמית|לחשבון שלי/i;

/**
 * Multi-signal income/expense/transfer classifier (MoneyTail LLD).
 * Balance Δ that matches amount is a strong signal (statement truth).
 */
export function classifyDirection(input: ClassifyInput): DirectionResult {
  let scoreIncome = 0;
  let scoreExpense = 0;
  let scoreTransfer = 0;
  const evidence: string[] = [];
  let needsReview = false;

  const type = (input.typeHint || "").toLowerCase();
  if (type) {
    if (/income|credit|הכנס|זכות|in\b/.test(type)) {
      scoreIncome += 1;
      evidence.push("type:income");
    } else if (/expense|debit|הוצ|חובה|out\b/.test(type)) {
      scoreExpense += 1;
      evidence.push("type:expense");
    } else if (/transfer|העברה/.test(type)) {
      scoreTransfer += 1;
      evidence.push("type:transfer");
    }
  }

  const credit = input.credit != null ? Number(input.credit) : null;
  const debit = input.debit != null ? Number(input.debit) : null;
  if (credit != null && debit != null) {
    if (credit > 0 && !(debit > 0)) {
      scoreIncome += 1;
      evidence.push("col:credit");
    } else if (debit > 0 && !(credit > 0)) {
      scoreExpense += 1;
      evidence.push("col:debit");
    }
  } else if (credit != null && credit > 0 && (debit == null || !(debit > 0))) {
    scoreIncome += 1;
    evidence.push("col:credit");
  } else if (debit != null && debit > 0 && (credit == null || !(credit > 0))) {
    scoreExpense += 1;
    evidence.push("col:debit");
  }

  const desc = input.description || "";
  const hasP0Expense = P0_EXPENSE.test(desc);
  const hasP0Income = P0_INCOME.test(desc);

  if (TRANSFER_HINT.test(desc)) {
    scoreTransfer += 0.9;
    evidence.push("lex:transfer");
  }
  if (hasP0Expense) {
    scoreExpense += 0.85;
    evidence.push("lex:p0-expense");
  }
  if (hasP0Income) {
    scoreIncome += 0.85;
    evidence.push("lex:p0-income");
  }
  if (P1_INCOME.test(desc)) {
    scoreIncome += 0.55;
    evidence.push("lex:p1-income");
  }
  if (P1_EXPENSE.test(desc)) {
    scoreExpense += 0.55;
    evidence.push("lex:p1-expense");
  }

  let balanceDir: TxDirection | null = null;
  let balanceAuthoritative = false;
  if (
    input.balance != null &&
    input.prevBalance != null &&
    Number.isFinite(input.balance) &&
    Number.isFinite(input.prevBalance) &&
    Number.isFinite(input.amount) &&
    input.amount >= 0.01
  ) {
    const delta = input.balance - input.prevBalance;
    if (Math.abs(Math.abs(delta) - input.amount) < 0.05) {
      // Statement math: running balance moved by exactly this amount.
      // This is definitive for money-in vs money-out on this account.
      balanceAuthoritative = true;
      if (delta > 0) {
        balanceDir = "INCOME";
        scoreIncome += 1.0;
        evidence.push("bal:+");
      } else if (delta < 0) {
        balanceDir = "EXPENSE";
        scoreExpense += 1.0;
        evidence.push("bal:-");
      }
    }
  }

  if (balanceAuthoritative && balanceDir) {
    return {
      direction: balanceDir,
      confidence: 1,
      evidence: [...evidence, "bal:authoritative"],
    };
  }

  // Memory is helpful but must not silently override a matching balance Δ.
  const mem = input.rememberedDirection;
  if (mem === "INCOME") {
    if (balanceDir && balanceDir !== "INCOME") {
      evidence.push("mem:income-skipped");
      needsReview = true;
    } else {
      scoreIncome += 0.9;
      evidence.push("mem:income");
    }
  } else if (mem === "EXPENSE") {
    if (balanceDir && balanceDir !== "EXPENSE") {
      evidence.push("mem:expense-skipped");
      needsReview = true;
    } else {
      scoreExpense += 0.9;
      evidence.push("mem:expense");
    }
  } else if (mem === "TRANSFER") {
    if (balanceDir) {
      evidence.push("mem:transfer-skipped");
      needsReview = true;
    } else {
      scoreTransfer += 0.9;
      evidence.push("mem:transfer");
    }
  }

  // P0 expense beats P1 income on conflict already via weights; explicit guard:
  if (hasP0Expense && P1_INCOME.test(desc)) {
    scoreExpense += 0.2;
    evidence.push("conflict:expense-wins");
  }

  // Balance matches amount but strong opposing P0 lexicon — keep both, flag review
  if (balanceDir === "INCOME" && hasP0Expense && !hasP0Income) {
    needsReview = true;
    evidence.push("conflict:bal-vs-lex");
  } else if (balanceDir === "EXPENSE" && hasP0Income && !hasP0Expense) {
    needsReview = true;
    evidence.push("conflict:bal-vs-lex");
  }

  // Matching balance Δ wins over weaker competing scores
  if (balanceDir === "INCOME" && scoreIncome >= scoreExpense && scoreIncome >= scoreTransfer) {
    // already leading
  } else if (
    balanceDir === "INCOME" &&
    scoreExpense > scoreIncome &&
    !hasP0Expense
  ) {
    scoreIncome = Math.max(scoreIncome, scoreExpense + 0.15);
    evidence.push("rule:bal-wins");
  } else if (
    balanceDir === "EXPENSE" &&
    scoreIncome > scoreExpense &&
    !hasP0Income
  ) {
    scoreExpense = Math.max(scoreExpense, scoreIncome + 0.15);
    evidence.push("rule:bal-wins");
  }

  const scores: Array<{ d: TxDirection; s: number }> = [
    { d: "INCOME" as const, s: scoreIncome },
    { d: "EXPENSE" as const, s: scoreExpense },
    { d: "TRANSFER" as const, s: scoreTransfer },
  ].sort((a, b) => b.s - a.s);

  const best = scores[0];
  const second = scores[1]?.s ?? 0;
  const margin = best.s - second;

  let direction: TxDirection = best.d;
  if (best.s < 0.15 || margin < 0.15) {
    direction = balanceDir || "EXPENSE";
    evidence.push(balanceDir ? "fallback:bal" : "fallback:ambiguous");
    needsReview = true;
  }

  let confidence = Math.min(1, Math.max(0.05, margin || best.s || 0.1));
  if (needsReview) {
    confidence = Math.min(confidence, 0.42);
  }

  return {
    direction,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    needsReview: needsReview || undefined,
  };
}
