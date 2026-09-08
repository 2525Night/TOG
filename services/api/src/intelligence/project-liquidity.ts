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
 * Does not linear-extrapolate expense (avoids CARD_PURCHASE inflation).
 */
export function projectLiquidity(
  input: LiquidityProjectionInput,
): LiquidityProjection {
  const remainingFixed = Math.max(0, input.remainingFixed);
  const remainingFlexibleGuess = Math.max(0, input.remainingFlexibleGuess);
  const projectedOutflow = remainingFixed + remainingFlexibleGuess;
  const base = input.availableInPractice;
  const endBalanceProjected = base - projectedOutflow;

  if (input.checkingBalanceNow < 0) {
    return {
      projectedOutflow,
      endBalanceProjected,
      level: "high",
      alreadyNegative: true,
      messageHe: `בחשבון יש מינוס של כ־₪${round0(Math.abs(input.checkingBalanceNow)).toLocaleString("he-IL")}. כדאי לייצב את התזרים לפני הוצאות חדשות.`,
    };
  }

  if (!input.isCurrentMonth) {
    return {
      projectedOutflow,
      endBalanceProjected: base,
      level: "low",
      alreadyNegative: false,
      messageHe: "לפי הנתונים הזמינים — התזרים נראה יציב.",
    };
  }

  if (endBalanceProjected < 0) {
    if (remainingFixed > 0) {
      return {
        projectedOutflow,
        endBalanceProjected,
        level: "high",
        alreadyNegative: false,
        messageHe: `אחרי הקבועים שנותרו, הזמין בפועל עלול לרדת למינוס של כ־₪${round0(Math.abs(endBalanceProjected)).toLocaleString("he-IL")} עד סוף החודש.`,
      };
    }
    return {
      projectedOutflow,
      endBalanceProjected,
      level: "medium",
      alreadyNegative: false,
      messageHe:
        "בקצב הגמיש הנוכחי הזמין בפועל עלול להצטמצם עד סוף החודש — כדאי לעקוב בלי לחץ.",
    };
  }

  if (endBalanceProjected < Math.max(base * 0.15, 500)) {
    return {
      projectedOutflow,
      endBalanceProjected,
      level: "medium",
      alreadyNegative: false,
      messageHe:
        "לקראת סוף החודש הזמין בפועל עלול להיות דק — כדאי להאט הוצאות גמישות.",
    };
  }

  return {
    projectedOutflow,
    endBalanceProjected,
    level: "low",
    alreadyNegative: false,
    messageHe: "לפי הנתונים הזמינים — התזרים נראה יציב.",
  };
}
