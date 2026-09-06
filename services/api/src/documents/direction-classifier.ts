export type TxDirection = "INCOME" | "EXPENSE" | "TRANSFER";

export type DirectionResult = {
  direction: TxDirection;
  confidence: number;
  evidence: string[];
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
 */
export function classifyDirection(input: ClassifyInput): DirectionResult {
  let scoreIncome = 0;
  let scoreExpense = 0;
  let scoreTransfer = 0;
  const evidence: string[] = [];

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
  }

  const desc = input.description || "";
  if (TRANSFER_HINT.test(desc)) {
    scoreTransfer += 0.9;
    evidence.push("lex:transfer");
  }
  if (P0_EXPENSE.test(desc)) {
    scoreExpense += 0.85;
    evidence.push("lex:p0-expense");
  }
  if (P0_INCOME.test(desc)) {
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

  if (
    input.balance != null &&
    input.prevBalance != null &&
    Number.isFinite(input.balance) &&
    Number.isFinite(input.prevBalance)
  ) {
    const delta = input.balance - input.prevBalance;
    if (Math.abs(Math.abs(delta) - input.amount) < 0.05) {
      if (delta > 0) {
        scoreIncome += 0.45;
        evidence.push("bal:+");
      } else if (delta < 0) {
        scoreExpense += 0.45;
        evidence.push("bal:-");
      }
    }
  }

  if (input.rememberedDirection === "INCOME") {
    scoreIncome += 0.9;
    evidence.push("mem:income");
  } else if (input.rememberedDirection === "EXPENSE") {
    scoreExpense += 0.9;
    evidence.push("mem:expense");
  } else if (input.rememberedDirection === "TRANSFER") {
    scoreTransfer += 0.9;
    evidence.push("mem:transfer");
  }

  // P0 expense beats P1 income on conflict already via weights; explicit guard:
  if (P0_EXPENSE.test(desc) && P1_INCOME.test(desc)) {
    scoreExpense += 0.2;
    evidence.push("conflict:expense-wins");
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
    direction = "EXPENSE";
    evidence.push("fallback:expense");
  }

  const confidence = Math.min(1, Math.max(0.05, margin || best.s || 0.1));
  return { direction, confidence: Math.round(confidence * 100) / 100, evidence };
}
