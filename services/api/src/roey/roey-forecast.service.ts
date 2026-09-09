import { Injectable } from "@nestjs/common";
import type {
  RoeyConfidence,
  RoeyForecast,
  RoeyForecastScenario,
  RoeyRisk,
} from "./roey.types";

export type RoeyForecastInput = {
  startingAvailable: number;
  expectedIncome: number;
  expectedFixedExpenses: number;
  expectedFlexibleExpenses: number;
  completeness: number;
  signalsReliable: boolean;
};

@Injectable()
export class RoeyForecastService {
  build(input: RoeyForecastInput) {
    return computeRoeyForecast(input);
  }

  risk(forecast: RoeyForecast): RoeyRisk {
    return classifyRoeyRisk(forecast);
  }
}

export function computeRoeyForecast(
  input: RoeyForecastInput,
): RoeyForecast {
  const income = positive(input.expectedIncome);
  const expenses =
    positive(input.expectedFixedExpenses) +
    positive(input.expectedFlexibleExpenses);
  const confidence: RoeyConfidence =
    input.signalsReliable && input.completeness >= 70
      ? "HIGH"
      : input.completeness >= 45
        ? "MEDIUM"
        : "LOW";

  const scenarios: RoeyForecastScenario[] = [
    scenario(
      "POSITIVE",
      "תרחיש חיובי",
      input.startingAvailable,
      income * 1.03,
      expenses * 0.95,
    ),
    scenario(
      "BASE",
      "תרחיש בסיס",
      input.startingAvailable,
      income,
      expenses,
    ),
    scenario(
      "STRESS",
      "תרחיש לחץ",
      input.startingAvailable,
      income * 0.9,
      expenses * 1.1,
    ),
  ];

  return {
    currency: "ILS",
    computedAt: new Date().toISOString(),
    startingAvailable: money(input.startingAvailable),
    confidence,
    assumptionsHe: [
      "התחזית מבוססת על הנתונים הקיימים ב-MoneyTail ולא על הבטחה לתוצאה.",
      "תרחיש הבסיס מניח שהכנסות והוצאות חודשיות יישארו דומות.",
      "תרחיש הלחץ מניח ירידה של 10% בהכנסה ועלייה של 10% בהוצאות.",
    ],
    scenarios,
  };
}

export function classifyRoeyRisk(forecast: RoeyForecast): RoeyRisk {
  const base = forecast.scenarios.find((item) => item.id === "BASE");
  const stress = forecast.scenarios.find((item) => item.id === "STRESS");
  const firstBaseNegative = base?.points.find(
    (point) => point.projectedAvailable < 0,
  );
  const firstStressNegative = stress?.points.find(
    (point) => point.projectedAvailable < 0,
  );

  if (forecast.startingAvailable < 0 || firstBaseNegative?.days === 30) {
    const amount = Math.abs(
      Math.min(
        forecast.startingAvailable,
        firstBaseNegative?.projectedAvailable ?? 0,
      ),
    );
    return {
      severity: "CRITICAL",
      titleHe: "נדרש טיפול בתזרים",
      messageHe:
        "הנתונים הקיימים מצביעים על זמין שלילי עכשיו או בתוך 30 יום.",
      amountIls: money(amount),
      horizonDays: forecast.startingAvailable < 0 ? 0 : 30,
    };
  }

  if (firstBaseNegative || firstStressNegative) {
    const point = firstBaseNegative ?? firstStressNegative;
    return {
      severity: "WARNING",
      titleHe: "כדאי לחזק את מרווח הביטחון",
      messageHe:
        forecast.confidence === "LOW"
          ? "קיים תרחיש של יתרה שלילית, אך התמונה עדיין חלקית."
          : "אחד התרחישים מצביע על יתרה שלילית בתקופת התחזית.",
      amountIls: point ? money(Math.abs(point.projectedAvailable)) : null,
      horizonDays: point?.days ?? null,
    };
  }

  return {
    severity: "INFO",
    titleHe: "לא זוהה סיכון תזרימי מיידי",
    messageHe:
      forecast.confidence === "LOW"
        ? "לא זוהה סיכון מיידי, אך נדרש עוד מידע כדי לחזק את התחזית."
        : "לפי הנתונים הקיימים, הזמין נשאר חיובי בתרחישי הבסיס והלחץ.",
    amountIls: null,
    horizonDays: null,
  };
}

function scenario(
  id: RoeyForecastScenario["id"],
  labelHe: string,
  startingAvailable: number,
  monthlyIncome: number,
  monthlyExpenses: number,
): RoeyForecastScenario {
  const monthlyNet = monthlyIncome - monthlyExpenses;
  return {
    id,
    labelHe,
    monthlyIncome: money(monthlyIncome),
    monthlyExpenses: money(monthlyExpenses),
    points: ([30, 60, 90] as const).map((days) => ({
      days,
      projectedAvailable: money(
        startingAvailable + monthlyNet * (days / 30),
      ),
    })),
  };
}

function positive(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}
