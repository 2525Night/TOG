export type RoeyJourneyStage =
  | "INTRODUCTION"
  | "BASELINE"
  | "ESTABLISHED"
  | "RETURNING";

export type RoeySeverity = "INFO" | "WARNING" | "CRITICAL";
export type RoeyConfidence = "LOW" | "MEDIUM" | "HIGH";

export type RoeyJourney = {
  stage: RoeyJourneyStage;
  titleHe: string;
  messageHe: string;
  completedMonths: number;
  reliableMonths: number;
  daysSinceRegistration: number;
  daysSinceLastActivity: number | null;
  signalsReliable: boolean;
};

export type RoeyForecastPoint = {
  days: 30 | 60 | 90;
  projectedAvailable: number;
};

export type RoeyForecastScenario = {
  id: "POSITIVE" | "BASE" | "STRESS";
  labelHe: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  points: RoeyForecastPoint[];
};

export type RoeyForecast = {
  currency: "ILS";
  computedAt: string;
  startingAvailable: number;
  confidence: RoeyConfidence;
  assumptionsHe: string[];
  scenarios: RoeyForecastScenario[];
};

export type RoeyRisk = {
  severity: RoeySeverity;
  titleHe: string;
  messageHe: string;
  amountIls: number | null;
  horizonDays: number | null;
};

export type RoeyFact = {
  id: string;
  labelHe: string;
  value: number | string;
  displayHe: string;
  source: string;
};

export type RoeyAgentOutput = {
  messageHe: string;
  recommendationHe: string | null;
  alternativesHe: string[];
  questionHe: string | null;
  confidence: RoeyConfidence;
};

export type RoeyChatResponse = {
  conversationId: string;
  message: RoeyAgentOutput;
  severity: RoeySeverity;
  risk: RoeyRisk;
  journey: RoeyJourney;
  factsUsed: RoeyFact[];
  forecast: RoeyForecast;
  modelId: string;
};

export const ROEY_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "messageHe",
    "recommendationHe",
    "alternativesHe",
    "questionHe",
    "confidence",
  ],
  properties: {
    messageHe: {
      type: "string",
      description: "תשובה קצרה, אכפתית וישירה בעברית.",
    },
    recommendationHe: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    alternativesHe: {
      type: "array",
      maxItems: 2,
      items: { type: "string" },
    },
    questionHe: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    confidence: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH"],
    },
  },
} as const;
