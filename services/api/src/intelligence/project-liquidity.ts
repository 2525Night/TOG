export type LiquidityProjectionInput = {
  checkingBalanceNow: number;
  availableInPractice: number;
  remainingFixed: number;
  remainingFlexibleGuess: number;
  isCurrentMonth: boolean;
};

export type LiquidityProjection = {
  projectedOutflow: number;
  endBalanceProjected: number;
  level: "high" | "medium" | "low";
  alreadyNegative: boolean;
  messageHe: string;
};

function round0(n: number) {
  return Math.round(n);
}

/**
 * Cash-oriented month-end liquidity signal.
 * availableInPractice already nets remainingFixed from checking —
 * project only additional flexible spend on top of that base.
 */
export function projectLiquidity(
  input: LiquidityProjectionInput,
): LiquidityProjection {
  const remainingFixed = Math.max(0, input.remainingFixed);
  const remainingFlexibleGuess = Math.max(0, input.remainingFlexibleGuess);
  // Fixed is already reserved inside availableInPractice — do not subtract again.
  const projectedOutflow = remainingFlexibleGuess;
  const base = input.availableInPractice;
  const endBalanceProjected = base - projectedOutflow;

  if (input.checkingBalanceNow < 0) {
    return {
      projectedOutflow: remainingFixed + remainingFlexibleGuess,
      endBalanceProjected,
      level: "high",
      alreadyNegative: true,
      messageHe: `בחשבון יש מינוס של כ־₪${round0(Math.abs(input.checkingBalanceNow)).toLocaleString("he-IL")}. כדאי לייצב את התזרים לפני הוצאות חדשות.`,
    };
  }

  if (!input.isCurrentMonth) {
    return {
      projectedOutflow: remainingFixed + remainingFlexibleGuess,
      endBalanceProjected: base,
      level: "low",
      alreadyNegative: false,
      messageHe: "לפי הנתונים הזמינים — התזרים נראה יציב.",
    };
  }

  if (base < 0) {
    return {
      projectedOutflow: remainingFixed + remainingFlexibleGuess,
      endBalanceProjected: base,
      level: "high",
      alreadyNegative: false,
      messageHe: `אחרי שמור לתשלומים, הזמין בפועל כרגע במינוס של כ־₪${round0(Math.abs(base)).toLocaleString("he-IL")} — כדאי לעדכן תנועות או להקטין התחייבויות.`,
    };
  }

  if (endBalanceProjected < 0) {
    return {
      projectedOutflow: remainingFixed + remainingFlexibleGuess,
      endBalanceProjected,
      level: "medium",
      alreadyNegative: false,
      messageHe:
        "בקצב הגמיש הנוכחי הזמין בפועל עלול להצטמצם עד סוף החודש — כדאי לעקוב בלי לחץ.",
    };
  }

  if (endBalanceProjected < Math.max(base * 0.15, 500)) {
    return {
      projectedOutflow: remainingFixed + remainingFlexibleGuess,
      endBalanceProjected,
      level: "medium",
      alreadyNegative: false,
      messageHe:
        "לקראת סוף החודש הזמין בפועל עלול להיות דק — כדאי להאט הוצאות גמישות.",
    };
  }

  return {
    projectedOutflow: remainingFixed + remainingFlexibleGuess,
    endBalanceProjected,
    level: "low",
    alreadyNegative: false,
    messageHe: "לפי הנתונים הזמינים — התזרים נראה יציב.",
  };
}
